import { describe, expect, it } from 'vitest'
import { PALM_WINDOW_MS, PalmGuard } from './palm'

describe('PalmGuard', () => {
  it('deja tocar si nunca se vio el lápiz', () => {
    expect(new PalmGuard().touchAllowed(0)).toBe(true)
  })

  it('ignora toques con el lápiz apoyado, aunque pase el tiempo', () => {
    const g = new PalmGuard()
    g.notePen(1000, true)
    expect(g.touchAllowed(1000 + PALM_WINDOW_MS * 10)).toBe(false)
  })

  it('ignora toques hasta 300 ms después de levantar o de pasar el lápiz cerca', () => {
    const g = new PalmGuard()
    g.notePen(1000, true)
    g.notePen(1200, false)
    expect(g.touchAllowed(1200 + PALM_WINDOW_MS - 1)).toBe(false)
    expect(g.touchAllowed(1200 + PALM_WINDOW_MS + 1)).toBe(true)
    g.notePen(5000, false) // hover
    expect(g.touchAllowed(5100)).toBe(false)
  })
})
