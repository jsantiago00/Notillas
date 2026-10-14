import { describe, expect, it } from 'vitest'
import { relativeTime } from './time'

describe('relativeTime', () => {
  const now = Date.UTC(2026, 9, 14, 12)
  it('dice «recién» con menos de un minuto', () => {
    expect(relativeTime(now - 20_000, now)).toBe('recién')
  })
  it('usa minutos, horas y días', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toMatch(/5 minutos/)
    expect(relativeTime(now - 3 * 3600_000, now)).toMatch(/3 horas/)
    expect(relativeTime(now - 24 * 3600_000, now)).toBe('ayer')
  })
})
