import { describe, expect, it } from 'vitest'
import { Viewport } from './Viewport'

function makeViewport() {
  const v = new Viewport()
  v.setContent({ x: 0, y: 0, w: 1240, h: 5000 })
  v.setSize(800, 1280)
  v.fitWidth()
  return v
}

describe('Viewport', () => {
  it('ajusta al ancho con margen', () => {
    const v = makeViewport()
    expect(v.cam.zoom).toBeCloseTo((800 - 48) / 1240)
    const [sx] = v.toScreen(0, 0)
    expect(sx).toBeCloseTo(24)
  })

  it('toWorld y toScreen son inversas', () => {
    const v = makeViewport()
    v.zoomAt(2.3, 100, 200)
    const [wx, wy] = v.toWorld(321, 654)
    const [sx, sy] = v.toScreen(wx, wy)
    expect(sx).toBeCloseTo(321)
    expect(sy).toBeCloseTo(654)
  })

  it('el zoom deja fijo el punto bajo el cursor', () => {
    const v = makeViewport()
    v.panBy(0, -400)
    const before = v.toWorld(400, 600)
    v.zoomAt(2, 400, 600)
    const after = v.toWorld(400, 600)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
  })

  it('respeta los límites de zoom', () => {
    const v = makeViewport()
    v.zoomAt(1000, 0, 0)
    expect(v.cam.zoom).toBe(v.maxZoom)
    v.zoomAt(0.00001, 0, 0)
    expect(v.cam.zoom).toBe(v.minZoom)
  })

  it('centra el contenido cuando entra a lo ancho', () => {
    const v = makeViewport()
    v.zoomAt(0.5, 0, 0)
    v.panBy(300, 0)
    const [left] = v.toScreen(0, 0)
    const [right] = v.toScreen(1240, 0)
    expect(left).toBeCloseTo(800 - right)
  })

  it('no deja desplazar más allá del principio del contenido', () => {
    const v = makeViewport()
    v.panBy(0, 10_000)
    const [, top] = v.toScreen(0, 0)
    expect(top).toBeCloseTo(24)
  })

  it('el pellizco deja el punto anclado bajo los dedos', () => {
    const v = makeViewport()
    v.panBy(0, -1000)
    const anchor = v.toWorld(400, 640)
    v.pinchTo(anchor, v.cam.zoom * 1.8, 380, 600)
    const [sx, sy] = v.toScreen(anchor[0], anchor[1])
    expect(sx).toBeCloseTo(380)
    expect(sy).toBeCloseTo(600)
  })

  it('la inercia avanza y se frena sola', () => {
    const v = makeViewport()
    v.panBy(0, -1000)
    const y0 = v.cam.y
    v.fling(0, -2)
    let frames = 0
    while (v.stepInertia(16) && frames < 1000) frames++
    expect(v.cam.y).toBeGreaterThan(y0)
    expect(frames).toBeLessThan(1000)
    expect(v.inertiaActive).toBe(false)
  })
})
