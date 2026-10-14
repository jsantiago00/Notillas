import { bboxIntersects, rectToBBox, type Rect } from '../model/geometry'
import type { BBox, InkTool, Page, Stroke } from '../model/types'
import { drawPageBackground } from './backgrounds'
import { outlineOf, pathFromOutline, strokePath } from './strokeOutline'
import type { Camera, Viewport } from './Viewport'

/** Trazo en curso (o su vista previa): puntos en coordenadas de su página. */
export interface LiveStroke {
  tool: InkTool
  opacity: number
  rect: Rect
  pts: number[]
  predicted: number[]
  size: number
  color: string
  simulated: boolean
}

const PAPER_EDGE = 'rgb(0 0 0 / 0.12)'

/**
 * Tres canvas apilados: fondo (las hojas), tinta (los trazos confirmados) y vivo
 * (el trazo en curso con la predicción). Sin `desynchronized`: en Android con
 * S Pen deja el lienzo en blanco.
 */
export class Renderer {
  readonly bg: HTMLCanvasElement
  readonly ink: HTMLCanvasElement
  readonly live: HTMLCanvasElement
  private bgCtx: CanvasRenderingContext2D
  private inkCtx: CanvasRenderingContext2D
  private liveCtx: CanvasRenderingContext2D
  private dpr = 1
  private w = 1
  private h = 1
  /** Cámara con la que se dibujó la capa de tinta por última vez */
  private inkCam: Camera | null = null

  constructor(root: HTMLElement) {
    const make = (name: string) => {
      const c = document.createElement('canvas')
      c.className = `board-layer board-${name}`
      root.appendChild(c)
      return c
    }
    this.bg = make('bg')
    this.ink = make('ink')
    this.live = make('live')
    this.bgCtx = this.bg.getContext('2d')!
    this.inkCtx = this.ink.getContext('2d')!
    this.liveCtx = this.live.getContext('2d')!
  }

  destroy() {
    this.bg.remove()
    this.ink.remove()
    this.live.remove()
  }

  get layers(): HTMLCanvasElement[] {
    return [this.bg, this.ink, this.live]
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w
    this.h = h
    // Más de 3× no se nota y triplica la memoria
    this.dpr = Math.min(3, Math.max(1, dpr))
    for (const c of this.layers) {
      c.width = Math.round(w * this.dpr)
      c.height = Math.round(h * this.dpr)
      c.style.width = `${w}px`
      c.style.height = `${h}px`
    }
    this.inkCam = null
  }

  /** Transformación de mundo a píxeles del canvas. */
  private setWorld(ctx: CanvasRenderingContext2D, cam: Camera) {
    const s = this.dpr * cam.zoom
    ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s)
  }

  /** Las hojas con su fondo. Se redibuja en cada cambio de vista, así queda nítido a cualquier zoom. */
  drawBackground(vp: Viewport, pages: readonly Page[], rects: readonly Rect[]) {
    const ctx = this.bgCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.bg.width, this.bg.height)
    const view = vp.visibleWorld()
    const viewBox = rectToBBox(view)
    for (let i = 0; i < pages.length; i++) {
      const r = rects[i]
      if (!bboxIntersects(rectToBBox(r), viewBox)) continue
      const [sx, sy] = vp.toScreen(r.x, r.y)
      const sw = r.w * vp.cam.zoom
      const sh = r.h * vp.cam.zoom
      ctx.save()
      ctx.scale(this.dpr, this.dpr)
      ctx.shadowColor = 'rgb(0 0 0 / 0.18)'
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 2
      ctx.fillStyle = pages[i].background.paper
      ctx.fillRect(sx, sy, sw, sh)
      ctx.restore()
      const local: BBox = [view.x - r.x, view.y - r.y, view.x + view.w - r.x, view.y + view.h - r.y]
      this.withPage(ctx, vp.cam, r, () => drawPageBackground(ctx, pages[i].background, r.w, r.h, vp.cam.zoom, local))
      ctx.save()
      ctx.scale(this.dpr, this.dpr)
      ctx.strokeStyle = PAPER_EDGE
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(sw) - 1, Math.round(sh) - 1)
      ctx.restore()
    }
  }

  /**
   * Redibuja toda la tinta visible, nítida al zoom actual. Primero los resaltadores (por debajo,
   * para que no tapen la tinta) y después la lapicera. `hidden`: trazos que se están moviendo.
   * Devuelve cuánto tardó (ms).
   */
  drawInk(vp: Viewport, pages: readonly Page[], rects: readonly Rect[], hidden?: ReadonlySet<string>): number {
    const t0 = performance.now()
    const ctx = this.inkCtx
    this.ink.style.transform = ''
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.ink.width, this.ink.height)
    const view = vp.visibleWorld()
    for (let i = 0; i < pages.length; i++) {
      const r = rects[i]
      // Caja visible en coordenadas de la página
      const local: BBox = [view.x - r.x, view.y - r.y, view.x + view.w - r.x, view.y + view.h - r.y]
      if (!bboxIntersects(local, [0, 0, r.w, r.h])) continue
      this.withPage(ctx, vp.cam, r, () => {
        for (const pass of ['highlighter', 'pen'] as const) {
          for (const s of pages[i].strokes) {
            if (s.tool !== pass || hidden?.has(s.id) || !bboxIntersects(s.bbox, local)) continue
            fillStroke(ctx, s, strokePath(s))
          }
        }
      })
    }
    this.inkCam = { ...vp.cam }
    return performance.now() - t0
  }

  /** Agrega un trazo de lapicera recién confirmado sin borrar el resto. */
  appendStroke(vp: Viewport, rect: Rect, stroke: Stroke): boolean {
    // El resaltador va por debajo: hay que redibujar todo
    if (stroke.tool !== 'pen' || !this.inkCam || !sameCam(this.inkCam, vp.cam)) return false
    const ctx = this.inkCtx
    this.withPage(ctx, vp.cam, rect, () => fillStroke(ctx, stroke, strokePath(stroke)))
    return true
  }

  /**
   * Durante un gesto de pan o zoom, mueve el bitmap de tinta ya dibujado con una
   * transformación CSS (es barato). Al terminar el gesto se redibuja nítido.
   */
  previewInk(cam: Camera): boolean {
    const c0 = this.inkCam
    if (!c0) return false
    const k = cam.zoom / c0.zoom
    const tx = (c0.x - cam.x) * cam.zoom
    const ty = (c0.y - cam.y) * cam.zoom
    this.ink.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
    return true
  }

  /** Capa viva: trazos en curso con predicción, lazo, selección y el círculo de la goma. */
  drawLive(cam: Camera, strokes: Iterable<LiveStroke>, overlay: Overlay = {}) {
    const ctx = this.liveCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.live.width, this.live.height)
    const sel = overlay.selection
    if (sel) {
      const t = sel.transform ?? { k: 1, ox: 0, oy: 0, dx: 0, dy: 0 }
      this.withPage(ctx, cam, sel.rect, () => {
        ctx.save()
        ctx.translate(t.ox + t.dx, t.oy + t.dy)
        ctx.scale(t.k, t.k)
        ctx.translate(-t.ox, -t.oy)
        for (const pass of ['highlighter', 'pen'] as const) {
          for (const s of sel.strokes) if (s.tool === pass) fillStroke(ctx, s, strokePath(s))
        }
        ctx.restore()
      }, false)
      const b = transformBox(sel.bbox, t)
      this.withPage(ctx, cam, sel.rect, () => {
        const px = 1 / cam.zoom
        ctx.lineWidth = 1.5 * px
        ctx.strokeStyle = SELECTION
        ctx.setLineDash([6 * px, 4 * px])
        ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1])
        ctx.setLineDash([])
        const h = HANDLE_PX * px
        ctx.fillStyle = '#ffffff'
        for (const [x, y] of corners(b)) {
          ctx.fillRect(x - h / 2, y - h / 2, h, h)
          ctx.strokeRect(x - h / 2, y - h / 2, h, h)
        }
      }, false)
    }
    for (const s of strokes) {
      const pts = s.predicted.length ? s.pts.concat(s.predicted) : s.pts
      if (pts.length < 3) continue
      this.withPage(ctx, cam, s.rect, () => fillStroke(ctx, s, pathFromOutline(outlineOf({ ...s, pts }, false))))
    }
    if (overlay.lasso && overlay.lasso.pts.length >= 4) {
      const { rect, pts } = overlay.lasso
      this.withPage(ctx, cam, rect, () => {
        const px = 1 / cam.zoom
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.closePath()
        ctx.fillStyle = 'rgb(47 91 211 / 0.08)'
        ctx.fill()
        ctx.lineWidth = 1.5 * px
        ctx.strokeStyle = SELECTION
        ctx.setLineDash([6 * px, 4 * px])
        ctx.stroke()
      }, false)
    }
    if (overlay.eraser) {
      const { x, y, r } = overlay.eraser
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgb(255 255 255 / 0.35)'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgb(0 0 0 / 0.45)'
      ctx.stroke()
    }
  }

  /** Dibuja en coordenadas de la página, recortado a la hoja. */
  private withPage(ctx: CanvasRenderingContext2D, cam: Camera, r: Rect, draw: () => void, clip = true) {
    ctx.save()
    this.setWorld(ctx, cam)
    if (clip) {
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
    }
    ctx.translate(r.x, r.y)
    draw()
    ctx.restore()
  }

  get size() {
    return { w: this.w, h: this.h }
  }
}

function fillStroke(ctx: CanvasRenderingContext2D, s: { color: string; opacity: number }, path: Path2D) {
  ctx.globalAlpha = s.opacity
  ctx.fillStyle = s.color
  ctx.fill(path)
  ctx.globalAlpha = 1
}

export interface SelectionTransform {
  /** Escala uniforme desde (ox, oy), después traslación (dx, dy) */
  k: number
  ox: number
  oy: number
  dx: number
  dy: number
}

export interface Overlay {
  /** Lazo en curso: polígono en coordenadas de la página (x, y) */
  lasso?: { rect: Rect; pts: number[] }
  /** Selección del lazo, con la transformación en curso si se está moviendo o escalando */
  selection?: { rect: Rect; bbox: BBox; strokes: Stroke[]; transform?: SelectionTransform }
  /** Círculo de la goma, en píxeles CSS de pantalla */
  eraser?: { x: number; y: number; r: number }
}

/** Tamaño de las manijas de la selección, en píxeles de pantalla. */
export const HANDLE_PX = 14
const SELECTION = '#2f5bd3'

export function transformBox(b: BBox, t: SelectionTransform): BBox {
  const f = (x: number, o: number, d: number) => o + (x - o) * t.k + d
  return [f(b[0], t.ox, t.dx), f(b[1], t.oy, t.dy), f(b[2], t.ox, t.dx), f(b[3], t.oy, t.dy)]
}

export function corners(b: BBox): [number, number][] {
  return [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[2], b[3]],
    [b[0], b[3]],
  ]
}

function sameCam(a: Camera, b: Camera) {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom
}
