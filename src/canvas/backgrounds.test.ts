import { describe, expect, it } from 'vitest'
import { gridOffset, lineAlpha, linePositions } from './backgrounds'

describe('linePositions', () => {
  it('devuelve las líneas del tramo visible, sin pasar del límite', () => {
    expect(linePositions(10, 10, 1000, 0, 45)).toEqual([10, 20, 30, 40])
    expect(linePositions(10, 10, 1000, 33, 61)).toEqual([40, 50, 60])
    expect(linePositions(10, 10, 35, 0, 1000)).toEqual([10, 20, 30])
  })

  it('no devuelve nada si el tramo queda antes del comienzo o vacío', () => {
    expect(linePositions(100, 10, 1000, 0, 50)).toEqual([])
    expect(linePositions(0, 10, 1000, 60, 50)).toEqual([])
  })
})

describe('gridOffset', () => {
  it('reparte el sobrante en los dos bordes', () => {
    expect(gridOffset(1240, 42)).toBeCloseTo((1240 % 42) / 2)
    expect(gridOffset(120, 30)).toBe(0)
  })
})

describe('lineAlpha', () => {
  it('se desvanece cuando las líneas quedan muy juntas en pantalla', () => {
    expect(lineAlpha(42, 1)).toBe(1)
    expect(lineAlpha(42, 0.05)).toBe(0) // 2,1 px
    const mid = lineAlpha(42, 0.15) // 6,3 px
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })
})
