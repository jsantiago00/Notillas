import { describe, expect, it } from 'vitest'
import { inkColor, luminance } from './background'

describe('inkColor', () => {
  it('aclara la tinta negra sobre papel oscuro y deja el resto igual', () => {
    expect(inkColor('#1f1d1a', '#26272b')).toBe('#ececec')
    expect(inkColor('#1f1d1a', '#ffffff')).toBe('#1f1d1a')
    expect(inkColor('#2f5bd3', '#26272b')).toBe('#2f5bd3')
  })
  it('luminancia', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1)
  })
})
