import type { BBox } from './types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Caja de una lista de puntos [x, y] intercalados (con paso `stride`), agrandada en `pad`. */
export function bboxOf(flat: ArrayLike<number>, stride: number, pad = 0): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < flat.length; i += stride) {
    const x = flat[i]
    const y = flat[i + 1]
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  if (x0 === Infinity) return [0, 0, 0, 0]
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

export function rectToBBox(r: Rect): BBox {
  return [r.x, r.y, r.x + r.w, r.y + r.h]
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** Distancia del punto (px, py) al segmento a–b. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Punto dentro de un polígono (lista plana x, y), por paridad de cruces. */
export function pointInPolygon(x: number, y: number, poly: ArrayLike<number>): boolean {
  let inside = false
  const n = poly.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]
    const yi = poly[2 * i + 1]
    const xj = poly[2 * j]
    const yj = poly[2 * j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Fracción de los puntos (x, y, p) que caen dentro del polígono. */
export function fractionInside(pts: ArrayLike<number>, poly: ArrayLike<number>): number {
  const n = Math.floor(pts.length / 3)
  if (n === 0 || poly.length < 6) return 0
  let inside = 0
  for (let i = 0; i < n; i++) if (pointInPolygon(pts[3 * i], pts[3 * i + 1], poly)) inside++
  return inside / n
}

/** ¿El círculo (cx, cy, r) toca la línea central del trazo, agrandada en `halfWidth`? */
export function polylineHitsCircle(pts: ArrayLike<number>, cx: number, cy: number, r: number, halfWidth: number): boolean {
  const n = Math.floor(pts.length / 3)
  const reach = r + halfWidth
  if (n === 1) return Math.hypot(pts[0] - cx, pts[1] - cy) <= reach
  for (let i = 1; i < n; i++) {
    if (distToSegment(cx, cy, pts[3 * i - 3], pts[3 * i - 2], pts[3 * i], pts[3 * i + 1]) <= reach) return true
  }
  return false
}

/**
 * Goma por área: saca los puntos que quedan dentro del círculo y devuelve los tramos
 * que sobreviven (cada uno como lista x, y, p). Devuelve null si el círculo no toca el trazo.
 * Los segmentos largos se subdividen para que el corte sea preciso aunque haya pocos puntos.
 */
export function cutPolyline(pts: readonly number[], cx: number, cy: number, r: number): number[][] | null {
  const n = Math.floor(pts.length / 3)
  const step = Math.max(0.5, r / 3)
  const dense: number[] = []
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const [ax, ay, ap] = [pts[3 * i - 3], pts[3 * i - 2], pts[3 * i - 1]]
      const [bx, by, bp] = [pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]]
      const k = Math.ceil(Math.hypot(bx - ax, by - ay) / step)
      for (let j = 1; j < k; j++) {
        const t = j / k
        dense.push(ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t)
      }
    }
    dense.push(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2])
  }
  const pieces: number[][] = []
  let current: number[] = []
  let hit = false
  for (let i = 0; i < dense.length; i += 3) {
    if (Math.hypot(dense[i] - cx, dense[i + 1] - cy) <= r) {
      hit = true
      if (current.length) pieces.push(current)
      current = []
    } else {
      current.push(dense[i], dense[i + 1], dense[i + 2])
    }
  }
  if (!hit) return null
  if (current.length) pieces.push(current)
  // Un tramo de un solo punto no se ve como trazo: se descarta
  return pieces.filter((p) => p.length >= 6)
}

/** Aplica una transformación afín (escala uniforme `k` desde (ox, oy) y traslación) a puntos x, y, p. */
export function transformPts(pts: readonly number[], k: number, ox: number, oy: number, dx: number, dy: number): number[] {
  const out = pts.slice()
  for (let i = 0; i + 1 < out.length; i += 3) {
    out[i] = ox + (out[i] - ox) * k + dx
    out[i + 1] = oy + (out[i + 1] - oy) * k + dy
  }
  return out
}

/** Unión de cajas. */
export function bboxUnion(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null
  const b: BBox = [...boxes[0]]
  for (const o of boxes) {
    b[0] = Math.min(b[0], o[0])
    b[1] = Math.min(b[1], o[1])
    b[2] = Math.max(b[2], o[2])
    b[3] = Math.max(b[3], o[3])
  }
  return b
}
