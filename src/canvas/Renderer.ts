import { bboxIntersects, rectToBBox, type Rect } from '../model/geometry'
import type { BBox, Page, Stroke } from '../model/types'
import { drawPageBackground } from './backgrounds'
import { outlineOf, pathFromOutline, strokePath } from './strokeOutline'
import type { Camera, Viewport } from './Viewport'

/** Trazo en curso (o su vista previa): puntos en coordenadas de su página. */
export interface LiveStroke {
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

  /** Redibuja toda la tinta visible, nítida al zoom actual. Devuelve cuánto tardó (ms). */
  drawInk(vp: Viewport, pages: readonly Page[], rects: readonly Rect[]): number {
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
        for (const s of pages[i].strokes) {
          if (!bboxIntersects(s.bbox, local)) continue
          ctx.fillStyle = s.color
          ctx.fill(strokePath(s))
        }
      })
    }
    this.inkCam = { ...vp.cam }
    return performance.now() - t0
  }

  /** Agrega un trazo recién confirmado sin borrar el resto. */
  appendStroke(vp: Viewport, rect: Rect, stroke: Stroke): boolean {
    if (!this.inkCam || !sameCam(this.inkCam, vp.cam)) return false
    const ctx = this.inkCtx
    this.withPage(ctx, vp.cam, rect, () => {
      ctx.fillStyle = stroke.color
      ctx.fill(strokePath(stroke))
    })
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

  drawLive(cam: Camera, strokes: Iterable<LiveStroke>) {
    const ctx = this.liveCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.live.width, this.live.height)
    for (const s of strokes) {
      const pts = s.predicted.length ? s.pts.concat(s.predicted) : s.pts
      if (pts.length < 3) continue
      this.withPage(ctx, cam, s.rect, () => {
        ctx.fillStyle = s.color
        ctx.fill(pathFromOutline(outlineOf(pts, s.size, s.simulated, false)))
      })
    }
  }

  /** Dibuja en coordenadas de la página, recortado a la hoja. */
  private withPage(ctx: CanvasRenderingContext2D, cam: Camera, r: Rect, draw: () => void) {
    ctx.save()
    this.setWorld(ctx, cam)
    ctx.beginPath()
    ctx.rect(r.x, r.y, r.w, r.h)
    ctx.clip()
    ctx.translate(r.x, r.y)
    draw()
    ctx.restore()
  }

  get size() {
    return { w: this.w, h: this.h }
  }
}

function sameCam(a: Camera, b: Camera) {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom
}
