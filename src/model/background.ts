import type { Background, BackgroundType } from './types'

/** La hoja mide 1240 unidades para 210 mm: unas 5,9 unidades por milímetro. */
export const SPACINGS = [
  { label: 'Chico', value: 30 }, // 5 mm
  { label: 'Medio', value: 42 }, // 7 mm, el rayado común
  { label: 'Grande', value: 56 }, // 9,5 mm
] as const

export const SPACING_MIN = 20
export const SPACING_MAX = 80

export const LINE_COLORS = [
  { label: 'Gris', value: '#c4c8ce' },
  { label: 'Azul', value: '#9dbbe8' },
  { label: 'Verde', value: '#a6d1ab' },
  { label: 'Rosa', value: '#e9b3bb' },
] as const

export const PAPERS = [
  { label: 'Blanco', value: '#ffffff' },
  { label: 'Crema', value: '#fbf5e6' },
  { label: 'Oscuro', value: '#26272b' },
] as const

export const BACKGROUND_TYPES: { type: BackgroundType; label: string }[] = [
  { type: 'blank', label: 'Lisa' },
  { type: 'ruled', label: 'Rayada' },
  { type: 'grid', label: 'Cuadriculada' },
  { type: 'dots', label: 'Punteada' },
]

export const DEFAULT_BACKGROUND: Background = {
  type: 'blank',
  spacing: 42,
  color: LINE_COLORS[0].value,
  paper: PAPERS[0].value,
}

const LAST_KEY = 'notillas.lastBackground'

/** El último fondo elegido en este dispositivo, para las notas nuevas. */
export function readLastBackground(): Background {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Partial<Background> | null
    if (v && BACKGROUND_TYPES.some((t) => t.type === v.type)) return { ...DEFAULT_BACKGROUND, ...v }
  } catch {
    /* sin localStorage o JSON roto */
  }
  return { ...DEFAULT_BACKGROUND }
}

export function saveLastBackground(bg: Background) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(bg))
  } catch {
    /* modo privado */
  }
}

export function sameBackground(a: Background, b: Background): boolean {
  return a.type === b.type && a.spacing === b.spacing && a.color === b.color && a.paper === b.paper
}

/** Luminancia relativa (0 = negro, 1 = blanco) de un color #rrggbb. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 1
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Sobre papel oscuro, la tinta casi negra se dibuja clara (si no, no se vería). */
export function inkColor(color: string, paper: string): string {
  return luminance(paper) < 0.1 && luminance(color) < 0.05 ? '#ececec' : color
}
