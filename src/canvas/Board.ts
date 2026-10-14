import { bboxOf, bboxUnion, cutPolyline, fractionInside, polylineHitsCircle, transformPts, type Rect } from '../model/geometry'
import type { StrokeChange } from '../model/history'
import { newId, nextZ, type NoteModel } from '../model/note'
import type { BBox, InkTool, Stroke } from '../model/types'
import type { ToolPrefs } from '../lib/toolPrefs'
import { HIGHLIGHTER_OPACITY } from '../lib/toolPrefs'
import { InputController, type InputSink, type PointerDebug, type Sample } from './InputController'
import { contentRect, layoutPages, pageAt } from './layout'
import { HANDLE_PX, Renderer, corners, type LiveStroke, type Overlay, type SelectionTransform } from './Renderer'
import { outlineOf, pathFromOutline, primeStrokePath, strokePath } from './strokeOutline'
import { Viewport } from './Viewport'

/** Lo que el motor le avisa a la interfaz. */
export interface BoardOptions {
  fingerDraws: () => boolean
  tools: () => ToolPrefs
  onPenDetected: () => void
  /** Cambió el zoom (relativo a «ajustado al ancho»: 1 = 100 %) */
  onZoom?: (relative: number) => void
  onDebug?: (info: PointerDebug) => void
  /** Cambió la página que está en el centro de la vista, o la cantidad de páginas */
  onPage?: (index: number, total: number) => void
  /** Hay (o dejó de haber) una selección del lazo; su caja en píxeles de pantalla */
  onSelection?: (box: { x: number; y: number; w: number; h: number; count: number } | null) => void
  /**
   * Un trazo terminó y queda quieto al final: devuelve el trazo «ajustado» (forma reconocida,
   * etapa 6) o null para dejarlo como está.
   */
  recognize?: Recognizer
}

/** Reconocimiento de formas enchufable (etapa 6). */
export interface Recognizer {
  /** Se llama mientras el lápiz sigue apoyado; si devuelve puntos, el trazo pasa a ser la forma. */
  hold(pts: readonly number[]): { pts: number[]; adjust?: (x: number, y: number) => number[]; shape: Stroke['shape'] } | null
}

interface InkSession {
  kind: 'ink'
  live: LiveStroke & { page: number; t0: number }
  /** Forma reconocida (etapa 6): mientras el lápiz siga apoyado, se ajusta con él */
  shape?: { adjust?: (x: number, y: number) => number[]; meta: Stroke['shape'] }
  holdTimer?: number
  lastMove: { x: number; y: number; t: number }
}

interface EraserSession {
  kind: 'eraser'
  t0: number
  last: { x: number; y: number } | null
}

interface LassoSession {
  kind: 'lasso'
  t0: number
  page: number
  pts: number[]
}

interface DragSession {
  kind: 'drag'
  t0: number
  mode: 'move' | 'scale'
  start: [number, number]
  /** Esquina opuesta (escala) */
  anchor: [number, number]
  transform: SelectionTransform
}

type Session = InkSession | EraserSession | LassoSession | DragSession

interface Selection {
  page: number
  ids: Set<string>
  bbox: BBox
}

/** Si redibujar la tinta tarda más que esto, durante los gestos se mueve el bitmap en vez de redibujar. */
const SLOW_INK_MS = 6
/** Después del último cambio de vista, cuánto esperar para redibujar la tinta nítida. */
const SETTLE_MS = 120
/** Un trazo queda «dentro» del lazo si al menos esta fracción de sus puntos está adentro. */
const LASSO_FRACTION = 0.6
/** Margen de la caja de selección, en píxeles de pantalla. */
const SELECTION_PAD = 12
/** Reconocimiento de formas: quieto más de esto, moviéndose menos de HOLD_PX. */
const HOLD_MS = 500
const HOLD_PX = 6

/**
 * El lienzo: une la cámara, el render, la entrada y las herramientas sobre el modelo de la nota.
 * Es imperativo, fuera del ciclo de React, para no re-renderizar en cada pointermove.
 */
export class Board implements InputSink {
  readonly vp = new Viewport()
  private renderer: Renderer
  private input: InputController
  private rects: Rect[] = []
  private sessions = new Map<number, Session>()
  private selection: Selection | null = null
  private hidden = new Set<string>()
  private eraserCursor: { x: number; y: number } | null = null
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
  private lastSelKey = ''
  private sized = false
  private ro: ResizeObserver
  private readonly off: (() => void)[] = []
  private readonly root: HTMLElement
  readonly note: NoteModel
  private readonly opts: BoardOptions

  constructor(root: HTMLElement, note: NoteModel, opts: BoardOptions) {
    this.root = root
    this.note = note
    this.opts = opts
    this.renderer = new Renderer(root)
    this.input = new InputController(root, this)
    this.relayout()

    this.off.push(
      note.subscribe((e) => {
        if (e.type === 'strokes') this.onStrokes(e.changes, e.origin)
        else if (e.type === 'pages') {
          this.relayout()
          this.clearSelection()
          this.invalidate()
        }
      }),
    )

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
    for (const s of this.sessions.values()) if (s.kind === 'ink') clearTimeout(s.holdTimer)
    this.ro.disconnect()
    this.input.destroy()
    this.renderer.destroy()
    for (const f of this.off) f()
  }

  // ---------- API para la interfaz ----------

  fitWidth() {
    this.vp.stopInertia()
    this.vp.fitWidth()
    this.viewChanged()
  }

  /** Redibuja todo (al volver de segundo plano o si se restauró el contexto). */
  invalidate() {
    this.dirtyView = true
    this.dirtyInk = true
    this.dirtyLive = true
    this.schedule()
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

  scrollToPage(index: number) {
    const r = this.rects[index]
    if (!r) return
    this.vp.stopInertia()
    this.vp.cam.y = r.y - 24 / this.vp.cam.zoom
    this.vp.clamp()
    this.invalidate()
  }

  undo() {
    this.clearSelection()
    this.note.undo()
  }

  redo() {
    this.clearSelection()
    this.note.redo()
  }

  /** La herramienta cambió: el lazo pierde la selección. */
  toolChanged() {
    if (this.opts.tools().tool !== 'lasso') this.clearSelection()
    this.eraserCursor = null
    this.dirtyLive = true
    this.schedule()
  }

  clearSelection() {
    if (!this.selection) return
    this.selection = null
    this.hidden.clear()
    this.dirtyInk = true
    this.dirtyLive = true
    this.schedule()
  }

  deleteSelection() {
    const sel = this.selection
    if (!sel) return
    const page = this.note.pages[sel.page]
    const before = page.strokes.filter((s) => sel.ids.has(s.id))
    this.clearSelection()
    this.note.apply([{ pageId: page.id, before, after: [] }])
  }

  duplicateSelection() {
    const sel = this.selection
    if (!sel) return
    const page = this.note.pages[sel.page]
    const off = 24
    const copies = page.strokes
      .filter((s) => sel.ids.has(s.id))
      .map((s) => restroke({ ...s, id: newId(), z: nextZ(), pts: transformPts(s.pts, 1, 0, 0, off, off) }))
    this.note.apply([{ pageId: page.id, before: [], after: copies }])
    this.select(sel.page, new Set(copies.map((c) => c.id)))
  }

  recolorSelection(color: string) {
    const sel = this.selection
    if (!sel) return
    const page = this.note.pages[sel.page]
    const before = page.strokes.filter((s) => sel.ids.has(s.id))
    // Misma forma, otro color: el contorno ya calculado sirve
    const after = before.map((s) => {
      const c = { ...s, color }
      primeStrokePath(c, strokePath(s))
      return c
    })
    this.note.apply([{ pageId: page.id, before, after }])
    this.dirtyLive = true
    this.schedule()
  }

  private select(page: number, ids: Set<string>) {
    const strokes = this.note.pages[page].strokes.filter((s) => ids.has(s.id))
    const b = bboxUnion(strokes.map((s) => s.bbox))
    // Margen para que una línea recta no deje una caja chata con las manijas encimadas
    const pad = SELECTION_PAD / this.vp.cam.zoom
    this.selection = b ? { page, ids, bbox: [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad] } : null
    this.hidden = new Set(this.selection ? ids : [])
    this.dirtyInk = true
    this.dirtyLive = true
    this.schedule()
  }

  private relayout() {
    this.rects = layoutPages(this.note.pages)
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

  /** Los trazos cambiaron en el modelo: una lapicera recién agregada se dibuja sola; el resto, todo. */
  private onStrokes(changes: StrokeChange[], origin: string) {
    if (this.selection) {
      // Si otro dispositivo borró algo seleccionado, se saca de la selección
      const page = this.note.pages[this.selection.page]
      const alive = new Set(page?.strokes.map((s) => s.id))
      for (const id of [...this.selection.ids]) if (!alive.has(id)) this.selection.ids.delete(id)
      if (!this.selection.ids.size) this.clearSelection()
    }
    const single = changes.length === 1 && changes[0].before.length === 0 && changes[0].after.length === 1
    const idx = single ? this.note.pageIndex(changes[0].pageId) : -1
    const last = idx >= 0 ? this.note.pages[idx].strokes.at(-1) : undefined
    if (
      origin === 'local' &&
      single &&
      last === changes[0].after[0] &&
      !this.inkPreviewed &&
      !this.dirtyInk &&
      this.renderer.appendStroke(this.vp, this.rects[idx], last, this.note.pages[idx].background.paper)
    ) {
      return
    }
    this.dirtyInk = true
    this.schedule()
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

  twoFingerTap() {
    this.undo()
  }

  hover(s: { x: number; y: number } | null) {
    const show = this.opts.tools().tool === 'eraser' && s !== null
    if (!show && !this.eraserCursor) return
    this.eraserCursor = show ? s : null
    this.dirtyLive = true
    this.schedule()
  }

  viewChanged() {
    this.lastViewChange = performance.now()
    this.dirtyView = true
    this.schedule()
  }

  beginStroke(id: number, s: Sample, simulated: boolean, eraser = false): boolean {
    const prefs = this.opts.tools()
    const tool = eraser ? 'eraser' : prefs.tool
    const [wx, wy] = this.vp.toWorld(s.x, s.y)
    const page = pageAt(this.rects, wx, wy)

    if (tool === 'eraser') {
      this.eraserCursor = null
      this.note.begin()
      const session: EraserSession = { kind: 'eraser', t0: performance.now(), last: null }
      this.sessions.set(id, session)
      this.erase(session, [s])
      return true
    }

    if (tool === 'lasso') {
      const sel = this.selection
      if (sel) {
        const hit = this.hitSelection(s.x, s.y)
        if (hit) {
          this.sessions.set(id, {
            kind: 'drag',
            t0: performance.now(),
            mode: hit.mode,
            start: [wx, wy],
            anchor: hit.anchor,
            transform: { k: 1, ox: hit.anchor[0], oy: hit.anchor[1], dx: 0, dy: 0 },
          })
          return true
        }
        this.clearSelection()
      }
      if (page < 0) return false
      const r = this.rects[page]
      this.sessions.set(id, { kind: 'lasso', t0: performance.now(), page, pts: [wx - r.x, wy - r.y] })
      this.dirtyLive = true
      this.schedule()
      return true
    }

    if (page < 0) return false
    const rect = this.rects[page]
    const ink = tool === 'highlighter' ? prefs.highlighter : prefs.pen
    const inkTool: InkTool = tool === 'highlighter' ? 'highlighter' : 'pen'
    const session: InkSession = {
      kind: 'ink',
      live: {
        tool: inkTool,
        opacity: inkTool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1,
        paper: this.note.pages[page].background.paper,
        page,
        rect,
        pts: [wx - rect.x, wy - rect.y, s.p],
        predicted: [],
        size: ink.size,
        color: ink.color,
        simulated,
        t0: performance.now(),
      },
      lastMove: { x: s.x, y: s.y, t: performance.now() },
    }
    this.sessions.set(id, session)
    this.armHold(session)
    this.dirtyLive = true
    this.schedule()
    return true
  }

  extendStroke(id: number, samples: Sample[], predicted: Sample[]) {
    const session = this.sessions.get(id)
    if (!session || !samples.length) return
    if (session.kind === 'eraser') return this.erase(session, samples)
    const last = samples[samples.length - 1]
    const [wx, wy] = this.vp.toWorld(last.x, last.y)

    if (session.kind === 'lasso') {
      const r = this.rects[session.page]
      for (const s of samples) {
        const [x, y] = this.vp.toWorld(s.x, s.y)
        session.pts.push(x - r.x, y - r.y)
      }
    } else if (session.kind === 'drag') {
      const sel = this.selection!
      const t = session.transform
      if (session.mode === 'move') {
        t.dx = wx - session.start[0]
        t.dy = wy - session.start[1]
      } else {
        // Escala uniforme desde la esquina opuesta, según la diagonal
        const r = this.rects[sel.page]
        const [ax, ay] = session.anchor
        const d0 = Math.hypot(session.start[0] - r.x - ax, session.start[1] - r.y - ay)
        const d1 = Math.hypot(wx - r.x - ax, wy - r.y - ay)
        t.k = Math.max(0.1, Math.min(10, d1 / Math.max(1, d0)))
      }
    } else {
      const l = session.live
      if (session.shape) {
        // Forma reconocida: el lápiz la sigue ajustando hasta que se levanta
        if (session.shape.adjust) l.pts = session.shape.adjust(wx - l.rect.x, wy - l.rect.y)
        l.simulated = false
      } else {
        for (const s of samples) {
          const [x, y] = this.toPage(l.rect, s)
          const n = l.pts.length
          // Puntos repetidos no aportan y engrosan el trazo en perfect-freehand
          if (Math.abs(l.pts[n - 3] - x) < 0.05 && Math.abs(l.pts[n - 2] - y) < 0.05) continue
          l.pts.push(x, y, s.p)
        }
        l.predicted = []
        for (const s of predicted) {
          const [x, y] = this.toPage(l.rect, s)
          l.predicted.push(x, y, s.p)
        }
        if (Math.hypot(last.x - session.lastMove.x, last.y - session.lastMove.y) > HOLD_PX) {
          session.lastMove = { x: last.x, y: last.y, t: performance.now() }
          this.armHold(session)
        }
      }
    }
    this.dirtyLive = true
    this.schedule()
  }

  endStroke(id: number, commit: boolean) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.dirtyLive = true
    this.schedule()

    if (session.kind === 'eraser') {
      if (commit) this.note.commit()
      else this.note.rollback()
      return
    }
    if (session.kind === 'lasso') {
      if (!commit) return
      const page = this.note.pages[session.page]
      const ids = new Set(page.strokes.filter((s) => fractionInside(s.pts, session.pts) >= LASSO_FRACTION).map((s) => s.id))
      if (ids.size) this.select(session.page, ids)
      return
    }
    if (session.kind === 'drag') {
      const sel = this.selection
      if (!sel) return
      const t = session.transform
      if (!commit || (t.k === 1 && t.dx === 0 && t.dy === 0)) {
        this.dirtyLive = true
        return
      }
      const page = this.note.pages[sel.page]
      const before = page.strokes.filter((s) => sel.ids.has(s.id))
      const after = before.map((s) => restroke({ ...s, size: s.size * t.k, pts: transformPts(s.pts, t.k, t.ox, t.oy, t.dx, t.dy) }))
      this.note.apply([{ pageId: page.id, before, after }])
      this.select(sel.page, sel.ids)
      return
    }

    clearTimeout(session.holdTimer)
    if (!commit) return
    const l = session.live
    const stroke = restroke({
      id: newId(),
      tool: l.tool,
      color: l.color,
      opacity: l.opacity,
      z: nextZ(),
      size: l.size,
      pts: l.pts,
      // Las formas tienen grosor parejo (presión constante, sin simular)
      simulated: session.shape ? false : l.simulated,
      bbox: [0, 0, 0, 0],
      ...(session.shape ? { shape: session.shape.meta } : {}),
    })
    this.note.apply([{ pageId: this.note.pages[l.page].id, before: [], after: [stroke] }])
  }

  strokeInfo(id: number) {
    const s = this.sessions.get(id)
    if (!s) return null
    if (s.kind === 'ink') return { age: performance.now() - s.live.t0, points: s.live.pts.length / 3 }
    return { age: performance.now() - s.t0, points: 0 }
  }

  /** Programa el reconocimiento de formas si el lápiz queda quieto. */
  private armHold(session: InkSession) {
    clearTimeout(session.holdTimer)
    const rec = this.opts.recognize
    if (!rec || !this.opts.tools().shapes || session.live.tool !== 'pen') return
    session.holdTimer = window.setTimeout(() => {
      if (session.shape || ![...this.sessions.values()].includes(session)) return
      const l = session.live
      const r = rec.hold(l.pts)
      if (!r) return
      l.pts = r.pts
      l.predicted = []
      l.simulated = false
      session.shape = { adjust: r.adjust, meta: r.shape }
      this.dirtyLive = true
      this.schedule()
    }, HOLD_MS)
  }

  /** Goma: por trazo (borra los que toca) o por área (recorta y divide). */
  private erase(session: EraserSession, samples: Sample[]) {
    const prefs = this.opts.tools().eraser
    const r = prefs.size / this.vp.cam.zoom
    // Puntos a revisar: interpolamos para no saltear trazos si el lápiz va rápido
    const pts: [number, number][] = []
    for (const s of samples) {
      const [x, y] = this.vp.toWorld(s.x, s.y)
      if (session.last) {
        const d = Math.hypot(x - session.last.x, y - session.last.y)
        const k = Math.ceil(d / (r * 0.5))
        for (let i = 1; i < k; i++) pts.push([session.last.x + ((x - session.last.x) * i) / k, session.last.y + ((y - session.last.y) * i) / k])
      }
      pts.push([x, y])
      session.last = { x, y }
    }
    const last = samples[samples.length - 1]
    this.eraserCursor = { x: last.x, y: last.y }

    const changes: StrokeChange[] = []
    const byPage = new Map<number, [number, number][]>()
    for (const [x, y] of pts) {
      const i = pageAt(this.rects, x, y)
      if (i >= 0) (byPage.get(i) ?? byPage.set(i, []).get(i)!).push([x - this.rects[i].x, y - this.rects[i].y])
    }
    for (const [i, local] of byPage) {
      const page = this.note.pages[i]
      let strokes = page.strokes
      const before: Stroke[] = []
      const after: Stroke[] = []
      for (const [x, y] of local) {
        const next: Stroke[] = []
        for (const s of strokes) {
          const b = s.bbox
          if (x < b[0] - r || x > b[2] + r || y < b[1] - r || y > b[3] + r) {
            next.push(s)
            continue
          }
          if (prefs.mode === 'stroke') {
            if (polylineHitsCircle(s.pts, x, y, r, s.size / 2)) before.push(s)
            else next.push(s)
            continue
          }
          const pieces = cutPolyline(s.pts, x, y, r)
          if (!pieces) {
            next.push(s)
            continue
          }
          before.push(s)
          for (const p of pieces) {
            const piece = restroke({ ...s, id: newId(), pts: p, shape: undefined })
            after.push(piece)
            next.push(piece)
          }
        }
        strokes = next
      }
      // Lo creado y borrado en esta misma pasada no cuenta
      const created = new Set(after.map((s) => s.id))
      const removedNew = new Set(before.filter((s) => created.has(s.id)).map((s) => s.id))
      const realBefore = before.filter((s) => !created.has(s.id))
      const realAfter = after.filter((s) => !removedNew.has(s.id))
      if (realBefore.length || realAfter.length) changes.push({ pageId: page.id, before: realBefore, after: realAfter })
    }
    if (changes.length) this.note.preview(changes)
    this.dirtyLive = true
    this.schedule()
  }

  /** ¿El punto de pantalla cae en una manija (escalar) o dentro de la selección (mover)? */
  private hitSelection(sx: number, sy: number): { mode: 'move' | 'scale'; anchor: [number, number] } | null {
    const sel = this.selection
    if (!sel) return null
    const r = this.rects[sel.page]
    const cs = corners(sel.bbox)
    const reach = HANDLE_PX * 1.4
    for (let i = 0; i < 4; i++) {
      const [x, y] = this.vp.toScreen(cs[i][0] + r.x, cs[i][1] + r.y)
      if (Math.abs(x - sx) <= reach && Math.abs(y - sy) <= reach) return { mode: 'scale', anchor: cs[(i + 2) % 4] }
    }
    const [x0, y0] = this.vp.toScreen(sel.bbox[0] + r.x, sel.bbox[1] + r.y)
    const [x1, y1] = this.vp.toScreen(sel.bbox[2] + r.x, sel.bbox[3] + r.y)
    if (sx >= x0 - 8 && sx <= x1 + 8 && sy >= y0 - 8 && sy <= y1 + 8) return { mode: 'move', anchor: [sel.bbox[0], sel.bbox[1]] }
    return null
  }

  private toPage(rect: Rect, s: Sample): [number, number] {
    const [wx, wy] = this.vp.toWorld(s.x, s.y)
    return [wx - rect.x, wy - rect.y]
  }

  // ---------- Cuadros ----------

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private overlay(): Overlay {
    const o: Overlay = {}
    for (const s of this.sessions.values()) {
      if (s.kind === 'lasso') o.lasso = { rect: this.rects[s.page], pts: s.pts }
    }
    const sel = this.selection
    if (sel) {
      const drag = [...this.sessions.values()].find((s): s is DragSession => s.kind === 'drag')
      const strokes = this.note.pages[sel.page].strokes.filter((s) => sel.ids.has(s.id))
      o.selection = { rect: this.rects[sel.page], paper: this.note.pages[sel.page].background.paper, bbox: sel.bbox, strokes, transform: drag?.transform }
    }
    if (this.eraserCursor) o.eraser = { ...this.eraserCursor, r: this.opts.tools().eraser.size }
    return o
  }

  private frame = (now: number) => {
    this.raf = 0
    const dt = this.lastFrame ? Math.min(32, now - this.lastFrame) : 16
    this.lastFrame = now
    const vp = this.vp
    const pages = this.note.pages

    if (vp.inertiaActive) {
      vp.stepInertia(dt)
      this.lastViewChange = performance.now()
      this.dirtyView = true
    }

    const moving = this.input.gestureActive || vp.inertiaActive
    if (this.dirtyView) {
      this.dirtyView = false
      this.renderer.drawBackground(vp, pages, this.rects)
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
      this.lastInkMs = this.renderer.drawInk(vp, pages, this.rects, this.hidden)
      this.dirtyInk = false
      this.inkPreviewed = false
    }

    if (this.dirtyLive) {
      this.dirtyLive = false
      const live = [...this.sessions.values()].filter((s): s is InkSession => s.kind === 'ink').map((s) => s.live)
      this.renderer.drawLive(vp.cam, live, this.overlay())
    }

    if (vp.cam.zoom !== this.lastZoom) {
      this.lastZoom = vp.cam.zoom
      this.opts.onZoom?.(vp.cam.zoom / vp.fitZoom)
    }

    const page = this.currentPage()
    if (page !== this.lastPage || pages.length !== this.lastTotal) {
      this.lastPage = page
      this.lastTotal = pages.length
      this.opts.onPage?.(page, pages.length)
    }

    this.emitSelection()

    // Seguir mientras haya inercia o falte el redibujo nítido
    if (vp.inertiaActive || this.inkPreviewed) this.schedule()
    else this.lastFrame = 0
  }

  private emitSelection() {
    const sel = this.selection
    const dragging = [...this.sessions.values()].some((s) => s.kind === 'drag')
    if (!sel || dragging) {
      if (this.lastSelKey !== '') {
        this.lastSelKey = ''
        this.opts.onSelection?.(null)
      }
      return
    }
    const r = this.rects[sel.page]
    const [x0, y0] = this.vp.toScreen(sel.bbox[0] + r.x, sel.bbox[1] + r.y)
    const [x1, y1] = this.vp.toScreen(sel.bbox[2] + r.x, sel.bbox[3] + r.y)
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, count: sel.ids.size }
    const key = `${Math.round(x0)},${Math.round(y0)},${Math.round(x1)},${Math.round(y1)},${box.count}`
    if (key !== this.lastSelKey) {
      this.lastSelKey = key
      this.opts.onSelection?.(box)
    }
  }
}

/** Recalcula el contorno y la caja de un trazo (después de crearlo, cortarlo o transformarlo). */
export function restroke(s: Stroke): Stroke {
  const outline = outlineOf(s, true)
  const stroke: Stroke = { ...s, bbox: outline.length ? bboxOf(outline.flat(), 2, 1) : bboxOf(s.pts, 3, s.size / 2) }
  if (!stroke.shape) delete stroke.shape
  primeStrokePath(stroke, pathFromOutline(outline))
  return stroke
}

