/** Geometría básica para el reconocimiento de formas (pura, sin DOM). */
export interface P {
  x: number
  y: number
}

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)

export function pathLength(pts: readonly P[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i])
  return l
}

export function bounds(pts: readonly P[]) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, diag: Math.hypot(x1 - x0, y1 - y0) }
}

export function centroid(pts: readonly P[]): P {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

/** Remuestreo equiespaciado a `n` puntos (como el reconocedor $1). */
export function resample(pts: readonly P[], n: number): P[] {
  const L = pathLength(pts)
  if (pts.length < 2 || L === 0) return Array.from({ length: n }, () => ({ ...pts[0] }))
  const step = L / (n - 1)
  const out: P[] = [{ ...pts[0] }]
  let acc = 0
  let prev = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]
    let d = dist(prev, cur)
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d
      const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }
      out.push(q)
      prev = q
      d = dist(prev, cur)
      acc = 0
    }
    acc += d
    prev = cur
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  return out
}

export function distToSeg(p: P, a: P, b: P): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** Ramer–Douglas–Peucker: índices de los vértices que quedan. */
export function rdp(pts: readonly P[], eps: number): number[] {
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let best = -1
    let bestD = eps
    for (let i = a + 1; i < b; i++) {
      const d = distToSeg(pts[i], pts[a], pts[b])
      if (d > bestD) {
        bestD = d
        best = i
      }
    }
    if (best >= 0) {
      keep[best] = true
      stack.push([a, best], [best, b])
    }
  }
  return keep.flatMap((k, i) => (k ? [i] : []))
}

/** Ángulo interior en el vértice b (0–180°). */
export function angleAt(a: P, b: P, c: P): number {
  const v1 = Math.atan2(a.y - b.y, a.x - b.x)
  const v2 = Math.atan2(c.y - b.y, c.x - b.x)
  let d = Math.abs(v1 - v2) * (180 / Math.PI)
  if (d > 180) d = 360 - d
  return d
}

/** Distancia media de los puntos a un polígono (cerrado o abierto). */
export function meanDistToPolyline(pts: readonly P[], poly: readonly P[], closed: boolean): number {
  let sum = 0
  const n = poly.length
  const segs = closed ? n : n - 1
  for (const p of pts) {
    let best = Infinity
    for (let i = 0; i < segs; i++) best = Math.min(best, distToSeg(p, poly[i], poly[(i + 1) % n]))
    sum += best
  }
  return sum / pts.length
}

/** Polilínea densa (un punto cada `step` unidades) a partir de vértices. */
export function densify(verts: readonly P[], closed: boolean, step = 3): P[] {
  const out: P[] = []
  const n = verts.length
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % n]
    const k = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k })
  }
  out.push(closed ? { ...verts[0] } : { ...verts[n - 1] })
  return out
}
