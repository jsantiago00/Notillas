import { describe, expect, it } from 'vitest'
import { prefersRedirectLogin } from './device'

const base = { standalone: false, touchPrimary: false, ipadDesktopUA: false }

describe('prefersRedirectLogin', () => {
  it('usa popup en escritorio', () => {
    expect(prefersRedirectLogin(base, true)).toBe(false)
  })
  it('usa redirect en la PWA instalada, aunque sea escritorio', () => {
    expect(prefersRedirectLogin({ ...base, standalone: true }, true)).toBe(true)
  })
  it('usa redirect en celulares y tablets', () => {
    expect(prefersRedirectLogin({ ...base, touchPrimary: true }, true)).toBe(true)
  })
  it('usa redirect en iPad que se presenta como Mac', () => {
    expect(prefersRedirectLogin({ ...base, ipadDesktopUA: true }, true)).toBe(true)
  })
  it('usa popup si la app no está en el dominio de authDomain (GitHub Pages, red local)', () => {
    expect(prefersRedirectLogin({ standalone: true, touchPrimary: true, ipadDesktopUA: true }, false)).toBe(false)
  })
})
