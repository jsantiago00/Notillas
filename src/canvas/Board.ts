import { bboxOf, type Rect } from '../model/geometry'
import { newPage } from '../model/memoryNotes'
import type { Background, Page, Stroke } from '../model/types'
import { InputController, type InputSink, type PointerDebug, type Sample } from './InputController'
import { contentRect, layoutPages, pageAt } from './layout'
import { Renderer, type LiveStroke } from './Renderer'
import { outlineOf, pathFromOutline, primeStrokePath } from './strokeOutline'
import { Viewport } from './Viewport'

export interface BoardOptions {
  fingerDraws: () => boolean
  onPenDetected: () => void
  /** Cambió el zoom (relativo a «ajustado al ancho»: 1 = 100 %) */
  onZoom?: (relative: number) => void
  onDebug?: (info: PointerDebug) => void
  /** Cambió la página que está en el centro de la vista, o la cantidad de páginas */
  onPage?: (index: number, total: number) => void
  pen: { color: string; size: number }
}

interface Live extends LiveStroke {
  page: number
  t0: number
}

/** Si redibujar la tinta tarda más que esto, durante los gestos se mueve el bitmap en vez de redibujar. */
const SLOW_INK_MS = 6
/** Después del último cambio de vista, cuánto esperar para redibujar la tinta nítida. */
const SETTLE_MS = 120

/**
 * El lienzo: une la cámara, el render y la entrada. Es imperativo, fuera del ciclo
 * de React, para no re-renderizar en cada pointermove.
 */
export class Board implements InputSink {
  readonly vp = new Viewport()
  private renderer: Renderer
  private input: InputController
  private rects: Rect[] = []
  private live = new Map<number, Live>()
  private raf = 0
  private lastFrame = 0
  private lastViewChange = 0
  private dirtyView = true
  private dirtyInk = true
  private dirtyLive = false
  private inkPreviewed = false
  private lastInkMs = 0
  private lastZoom = 0
  private lastPage = -1
  private lastTotal = 0
  private sized = false
  private ro: ResizeObserver
  private readonly off: (() => void)[] = []
  private readonly root: HTMLElement
  private readonly pages: Page[]
  private readonly opts: BoardOptions

  constructor(root: HTMLElement, pages: Page[], opts: BoardOptions) {
    this.root = root
    this.pages = pages
    this.opts = opts
    this.renderer = new Renderer(root)
    this.input = new InputController(root, this)
    this.relayout()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(root)
    this.resize()

    const redraw = () => this.invalidate()
    const onVisible = () => document.visibilityState === 'visible' && redraw()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('resize', redraw)
    this.off.push(() => document.removeEventListener('visibilitychange', onVisible))
    this.off.push(() => window.removeEventListener('resize', redraw))
    // El sistema puede descartar el contexto del canvas (poca memoria, segundo plano)
    for (const c of this.renderer.layers) {
      c.addEventListener('contextrestored', redraw)
      this.off.push(() => c.removeEventListener('contextrestored', redraw))
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.input.destroy()
    this.renderer.destroy()
    for (const f of this.off) f()
  }

  fitWidth() {
    this.vp.stopInertia()
    this.vp.fitWidth()
    this.viewChanged()
  }

  /** Índice de la página que ocupa el centro de la vista (o la más cercana). */
  currentPage(): number {
    const [, cy] = this.vp.toWorld(this.vp.width / 2, this.vp.height / 2)
    let best = 0
    let bestDist = Infinity
    this.rects.forEach((r, i) => {
      const d = cy < r.y ? r.y - cy : cy > r.y + r.h ? cy - r.y - r.h : 0
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    return best
  }

  get pageCount(): number {
    return this.pages.length
  }

  background(index: number): Background {
    return this.pages[index].background
  }

  /** Cambia el fondo de una página, o de todas. */
  setBackground(index: number | 'all', bg: Background) {
    const targets = index === 'all' ? this.pages : [this.pages[index]]
    for (const p of targets) p.background = { ...bg }
    this.dirtyView = true
    this.schedule()
  }

  /** Agrega una página al final, con el fondo de la última, y la muestra. */
  addPage() {
    const last = this.pages[this.pages.length - 1]
    this.pages.push(newPage(last.background))
    this.relayout()
    this.scrollToPage(this.pages.length - 1)
  }

  scrollToPage(index: number) {
    const r = this.rects[index]
    if (!r) return
    this.vp.stopInertia()
    this.vp.cam.y = r.y - 24 / this.vp.cam.zoom
    this.vp.clamp()
    this.invalidate()
  }

  /** Redibuja todo (al volver de segundo plano o si se restauró el contexto). */
  invalidate() {
    this.dirtyView = true
    this.dirtyInk = true
    this.dirtyLive = true
    this.schedule()
  }

  private relayout() {
    this.rects = layoutPages(this.pages)
    this.vp.setContent(contentRect(this.rects))
  }

  private resize() {
    const w = this.root.clientWidth
    const h = this.root.clientHeight
    if (w === 0 || h === 0) return
    const { w: pw, h: ph } = this.renderer.size
    const dpr = window.devicePixelRatio || 1
    this.renderer.resize(w, h, dpr)
    const oldWidth = this.vp.width
    this.vp.setSize(w, h)
    if (!this.sized) {
      this.sized = true
      this.vp.fitWidth()
    } else if (pw !== w || ph !== h) {
      // Al rotar la tablet, mantener el mismo ancho relativo
      this.vp.zoomAt(w / oldWidth, 0, 0)
    }
    this.invalidate()
  }

  // ---------- InputSink ----------

  fingerDraws() {
    return this.opts.fingerDraws()
  }

  penDetected() {
    this.opts.onPenDetected()
  }

  debug(info: PointerDebug) {
    this.opts.onDebug?.(info)
  }

  viewChanged() {
    this.lastViewChange = performance.now()
    this.dirtyView = true
    this.schedule()
  }

  beginStroke(id: number, s: Sample, simulated: boolean): boolean {
    const [wx, wy] = this.vp.toWorld(s.x, s.y)
    const page = pageAt(this.rects, wx, wy)
    if (page < 0) return false
    const rect = this.rects[page]
    const { color, size } = this.opts.pen
    this.live.set(id, {
      page,
      rect,
      pts: [wx - rect.x, wy - rect.y, s.p],
      predicted: [],
      size,
      color,
      simulated,
      t0: performance.now(),
    })
    this.dirtyLive = true
    this.schedule()
    return true
  }

  extendStroke(id: number, samples: Sample[], predicted: Sample[]) {
    const l = this.live.get(id)
    if (!l) return
    for (const s of samples) {
      const [x, y] = this.toPage(l, s)
      const n = l.pts.length
      // Puntos repetidos no aportan y engrosan el trazo en perfect-freehand
      if (Math.abs(l.pts[n - 3] - x) < 0.05 && Math.abs(l.pts[n - 2] - y) < 0.05) continue
      l.pts.push(x, y, s.p)
    }
    l.predicted = []
    for (const s of predicted) {
      const [x, y] = this.toPage(l, s)
      l.predicted.push(x, y, s.p)
    }
    this.dirtyLive = true
    this.schedule()
  }

  endStroke(id: number, commit: boolean) {
    const l = this.live.get(id)
    if (!l) return
    this.live.delete(id)
    this.dirtyLive = true
    this.schedule()
    if (!commit) return
    const outline = outlineOf(l.pts, l.size, l.simulated, true)
    const stroke: Stroke = {
      id: newId(),
      tool: 'pen',
      color: l.color,
      size: l.size,
      pts: l.pts,
      simulated: l.simulated,
      bbox: bboxOf(outline.flat(), 2, 1),
    }
    primeStrokePath(stroke, pathFromOutline(outline))
    this.pages[l.page].strokes.push(stroke)
    if (this.inkPreviewed || this.dirtyInk || !this.renderer.appendStroke(this.vp, l.rect, stroke)) this.dirtyInk = true
  }

  strokeInfo(id: number) {
    const l = this.live.get(id)
    return l ? { age: performance.now() - l.t0, points: l.pts.length / 3 } : null
  }

  private toPage(l: Live, s: Sample): [number, number] {
    const [wx, wy] = this.vp.toWorld(s.x, s.y)
    return [wx - l.rect.x, wy - l.rect.y]
  }

  // ---------- Cuadros ----------

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = this.lastFrame ? Math.min(32, now - this.lastFrame) : 16
    this.lastFrame = now
    const vp = this.vp

    if (vp.inertiaActive) {
      vp.stepInertia(dt)
      this.lastViewChange = performance.now()
      this.dirtyView = true
    }

    const moving = this.input.gestureActive || vp.inertiaActive
    if (this.dirtyView) {
      this.dirtyView = false
      this.renderer.drawBackground(vp, this.pages, this.rects)
      // Con mucha tinta, mientras se mueve la vista se desplaza el bitmap; si no, se redibuja
      if (!this.dirtyInk && moving && this.lastInkMs > SLOW_INK_MS && this.renderer.previewInk(vp.cam)) {
        this.inkPreviewed = true
      } else {
        this.dirtyInk = true
      }
      this.dirtyLive = true
    }

    const settled = !moving && performance.now() - this.lastViewChange > SETTLE_MS
    if (this.dirtyInk || (this.inkPreviewed && settled)) {
      this.lastInkMs = this.renderer.drawInk(vp, this.pages, this.rects)
      this.dirtyInk = false
      this.inkPreviewed = false
    }

    if (this.dirtyLive) {
      this.dirtyLive = false
      this.renderer.drawLive(vp.cam, this.live.values())
    }

    if (vp.cam.zoom !== this.lastZoom) {
      this.lastZoom = vp.cam.zoom
      this.opts.onZoom?.(vp.cam.zoom / vp.fitZoom)
    }

    const page = this.currentPage()
    if (page !== this.lastPage || this.pages.length !== this.lastTotal) {
      this.lastPage = page
      this.lastTotal = this.pages.length
      this.opts.onPage?.(page, this.pages.length)
    }

    // Seguir mientras haya inercia o falte el redibujo nítido
    if (vp.inertiaActive || this.inkPreviewed) this.schedule()
    else this.lastFrame = 0
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
