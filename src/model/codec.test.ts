import { describe, expect, it } from 'vitest'
import { decodePoints, encodePoints } from './codec'

describe('codec de puntos', () => {
  it('ida y vuelta con precisión de 0,1 unidades y presión de 1/255', () => {
    const pts = [0, 0, 0, 12.34, 1753.96, 0.5, -40.04, 1240, 1, 620.05, 3.3, 0.731]
    const back = decodePoints(encodePoints(pts))
    expect(back).toHaveLength(pts.length)
    for (let i = 0; i < pts.length; i++) {
      expect(Math.abs(back[i] - pts[i])).toBeLessThanOrEqual(i % 3 === 2 ? 1 / 255 : 0.05 + 1e-9)
    }
  })

  it('ocupa 5 bytes por punto', () => {
    expect(encodePoints(new Array(2000 * 3).fill(1)).byteLength).toBe(10_000)
  })

  it('recorta fuera de rango en vez de desbordar', () => {
    const [x, y, p] = decodePoints(encodePoints([99999, -99999, 7]))
    expect(x).toBeCloseTo(3276.7)
    expect(y).toBeCloseTo(-3276.7)
    expect(p).toBe(1)
  })

  it('lee bytes que no empiezan al principio del buffer', () => {
    const enc = encodePoints([1, 2, 0.5])
    const big = new Uint8Array(enc.length + 3)
    big.set(enc, 3)
    expect(decodePoints(big.subarray(3))).toEqual(decodePoints(enc))
  })
})
