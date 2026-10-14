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
