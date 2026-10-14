import { centroid, dist, type P } from './geom'

/** Recta por mínimos cuadrados totales: dirección principal y error cuadrático medio. */
export function fitLine(pts: readonly P[]) {
  const c = centroid(pts)
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of pts) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const nx = -Math.sin(theta)
  const ny = Math.cos(theta)
  let sq = 0
  for (const p of pts) sq += ((p.x - c.x) * nx + (p.y - c.y) * ny) ** 2
  return { c, theta, rms: Math.sqrt(sq / pts.length) }
}

/**
 * Círculo: ajuste algebraico de Kåsa (lineal) y unas iteraciones de Gauss–Newton sobre
 * la distancia geométrica.
 */
export function fitCircle(pts: readonly P[]): { cx: number; cy: number; r: number; rms: number } | null {
  // x² + y² + D x + E y + F = 0 → mínimos cuadrados en (D, E, F)
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0
  const n = pts.length
  for (const { x, y } of pts) {
    const z = x * x + y * y
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
    sz += z
    sxz += x * z
    syz += y * z
  }
  const sol = solve3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxz, -syz, -sz],
  )
  if (!sol) return null
  let cx = -sol[0] / 2
  let cy = -sol[1] / 2
  let r = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]))
  for (let it = 0; it < 8; it++) {
    // Gauss–Newton: residuo r_i = |p_i − c| − r
    const jtj = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    const jtr = [0, 0, 0]
    for (const p of pts) {
      const d = Math.max(1e-9, Math.hypot(p.x - cx, p.y - cy))
      const j = [-(p.x - cx) / d, -(p.y - cy) / d, -1]
      const res = d - r
      for (let a = 0; a < 3; a++) {
        jtr[a] += j[a] * res
        for (let b = 0; b < 3; b++) jtj[a][b] += j[a] * j[b]
      }
    }
    const step = solve3(jtj, jtr.map((v) => -v))
    if (!step) break
    cx += step[0]
    cy += step[1]
    r += step[2]
    if (Math.hypot(step[0], step[1], step[2]) < 1e-6) break
  }
  let sq = 0
  for (const p of pts) sq += (dist(p, { x: cx, y: cy }) - r) ** 2
  return { cx, cy, r: Math.abs(r), rms: Math.sqrt(sq / n) }
}

/**
 * Elipse: centro y orientación por componentes principales; los semiejes, por mínimos
 * cuadrados de A·u² + B·v² = 1 en los ejes rotados. Error: distancia radial media.
 */
export function fitEllipse(pts: readonly P[]): { cx: number; cy: number; a: number; b: number; theta: number; err: number } | null {
  const c = centroid(pts)
  const { theta } = fitLine(pts)
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  let s40 = 0, s04 = 0, s22 = 0, s20 = 0, s02 = 0
  const uv = pts.map((p) => {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos
    s40 += u ** 4
    s04 += v ** 4
    s22 += u * u * v * v
    s20 += u * u
    s02 += v * v
    return [u, v]
  })
  const det = s40 * s04 - s22 * s22
  if (Math.abs(det) < 1e-12) return null
  const A = (s20 * s04 - s02 * s22) / det
  const B = (s40 * s02 - s22 * s20) / det
  if (A <= 0 || B <= 0) return null
  const a = 1 / Math.sqrt(A)
  const b = 1 / Math.sqrt(B)
  let sum = 0
  for (const [u, v] of uv) {
    const phi = Math.atan2(v, u)
    const re = (a * b) / Math.hypot(b * Math.cos(phi), a * Math.sin(phi))
    sum += Math.abs(Math.hypot(u, v) - re)
  }
  return { cx: c.x, cy: c.y, a, b, theta, err: sum / pts.length }
}

/** Sistema 3×3 por Cramer. */
function solve3(m: number[][], v: number[]): number[] | null {
  const d = det3(m)
  if (Math.abs(d) < 1e-12) return null
  return [0, 1, 2].map((k) => det3(m.map((row, i) => row.map((x, j) => (j === k ? v[i] : x)))) / d)
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}
