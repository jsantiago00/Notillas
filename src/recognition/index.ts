import { fitCircle, fitEllipse, fitLine } from './fit'
import { angleAt, bounds, centroid, densify, dist, distToSeg, meanDistToPolyline, pathLength, rdp, resample, type P } from './geom'

export type ShapeKind = 'line' | 'arrow' | 'arc' | 'circle' | 'ellipse' | 'triangle' | 'rectangle' | 'square' | 'quad' | 'polygon'

export interface Shape {
  kind: ShapeKind
  /** Vértices de la forma (para curvas, una polilínea densa) */
  verts: P[]
  closed: boolean
  center: P
  /** Cómo se ajusta con el lápiz apoyado: el extremo sigue al lápiz, o escala y rota desde el centro */
  mode: 'endpoint' | 'similarity'
  /** Los círculos y elipses solo escalan (no rotan) */
  rotate: boolean
  /** Para «endpoint»: rehace la forma con el extremo en `tip` */
  rebuild?: (tip: P) => P[]
  /** Error normalizado (0 = perfecto) */
  error: number
}

const N = 64
const DEG = Math.PI / 180

/**
 * Reconoce una forma en un trazo (puntos x, y). Devuelve null si no se parece lo suficiente
 * a ninguna: el trazo queda como estaba.
 */
export function recognize(input: readonly P[]): Shape | null {
  if (input.length < 3) return null
  const L = pathLength(input)
  const box = bounds(input)
  if (L < 20 || box.diag < 15) return null
  const pts = resample(input, N)
  const D = box.diag
  const closed = dist(pts[0], pts[N - 1]) < 0.18 * D && L > 2 * D * 0.9
  return closed ? recognizeClosed(pts, D) : recognizeOpen(pts, L, D)
}

// ---------- Abiertas: línea, flecha, arco ----------

function recognizeOpen(pts: P[], L: number, D: number): Shape | null {
  const a = pts[0]
  const b = pts[pts.length - 1]
  const chord = dist(a, b)
  const line = fitLine(pts)
  if (chord / L > 0.9 && line.rms / L < 0.03) return lineShape(a, b, line.rms / L)

  const arrow = detectArrow(pts, L, D)
  if (arrow) return arrow

  const circle = fitCircle(pts)
  if (circle && circle.r < 3 * D && circle.rms / circle.r < 0.045) {
    // Barrido angular siguiendo el trazo
    let sweep = 0
    let prev = Math.atan2(pts[0].y - circle.cy, pts[0].x - circle.cx)
    for (const p of pts) {
      const ang = Math.atan2(p.y - circle.cy, p.x - circle.cx)
      let d = ang - prev
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      sweep += d
      prev = ang
    }
    const deg = Math.abs(sweep) / DEG
    if (deg >= 30 && deg <= 300) {
      const a0 = Math.atan2(pts[0].y - circle.cy, pts[0].x - circle.cx)
      const verts = Array.from({ length: 49 }, (_, i) => {
        const t = a0 + (sweep * i) / 48
        return { x: circle.cx + circle.r * Math.cos(t), y: circle.cy + circle.r * Math.sin(t) }
      })
      return { kind: 'arc', verts, closed: false, center: { x: circle.cx, y: circle.cy }, mode: 'similarity', rotate: true, error: circle.rms / circle.r }
    }
  }
  return null
}

/** Ajusta el ángulo a múltiplos de 45° si está a menos de 5°. */
function snapEnd(a: P, b: P): P {
  const len = dist(a, b)
  const ang = Math.atan2(b.y - a.y, a.x === b.x && a.y === b.y ? 1 : b.x - a.x)
  const snapped = Math.round(ang / (45 * DEG)) * 45 * DEG
  const use = Math.abs(ang - snapped) < 5 * DEG ? snapped : ang
  return { x: a.x + len * Math.cos(use), y: a.y + len * Math.sin(use) }
}

function lineShape(a: P, b: P, error: number): Shape {
  const end = snapEnd(a, b)
  return {
    kind: 'line',
    verts: [a, end],
    closed: false,
    center: a,
    mode: 'endpoint',
    rotate: true,
    rebuild: (tip) => [a, snapEnd(a, tip)],
    error,
  }
}

/** Flecha en un solo trazo: un tramo largo y recto, y al final un «gancho» corto en V. */
function detectArrow(pts: P[], L: number, D: number): Shape | null {
  const idx = rdp(pts, 0.04 * D)
  if (idx.length < 3 || idx.length > 7) return null
  const tail = pts[idx[0]]
  const tipI = idx[1]
  const tip = pts[tipI]
  const shaft = dist(tail, tip)
  if (shaft < 0.45 * L) return null
  // El tramo hasta la punta tiene que ser recto
  for (let i = 0; i <= tipI; i++) if (distToSeg(pts[i], tail, tip) > 0.04 * shaft) return null
  // Lo que sigue a la punta queda cerca de ella
  for (let i = tipI; i < pts.length; i++) if (dist(pts[i], tip) > 0.5 * shaft) return null
  const barb = pts[idx[2]]
  const barbLen = dist(barb, tip)
  if (barbLen < 0.08 * shaft) return null
  const ang = angleAt(tail, tip, barb)
  if (ang < 10 || ang > 80) return null
  const build = (t: P) => arrowVerts(tail, t, Math.min(barbLen, 0.4 * dist(tail, t)))
  return { kind: 'arrow', verts: build(tip), closed: false, center: tail, mode: 'endpoint', rotate: true, rebuild: build, error: 0 }
}

function arrowVerts(tail: P, tip: P, barb: number): P[] {
  const ang = Math.atan2(tail.y - tip.y, tail.x - tip.x)
  const b1 = { x: tip.x + barb * Math.cos(ang + 30 * DEG), y: tip.y + barb * Math.sin(ang + 30 * DEG) }
  const b2 = { x: tip.x + barb * Math.cos(ang - 30 * DEG), y: tip.y + barb * Math.sin(ang - 30 * DEG) }
  return [tail, tip, b1, tip, b2]
}

// ---------- Cerradas: polígonos y elipses ----------

const CLOSED_MAX_ERROR = 0.03

function recognizeClosed(pts: P[], D: number): Shape | null {
  const loop = pts.slice(0, -1)
  const c = centroid(loop)
  const poly = polygonFrom(loop, c, D)
  const polyErr = poly ? meanDistToPolyline(loop, poly, true) / D : Infinity

  const ell = fitEllipse(loop)
  const ellErr = ell ? ell.err / D : Infinity

  const usePoly = poly && poly.length >= 3 && poly.length <= 6 && polyErr < CLOSED_MAX_ERROR && polyErr <= ellErr * 1.15
  if (usePoly) return polygonShape(poly, polyErr)
  if (ell && ellErr < CLOSED_MAX_ERROR) {
    const center = { x: ell.cx, y: ell.cy }
    if (Math.min(ell.a, ell.b) / Math.max(ell.a, ell.b) > 0.85) {
      const r = loop.reduce((s, p) => s + dist(p, center), 0) / loop.length
      return { kind: 'circle', verts: ellipseVerts(center, r, r, 0), closed: true, center, mode: 'similarity', rotate: false, error: ellErr }
    }
    return { kind: 'ellipse', verts: ellipseVerts(center, ell.a, ell.b, ell.theta), closed: true, center, mode: 'similarity', rotate: false, error: ellErr }
  }
  return null
}

function ellipseVerts(c: P, a: number, b: number, theta: number): P[] {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return Array.from({ length: 72 }, (_, i) => {
    const t = (i / 72) * 2 * Math.PI
    const u = a * Math.cos(t)
    const v = b * Math.sin(t)
    return { x: c.x + u * cos - v * sin, y: c.y + u * sin + v * cos }
  })
}

/** Vértices del polígono: RDP empezando en el punto más lejano al centro, y limpieza de esquinas. */
function polygonFrom(loop: P[], c: P, D: number): P[] | null {
  let far = 0
  loop.forEach((p, i) => {
    if (dist(p, c) > dist(loop[far], c)) far = i
  })
  const ring = [...loop.slice(far), ...loop.slice(0, far)]
  ring.push(ring[0])
  let verts = rdp(ring, 0.045 * D).map((i) => ring[i])
  verts.pop() // el último repite el primero
  // Fusionar esquinas muy cercanas y sacar las casi llanas
  for (let changed = true; changed && verts.length > 3; ) {
    changed = false
    for (let i = 0; i < verts.length && verts.length > 3; i++) {
      const prev = verts[(i - 1 + verts.length) % verts.length]
      const cur = verts[i]
      const next = verts[(i + 1) % verts.length]
      if (dist(cur, next) < 0.1 * D) {
        verts[i] = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 }
        verts.splice((i + 1) % verts.length, 1)
        changed = true
        break
      }
      if (angleAt(prev, cur, next) > 155) {
        verts.splice(i, 1)
        changed = true
        break
      }
    }
  }
  verts = verts.filter(Boolean)
  return verts.length >= 3 ? verts : null
}

function polygonShape(verts: P[], error: number): Shape {
  const c = centroid(verts)
  const base = { closed: true, center: c, mode: 'similarity' as const, rotate: true, error }
  if (verts.length === 3) return { ...base, kind: 'triangle', verts }
  if (verts.length === 4) {
    const angles = verts.map((v, i) => angleAt(verts[(i + 3) % 4], v, verts[(i + 1) % 4]))
    if (angles.every((a) => Math.abs(a - 90) < 15)) {
      const rect = fitRectangle(verts)
      return { ...base, kind: rect.square ? 'square' : 'rectangle', verts: rect.verts, center: rect.center }
    }
    return { ...base, kind: 'quad', verts }
  }
  return { ...base, kind: 'polygon', verts: regularize(verts, c) }
}

/** Rectángulo a partir de 4 esquinas: orientación media, alineado a los ejes si está casi derecho. */
function fitRectangle(v: P[]): { verts: P[]; center: P; square: boolean } {
  // Orientación: promedio de las direcciones de los lados, módulo 90°
  let sx = 0
  let sy = 0
  for (let i = 0; i < 4; i++) {
    const a = Math.atan2(v[(i + 1) % 4].y - v[i].y, v[(i + 1) % 4].x - v[i].x) * 4
    sx += Math.cos(a)
    sy += Math.sin(a)
  }
  let theta = Math.atan2(sy, sx) / 4
  const snapped = Math.round(theta / (90 * DEG)) * 90 * DEG
  if (Math.abs(theta - snapped) < 7 * DEG) theta = snapped
  const c = centroid(v)
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  let hw = 0
  let hh = 0
  for (const p of v) {
    hw += Math.abs((p.x - c.x) * cos + (p.y - c.y) * sin)
    hh += Math.abs(-(p.x - c.x) * sin + (p.y - c.y) * cos)
  }
  hw /= 4
  hh /= 4
  const ratio = Math.min(hw, hh) / Math.max(hw, hh)
  const square = ratio > 0.9
  if (square) hw = hh = (hw + hh) / 2
  const corner = (u: number, w: number) => ({ x: c.x + u * cos - w * sin, y: c.y + u * sin + w * cos })
  return { verts: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)], center: c, square }
}

/** Pentágonos y hexágonos con lados y ángulos parecidos: se vuelven regulares. */
function regularize(v: P[], c: P): P[] {
  const n = v.length
  const sides = v.map((p, i) => dist(p, v[(i + 1) % n]))
  const mean = sides.reduce((a, b) => a + b, 0) / n
  const cv = Math.sqrt(sides.reduce((a, s) => a + (s - mean) ** 2, 0) / n) / mean
  if (cv > 0.2) return v
  const r = v.reduce((a, p) => a + dist(p, c), 0) / n
  const a0 = Math.atan2(v[0].y - c.y, v[0].x - c.x)
  // Mismo sentido de giro que el dibujo
  const area = v.reduce((a, p, i) => a + p.x * v[(i + 1) % n].y - v[(i + 1) % n].x * p.y, 0)
  const dir = area >= 0 ? 1 : -1
  return Array.from({ length: n }, (_, i) => {
    const t = a0 + (dir * 2 * Math.PI * i) / n
    return { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) }
  })
}

// ---------- Ajuste con el lápiz apoyado ----------

/**
 * Devuelve la forma ajustada a la posición actual del lápiz. `anchor` es dónde estaba el
 * lápiz cuando se reconoció la forma.
 */
export function adjustShape(shape: Shape, anchor: P, pen: P): P[] {
  if (shape.mode === 'endpoint' && shape.rebuild) return shape.rebuild(pen)
  const c = shape.center
  const v0 = { x: anchor.x - c.x, y: anchor.y - c.y }
  const v1 = { x: pen.x - c.x, y: pen.y - c.y }
  const l0 = Math.hypot(v0.x, v0.y)
  if (l0 < 1) return shape.verts
  const k = Math.max(0.1, Math.min(10, Math.hypot(v1.x, v1.y) / l0))
  const rot = shape.rotate ? Math.atan2(v1.y, v1.x) - Math.atan2(v0.y, v0.x) : 0
  const cos = Math.cos(rot) * k
  const sin = Math.sin(rot) * k
  return shape.verts.map((p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }))
}

/** Puntos x, y, presión (constante) listos para el trazo. */
export function shapePoints(verts: readonly P[], closed: boolean): number[] {
  return densify(verts, closed).flatMap((p) => [p.x, p.y, 0.5])
}

/** Parámetros compactos para guardar como metadato del trazo. */
export function shapeParams(verts: readonly P[]): number[] {
  const v = verts.length > 8 ? verts.filter((_, i) => i % Math.ceil(verts.length / 8) === 0) : verts
  return v.flatMap((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10])
}
