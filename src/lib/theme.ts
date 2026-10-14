import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'notillas.theme'

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function apply(t: ThemePref) {
  const root = document.documentElement
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
}

export const useTheme = create<{ pref: ThemePref }>(() => ({ pref: read() }))

export function setTheme(t: ThemePref) {
  try {
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch {
    /* modo privado: se aplica igual en esta sesión */
  }
  apply(t)
  useTheme.setState({ pref: t })
}

/** Rota sistema → claro → oscuro. */
export function cycleTheme() {
  const order: ThemePref[] = ['system', 'light', 'dark']
  setTheme(order[(order.indexOf(useTheme.getState().pref) + 1) % order.length])
}
