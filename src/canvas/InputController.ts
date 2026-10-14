import { PalmGuard } from './palm'
import type { Camera, Viewport } from './Viewport'

/** Una muestra del puntero en píxeles CSS relativos al lienzo. */
export interface Sample {
  x: number
  y: number
  /** Presión 0–1 (con mouse o dedo no se usa: se simula) */
  p: number
}

export interface PointerDebug {
  type: string
  pressure: number
  tiltX: number
  tiltY: number
  buttons: number
  coalesced: number
  predicted: number
  width: number
  height: number
}

/** Lo que el controlador le pide al lienzo. */
export interface InputSink {
  readonly vp: Viewport
  /** Empieza un trazo; devuelve false si el punto no cae en ninguna página. */
  beginStroke(id: number, s: Sample, simulated: boolean): boolean
  extendStroke(id: number, samples: Sample[], predicted: Sample[]): void
  /** Termina el trazo: lo confirma o lo descarta. */
  endStroke(id: number, commit: boolean): void
  /** Edad del trazo (ms) y cantidad de puntos, para decidir si se descarta al llegar un segundo dedo. */
  strokeInfo(id: number): { age: number; points: number } | null
  viewChanged(): void
  /** Se vio un lápiz (para apagar «el dedo dibuja»). */
  penDetected(): void
  fingerDraws(): boolean
  debug?(info: PointerDebug): void
}

type Role = 'draw' | 'pan' | 'pinch' | 'ignored'

interface Ptr {
  id: number
  type: string
  role: Role
  x: number
  y: number
  t0: number
  /** Cámara al empezar, para deshacer un desplazamiento de la palma */
  cam0: Camera
}

interface Pinch {
  a: number
  b: number
  anchor: [number, number]
  d0: number
  z0: number
}

/** Botón 2 (barril del S Pen o clic derecho) y 32 (punta trasera tipo Surface): goma, etapa 4. */
const ERASER_BUTTONS = 2 | 32
/** Un trazo de dedo más corto que esto se toma como el principio de un pellizco. */
const PINCH_GRACE_MS = 250
/** Si la palma desplazó la hoja hace menos de esto, al apoyar el lápiz se vuelve atrás. */
const PALM_PAN_UNDO_MS = 1000

/**
 * Pointer Events: lápiz, dedo y mouse.
 * - Lápiz: dibuja. Apoyarlo cancela los toques en curso (rechazo de palma).
 * - Dedo: dibuja si «el dedo dibuja» está activo; si no, desplaza. Dos dedos: pan y zoom.
 * - Mouse: izquierdo dibuja; medio, espacio + arrastre o arrastrar fuera de la hoja desplaza;
 *   la rueda desplaza y Ctrl + rueda hace zoom.
 */
export class InputController {
  private ptrs = new Map<number, Ptr>()
  private pinch: Pinch | null = null
  private palm = new PalmGuard()
  private panSamples: { t: number; x: number; y: number }[] = []
  private spaceDown = false
  private origin = { x: 0, y: 0 }
  private readonly el: HTMLElement
  private readonly sink: InputSink
  private readonly off: (() => void)[] = []

  constructor(el: HTMLElement, sink: InputSink) {
    this.el = el
    this.sink = sink
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      type: K | string,
      fn: (e: never) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.off.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(el, 'pointerdown', this.onDown)
    on(el, 'pointermove', this.onMove)
    on(el, 'pointerup', this.onUp)
    on(el, 'pointercancel', this.onUp)
    on(el, 'wheel', this.onWheel, { passive: false })
    // Bloqueos del navegador: menú contextual (pulsación larga o botón del S Pen),
    // selección de texto, zoom con doble toque y gestos de iOS
    const block = (e: Event) => e.preventDefault()
    for (const t of ['contextmenu', 'selectstart', 'dblclick', 'gesturestart', 'gesturechange', 'gestureend']) on(el, t, block)
    on(el, 'touchmove', block, { passive: false })
    on(window, 'keydown', this.onKeyDown)
    on(window, 'keyup', this.onKeyUp)
    on(window, 'blur', this.onBlur)
  }

  destroy() {
    for (const f of this.off) f()
    this.off.length = 0
  }

  /** Hay un dedo o el mouse desplazando o haciendo zoom. */
  get gestureActive(): boolean {
    for (const p of this.ptrs.values()) if (p.role === 'pan' || p.role === 'pinch') return true
    return false
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    return { x: e.clientX - this.origin.x, y: e.clientY - this.origin.y }
  }

  private add(e: PointerEvent, role: Role): Ptr {
    const { x, y } = this.local(e)
    const p: Ptr = { id: e.pointerId, type: e.pointerType, role, x, y, t0: e.timeStamp, cam0: { ...this.sink.vp.cam } }
    this.ptrs.set(e.pointerId, p)
    return p
  }

  private onDown = (e: PointerEvent) => {
    const r = this.el.getBoundingClientRect()
    this.origin = { x: r.left, y: r.top }
    const now = e.timeStamp
    const pos = this.local(e)
    this.report(e, 1, 0)
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      /* el puntero ya no existe */
    }

    if (e.pointerType === 'pen') {
      this.palm.notePen(now, true)
      this.sink.penDetected()
      this.cancelTouches(now)
      this.sink.vp.stopInertia()
      if (e.buttons & ERASER_BUTTONS) {
        this.add(e, 'ignored')
        return
      }
      const ok = this.sink.beginStroke(e.pointerId, { ...pos, p: penPressure(e) }, false)
      this.add(e, ok ? 'draw' : 'ignored')
      return
    }

    if (e.pointerType === 'touch') {
      if (!this.palm.touchAllowed(now)) {
        this.add(e, 'ignored')
        return
      }
      const touches = [...this.ptrs.values()].filter((p) => p.type === 'touch' && p.role !== 'ignored')
      if (touches.length === 0) {
        this.sink.vp.stopInertia()
        const draws = this.sink.fingerDraws() && this.sink.beginStroke(e.pointerId, { ...pos, p: 0.5 }, true)
        const p = this.add(e, draws ? 'draw' : 'pan')
        if (!draws) this.startPan(p, now)
      } else if (touches.length === 1) {
        const other = touches[0]
        if (other.role === 'draw') {
          // El primer dedo seguramente era el comienzo del pellizco: si el trazo es corto, se descarta
          const info = this.sink.strokeInfo(other.id)
          const keep = info !== null && info.age > PINCH_GRACE_MS && info.points > 8
          this.sink.endStroke(other.id, keep)
        }
        this.add(e, 'pinch')
        other.role = 'pinch'
        this.startPinch(other.id, e.pointerId)
      } else {
        this.add(e, 'ignored')
      }
      return
    }

    // Mouse
    this.sink.vp.stopInertia()
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault()
      this.startPan(this.add(e, 'pan'), now)
    } else if (e.button === 0) {
      const ok = this.sink.beginStroke(e.pointerId, { ...pos, p: 0.5 }, true)
      const p = this.add(e, ok ? 'draw' : 'pan')
      if (!ok) this.startPan(p, now)
    } else {
      this.add(e, 'ignored')
    }
    this.updateCursor()
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.palm.notePen(e.timeStamp, (e.buttons & 1) === 1)
    const p = this.ptrs.get(e.pointerId)
    if (!p) return
    const coalesced = e.getCoalescedEvents?.() ?? []
    const events = coalesced.length ? coalesced : [e]
    const predictedEvents = e.getPredictedEvents?.() ?? []
    this.report(e, events.length, predictedEvents.length)

    if (p.role === 'draw') {
      const pen = p.type === 'pen'
      const toSample = (ev: PointerEvent): Sample => ({ ...this.local(ev), p: pen ? penPressure(ev) : 0.5 })
      this.sink.extendStroke(p.id, events.map(toSample), predictedEvents.map(toSample))
    } else if (p.role === 'pan') {
      const { x, y } = this.local(e)
      this.sink.vp.panBy(x - p.x, y - p.y)
      this.panSamples.push({ t: e.timeStamp, x, y })
      if (this.panSamples.length > 20) this.panSamples.shift()
      this.sink.viewChanged()
    } else if (p.role === 'pinch') {
      Object.assign(p, this.local(e))
      this.updatePinch()
      return
    }
    Object.assign(p, this.local(e))
  }

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'pen') this.palm.notePen(e.timeStamp, false)
    const p = this.ptrs.get(e.pointerId)
    if (!p) return
    this.ptrs.delete(e.pointerId)
    const cancelled = e.type === 'pointercancel'

    if (p.role === 'draw') {
      // Un toque cancelado por el sistema puede ser la palma; el lápiz y el mouse se guardan igual
      this.sink.endStroke(p.id, !(cancelled && p.type === 'touch'))
    } else if (p.role === 'pan') {
      if (!cancelled) this.fling(e.timeStamp)
      this.sink.viewChanged()
    } else if (p.role === 'pinch') {
      this.pinch = null
      // El dedo que queda sigue desplazando, sin dibujar
      for (const q of this.ptrs.values()) {
        if (q.role === 'pinch') {
          q.role = 'pan'
          this.startPan(q, e.timeStamp)
        }
      }
      this.sink.viewChanged()
    }
    this.updateCursor()
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const r = this.el.getBoundingClientRect()
    this.origin = { x: r.left, y: r.top }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.clientHeight : 1
    let dx = e.deltaX * unit
    let dy = e.deltaY * unit
    const vp = this.sink.vp
    vp.stopInertia()
    if (e.ctrlKey || e.metaKey) {
      // Ctrl + rueda, o pellizco en el trackpad (llega como rueda con ctrlKey)
      const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * 0.01)))
      const { x, y } = this.local(e)
      vp.zoomAt(factor, x, y)
    } else {
      if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0]
      vp.panBy(-dx, -dy)
    }
    this.sink.viewChanged()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return
    const vp = this.sink.vp
    if (e.code === 'Space') {
      e.preventDefault()
      if (!this.spaceDown) {
        this.spaceDown = true
        this.updateCursor()
      }
      return
    }
    if (!(e.ctrlKey || e.metaKey)) return
    // Zoom del navegador: lo reemplazamos por el del lienzo
    const cx = vp.width / 2
    const cy = vp.height / 2
    if (e.key === '+' || e.key === '=') vp.zoomAt(1.25, cx, cy)
    else if (e.key === '-') vp.zoomAt(0.8, cx, cy)
    else if (e.key === '0') vp.fitWidth()
    else return
    e.preventDefault()
    this.sink.viewChanged()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.spaceDown = false
      this.updateCursor()
    }
  }

  private onBlur = () => {
    this.spaceDown = false
    this.updateCursor()
  }

  private startPan(p: Ptr, now: number) {
    this.panSamples = [{ t: now, x: p.x, y: p.y }]
    this.updateCursor()
  }

  private fling(now: number) {
    const s = this.panSamples.filter((q) => now - q.t < 100)
    this.panSamples = []
    if (s.length < 2) return
    const a = s[0]
    const b = s[s.length - 1]
    // Si el dedo se quedó quieto antes de soltar, no hay inercia
    if (now - b.t > 50 || b.t - a.t < 10) return
    this.sink.vp.fling((b.x - a.x) / (b.t - a.t), (b.y - a.y) / (b.t - a.t))
  }

  private startPinch(a: number, b: number) {
    const pa = this.ptrs.get(a)!
    const pb = this.ptrs.get(b)!
    const vp = this.sink.vp
    vp.stopInertia()
    const mid = midpoint(pa, pb)
    this.pinch = {
      a,
      b,
      anchor: vp.toWorld(mid.x, mid.y),
      d0: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)),
      z0: vp.cam.zoom,
    }
  }

  private updatePinch() {
    const g = this.pinch
    if (!g) return
    const pa = this.ptrs.get(g.a)
    const pb = this.ptrs.get(g.b)
    if (!pa || !pb) return
    const mid = midpoint(pa, pb)
    const d = Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y))
    this.sink.vp.pinchTo(g.anchor, (g.z0 * d) / g.d0, mid.x, mid.y)
    this.sink.viewChanged()
  }

  /**
   * Apareció el lápiz: lo que estaban haciendo los dedos era la palma.
   * Se descartan sus trazos y, si recién empezaban a desplazar, la hoja vuelve a donde estaba.
   */
  private cancelTouches(now: number) {
    let restore: Ptr | null = null
    for (const p of this.ptrs.values()) {
      if (p.type !== 'touch' || p.role === 'ignored') continue
      if (p.role === 'draw') this.sink.endStroke(p.id, false)
      else if (now - p.t0 < PALM_PAN_UNDO_MS && (!restore || p.t0 < restore.t0)) restore = p
      p.role = 'ignored'
    }
    this.pinch = null
    if (restore) {
      const vp = this.sink.vp
      vp.cam = { ...restore.cam0 }
      vp.clamp()
      this.sink.viewChanged()
    }
  }

  private updateCursor() {
    const panning = [...this.ptrs.values()].some((p) => p.type === 'mouse' && p.role === 'pan')
    this.el.style.cursor = panning ? 'grabbing' : this.spaceDown ? 'grab' : ''
  }

  private report(e: PointerEvent, coalesced: number, predicted: number) {
    this.sink.debug?.({
      type: e.pointerType,
      pressure: e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      buttons: e.buttons,
      coalesced,
      predicted,
      width: e.width,
      height: e.height,
    })
  }
}

/** Algunos lápices informan presión 0 al apoyar o no la soportan: usamos 0,5. */
function penPressure(e: PointerEvent): number {
  return e.pressure > 0 ? e.pressure : 0.5
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
}
