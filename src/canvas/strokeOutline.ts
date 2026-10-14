import { getStroke, type StrokeOptions } from 'perfect-freehand'
import type { InkTool, Stroke } from '../model/types'

/** Lo mínimo para dibujar un trazo (confirmado o en curso). */
export interface InkLike {
  tool: InkTool
  size: number
  simulated: boolean
  pts: ArrayLike<number>
}

/**
 * Opciones de perfect-freehand. Con lápiz usamos la presión real; con mouse o dedo,
 * la simula por velocidad. Con lápiz, menos «streamline» para que no se sienta atrasado.
 * El resaltador tiene ancho fijo y puntas planas.
 */
export function strokeOptions(size: number, simulated: boolean, last: boolean, tool: InkTool = 'pen'): StrokeOptions {
  if (tool === 'highlighter') {
    return { size, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, start: { cap: false }, end: { cap: false }, last }
  }
  return {
    size,
    thinning: simulated ? 0.5 : 0.6,
    smoothing: 0.5,
    streamline: simulated ? 0.5 : 0.35,
    simulatePressure: simulated,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last,
  }
}

/** Pasa los puntos intercalados (x, y, presión) al formato de perfect-freehand. */
export function toTriples(pts: ArrayLike<number>): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i + 2 < pts.length; i += 3) out.push([pts[i], pts[i + 1], pts[i + 2]])
  return out
}

/** Contorno del trazo (polígono cerrado), en las mismas coordenadas que los puntos. */
export function outlineOf(s: InkLike, last: boolean): number[][] {
  return getStroke(toTriples(s.pts), strokeOptions(s.size, s.simulated, last, s.tool))
}

/** Polígono suavizado con curvas cuadráticas entre puntos medios. */
export function pathFromOutline(outline: number[][]): Path2D {
  const path = new Path2D()
  const n = outline.length
  if (n < 2) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % n]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

const cache = new WeakMap<Stroke, Path2D>()

/** Path2D de un trazo confirmado; se calcula una vez y queda en memoria. */
export function strokePath(stroke: Stroke): Path2D {
  let p = cache.get(stroke)
  if (!p) {
    p = pathFromOutline(outlineOf(stroke, true))
    cache.set(stroke, p)
  }
  return p
}

export function primeStrokePath(stroke: Stroke, path: Path2D) {
  cache.set(stroke, path)
}
