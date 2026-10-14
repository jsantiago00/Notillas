import { describe, expect, it } from 'vitest'
import { adjustShape, recognize, type ShapeKind } from './index'
import { dist, type P } from './geom'

/** RNG con semilla (mulberry32), para que los tests sean reproducibles. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Recorre los vértices con muchos puntos y le suma ruido suave (temblor de la mano). */
function hand(verts: P[], { closed = false, noise = 0.012, seed = 1, step = 2 } = {}): P[] {
  const r = rng(seed)
  const size = Math.max(...verts.map((v) => v.x)) - Math.min(...verts.map((v) => v.x)) + Math.max(...verts.map((v) => v.y)) - Math.min(...verts.map((v) => v.y))
  const amp = noise * size
  const path = closed ? [...verts, verts[0]] : verts
  const out: P[] = []
  let drift = { x: 0, y: 0 }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const k = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let j = 0; j < k; j++) {
      drift = { x: drift.x * 0.9 + (r() - 0.5) * amp * 0.4, y: drift.y * 0.9 + (r() - 0.5) * amp * 0.4 }
      out.push({ x: a.x + ((b.x - a.x) * j) / k + drift.x, y: a.y + ((b.y - a.y) * j) / k + drift.y })
    }
  }
  out.push({ ...path[path.length - 1] })
  return out
}

const ellipse = (cx: number, cy: number, a: number, b: number, rot: number, from = 0, to = 2 * Math.PI, n = 120) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / n
    const u = a * Math.cos(t)
    const v = b * Math.sin(t)
    return { x: cx + u * Math.cos(rot) - v * Math.sin(rot), y: cy + u * Math.sin(rot) + v * Math.cos(rot) }
  })
const rotated = (pts: P[], deg: number, c: P = { x: 300, y: 300 }) => {
  const r = (deg * Math.PI) / 180
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * Math.cos(r) - (p.y - c.y) * Math.sin(r), y: c.y + (p.x - c.x) * Math.sin(r) + (p.y - c.y) * Math.cos(r) }))
}
const regular = (n: number, r: number, c: P = { x: 300, y: 300 }, a0 = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos(a0 + (2 * Math.PI * i) / n), y: c.y + r * Math.sin(a0 + (2 * Math.PI * i) / n) }))

const kind = (pts: P[]): ShapeKind | null => recognize(pts)?.kind ?? null

describe('recognize: formas abiertas', () => {
  it('línea, y la ajusta a 0°, 45° y 90°', () => {
    const s = recognize(hand([{ x: 100, y: 100 }, { x: 400, y: 108 }], { seed: 2 }))!
    expect(s.kind).toBe('line')
    expect(s.verts[1].y).toBeCloseTo(100, 0)
    const diag = recognize(hand([{ x: 100, y: 100 }, { x: 300, y: 310 }], { seed: 3 }))!
    expect(diag.kind).toBe('line')
    const [a, b] = diag.verts
    expect(Math.abs(b.x - a.x - (b.y - a.y))).toBeLessThan(0.01)
  })

  it('línea en otro ángulo queda en ese ángulo', () => {
    const s = recognize(hand([{ x: 100, y: 100 }, { x: 400, y: 220 }], { seed: 4 }))!
    expect(s.kind).toBe('line')
    expect(s.verts[1].y).toBeGreaterThan(200)
  })

  it('flecha en un solo trazo', () => {
    const tail = { x: 100, y: 300 }
    const tip = { x: 400, y: 300 }
    const b1 = { x: 350, y: 270 }
    const b2 = { x: 350, y: 330 }
    expect(kind(hand([tail, tip, b1, tip, b2], { seed: 5, noise: 0.008 }))).toBe('arrow')
  })

  it('arco', () => {
    expect(kind(hand(ellipse(300, 300, 150, 150, 0, 0, Math.PI), { seed: 6 }))).toBe('arc')
    expect(kind(hand(ellipse(300, 300, 120, 120, 0.5, 0, Math.PI * 1.3), { seed: 7 }))).toBe('arc')
  })
})

describe('recognize: formas cerradas', () => {
  it('círculo', () => {
    for (let seed = 10; seed < 15; seed++) expect(kind(hand(ellipse(300, 300, 120, 120, 0), { closed: true, seed }))).toBe('circle')
  })

  it('elipse rotada', () => {
    const s = recognize(hand(ellipse(300, 300, 180, 80, 0.6), { closed: true, seed: 20 }))!
    expect(s.kind).toBe('ellipse')
  })

  it('triángulo', () => {
    for (let seed = 30; seed < 34; seed++) expect(kind(hand(regular(3, 150), { closed: true, seed }))).toBe('triangle')
  })

  it('rectángulo derecho queda alineado a los ejes', () => {
    const s = recognize(hand([{ x: 100, y: 100 }, { x: 420, y: 104 }, { x: 418, y: 280 }, { x: 98, y: 276 }], { closed: true, seed: 40 }))!
    expect(s.kind).toBe('rectangle')
    expect(s.verts[0].y).toBeCloseTo(s.verts[1].y, 5)
  })

  it('rectángulo rotado y cuadrado', () => {
    const rect = rotated([{ x: 150, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 380 }, { x: 150, y: 380 }], 25)
    expect(kind(hand(rect, { closed: true, seed: 41 }))).toBe('rectangle')
    const sq = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }]
    expect(kind(hand(sq, { closed: true, seed: 42 }))).toBe('square')
  })

  it('pentágono y hexágono', () => {
    expect(kind(hand(regular(5, 160), { closed: true, seed: 50 }))).toBe('polygon')
    expect(kind(hand(regular(6, 160), { closed: true, seed: 51 }))).toBe('polygon')
  })
})

describe('recognize: lo que NO es una forma', () => {
  it('garabatos y letras quedan como trazo libre', () => {
    const r = rng(99)
    const scribble = Array.from({ length: 200 }, (_, i) => ({ x: 200 + Math.sin(i / 3) * 80 + r() * 60, y: 200 + Math.cos(i / 7) * 90 + i * 0.8 }))
    expect(recognize(scribble)).toBeNull()
    // Una «S»
    const s = [...ellipse(300, 200, 60, 50, 0, -0.3, Math.PI * 1.5, 60), ...ellipse(300, 300, 60, 50, 0, -Math.PI / 2, -Math.PI * 1.7, 60).reverse().reverse()]
    expect(recognize(hand(s, { seed: 60 }))).toBeNull()
    // Zigzag tipo «W»
    const w = [{ x: 100, y: 100 }, { x: 150, y: 300 }, { x: 200, y: 150 }, { x: 250, y: 300 }, { x: 300, y: 100 }]
    expect(recognize(hand(w, { seed: 61 }))).toBeNull()
    // Espiral
    const spiral = Array.from({ length: 200 }, (_, i) => ({ x: 300 + i * 0.8 * Math.cos(i / 12), y: 300 + i * 0.8 * Math.sin(i / 12) }))
    expect(recognize(spiral)).toBeNull()
  })

  it('trazos muy chicos no se reconocen', () => {
    expect(recognize([{ x: 0, y: 0 }, { x: 3, y: 2 }, { x: 5, y: 5 }])).toBeNull()
  })
})

describe('adjustShape', () => {
  it('la línea sigue al lápiz', () => {
    const s = recognize(hand([{ x: 100, y: 100 }, { x: 400, y: 100 }], { seed: 70 }))!
    const v = adjustShape(s, { x: 400, y: 100 }, { x: 500, y: 100 })
    expect(v[1].x).toBeCloseTo(500, 0)
  })

  it('el círculo escala desde el centro', () => {
    const s = recognize(hand(ellipse(300, 300, 100, 100, 0), { closed: true, seed: 71 }))!
    const v = adjustShape(s, { x: 400, y: 300 }, { x: 500, y: 300 })
    const r = v.reduce((a, p) => a + dist(p, s.center), 0) / v.length
    expect(r).toBeGreaterThan(180)
  })
})
