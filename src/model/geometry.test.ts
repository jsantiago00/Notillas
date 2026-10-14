import { describe, expect, it } from 'vitest'
import {
  bboxIntersects,
  bboxOf,
  bboxUnion,
  cutPolyline,
  distToSegment,
  fractionInside,
  pointInPolygon,
  polylineHitsCircle,
  rectContains,
  transformPts,
} from './geometry'

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

describe('distToSegment', () => {
  it('mide al punto más cercano del segmento', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBe(3)
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBe(5)
    expect(distToSegment(1, 1, 2, 2, 2, 2)).toBeCloseTo(Math.SQRT2)
  })
})

describe('pointInPolygon y fractionInside', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10]
  it('distingue adentro y afuera', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true)
    expect(pointInPolygon(15, 5, square)).toBe(false)
  })
  it('cuenta la fracción de puntos adentro', () => {
    expect(fractionInside([1, 1, 0.5, 5, 5, 0.5, 20, 20, 0.5, 30, 1, 0.5], square)).toBe(0.5)
  })
})

describe('polylineHitsCircle', () => {
  const line = [0, 0, 0.5, 100, 0, 0.5]
  it('toca si el círculo llega a la línea más su medio grosor', () => {
    expect(polylineHitsCircle(line, 50, 8, 5, 4)).toBe(true)
    expect(polylineHitsCircle(line, 50, 10, 5, 4)).toBe(false)
  })
})

describe('cutPolyline', () => {
  const line = [0, 0, 0.5, 100, 0, 0.5]
  it('parte el trazo en dos donde pasa la goma', () => {
    const pieces = cutPolyline(line, 50, 0, 10)!
    expect(pieces).toHaveLength(2)
    expect(Math.max(...pieces[0].filter((_, i) => i % 3 === 0))).toBeLessThan(41)
    expect(Math.min(...pieces[1].filter((_, i) => i % 3 === 0))).toBeGreaterThan(59)
  })
  it('devuelve null si no toca y nada si lo cubre entero', () => {
    expect(cutPolyline(line, 50, 30, 10)).toBeNull()
    expect(cutPolyline(line, 50, 0, 200)).toEqual([])
  })
})

describe('transformPts y bboxUnion', () => {
  it('escala desde un origen y traslada, sin tocar la presión', () => {
    expect(transformPts([10, 10, 0.3], 2, 0, 0, 5, -5)).toEqual([25, 15, 0.3])
  })
  it('une cajas', () => {
    expect(bboxUnion([[0, 0, 1, 1], [-1, 2, 3, 4]])).toEqual([-1, 0, 3, 4])
    expect(bboxUnion([])).toBeNull()
  })
})
