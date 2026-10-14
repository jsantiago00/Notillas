import type { Rect } from '../model/geometry'

export interface Camera {
  /** Punto del mundo que queda en la esquina superior izquierda de la pantalla */
  x: number
  y: number
  zoom: number
}

/** Margen alrededor del contenido, en píxeles de pantalla. */
const MARGIN = 24
/** Rozamiento de la inercia: fracción de velocidad que queda después de 1 ms. */
const FRICTION_PER_MS = 0.9965
/** Debajo de esta velocidad (px/ms) la inercia se detiene. */
const MIN_SPEED = 0.02

/**
 * Cámara del lienzo: pantalla = (mundo − cámara) × zoom.
 * Es pura (sin DOM), así que se puede testear.
 */
export class Viewport {
  cam: Camera = { x: 0, y: 0, zoom: 1 }
  /** Tamaño de la vista en píxeles CSS */
  width = 1
  height = 1
  content: Rect = { x: 0, y: 0, w: 1, h: 1 }

  private vx = 0
  private vy = 0

  setSize(width: number, height: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.clamp()
  }

  setContent(content: Rect) {
    this.content = content
    this.clamp()
  }

  /** Zoom que hace entrar el ancho del contenido en la vista. */
  get fitZoom(): number {
    return Math.max(0.05, (this.width - MARGIN * 2) / Math.max(1, this.content.w))
  }

  get minZoom(): number {
    return this.fitZoom * 0.25
  }

  get maxZoom(): number {
    return Math.max(4, this.fitZoom * 8)
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [sx / this.cam.zoom + this.cam.x, sy / this.cam.zoom + this.cam.y]
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.cam.x) * this.cam.zoom, (wy - this.cam.y) * this.cam.zoom]
  }

  /** Ajusta al ancho y deja el principio del contenido arriba. */
  fitWidth() {
    const zoom = Math.min(this.fitZoom, 1.5)
    this.cam = { x: 0, y: this.content.y - MARGIN / zoom, zoom }
    this.clamp()
  }

  /** Desplaza en píxeles de pantalla (positivo = el contenido se mueve a la derecha y abajo). */
  panBy(dx: number, dy: number) {
    this.cam.x -= dx / this.cam.zoom
    this.cam.y -= dy / this.cam.zoom
    this.clamp()
  }

  /** Multiplica el zoom dejando fijo el punto de pantalla (sx, sy). */
  zoomAt(factor: number, sx: number, sy: number) {
    const [wx, wy] = this.toWorld(sx, sy)
    const zoom = clampNum(this.cam.zoom * factor, this.minZoom, this.maxZoom)
    this.cam = { x: wx - sx / zoom, y: wy - sy / zoom, zoom }
    this.clamp()
  }

  /**
   * Pellizco: el punto del mundo `anchor` queda bajo el punto de pantalla (sx, sy),
   * con el zoom `zoom`. Así el pan y el zoom de dos dedos van juntos.
   */
  pinchTo(anchor: [number, number], zoom: number, sx: number, sy: number) {
    const z = clampNum(zoom, this.minZoom, this.maxZoom)
    this.cam = { x: anchor[0] - sx / z, y: anchor[1] - sy / z, zoom: z }
    this.clamp()
  }

  /**
   * Mantiene el contenido a la vista. Si entra a lo ancho, queda centrado;
   * si no, se puede desplazar hasta un margen más allá de cada borde.
   */
  clamp() {
    const { zoom } = this.cam
    const viewW = this.width / zoom
    const viewH = this.height / zoom
    const m = MARGIN / zoom
    const c = this.content
    if (c.w + 2 * m <= viewW) {
      this.cam.x = c.x + (c.w - viewW) / 2
    } else {
      this.cam.x = clampNum(this.cam.x, c.x - m, c.x + c.w + m - viewW)
    }
    // Abajo dejamos media pantalla libre para que la última página no quede pegada al borde
    const maxY = Math.max(c.y - m, c.y + c.h + Math.max(m, viewH * 0.5) - viewH)
    this.cam.y = clampNum(this.cam.y, c.y - m, maxY)
  }

  /** Arranca la inercia con una velocidad en px/ms de pantalla. */
  fling(vx: number, vy: number) {
    this.vx = vx
    this.vy = vy
  }

  stopInertia() {
    this.vx = 0
    this.vy = 0
  }

  get inertiaActive(): boolean {
    return this.vx !== 0 || this.vy !== 0
  }

  /** Avanza la inercia `dt` ms. Devuelve true si sigue en movimiento. */
  stepInertia(dt: number): boolean {
    if (!this.inertiaActive) return false
    const before = { x: this.cam.x, y: this.cam.y }
    this.panBy(this.vx * dt, this.vy * dt)
    const decay = Math.pow(FRICTION_PER_MS, dt)
    this.vx *= decay
    this.vy *= decay
    // Si pegó contra un borde, se frena en ese eje
    if (this.cam.x === before.x) this.vx = 0
    if (this.cam.y === before.y) this.vy = 0
    if (Math.hypot(this.vx, this.vy) < MIN_SPEED) this.stopInertia()
    return this.inertiaActive
  }

  /** Rectángulo del mundo visible. */
  visibleWorld(): Rect {
    return { x: this.cam.x, y: this.cam.y, w: this.width / this.cam.zoom, h: this.height / this.cam.zoom }
  }
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
