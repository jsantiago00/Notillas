import { describe, expect, it } from 'vitest'
import { bboxIntersects, bboxOf, rectContains } from './geometry'

describe('bboxOf', () => {
  it('calcula la caja con paso 3 (x, y, presión) y margen', () => {
    expect(bboxOf([1, 2, 0.5, -3, 8, 0.5, 4, 0, 1], 3, 1)).toEqual([-4, -1, 5, 9])
  })
  it('devuelve una caja vacía sin puntos', () => {
    expect(bboxOf([], 3)).toEqual([0, 0, 0, 0])
  })
})

describe('bboxIntersects', () => {
  it('detecta solapamiento, contacto y separación', () => {
    expect(bboxIntersects([0, 0, 10, 10], [5, 5, 15, 15])).toBe(true)
    expect(bboxIntersects([0, 0, 10, 10], [10, 0, 20, 10])).toBe(true)
    expect(bboxIntersects([0, 0, 10, 10], [11, 0, 20, 10])).toBe(false)
    expect(bboxIntersects([0, 0, 10, 10], [0, -5, 10, -1])).toBe(false)
  })
})

describe('rectContains', () => {
  it('incluye los bordes', () => {
    const r = { x: 0, y: 0, w: 10, h: 5 }
    expect(rectContains(r, 10, 5)).toBe(true)
    expect(rectContains(r, 10.1, 5)).toBe(false)
  })
})
