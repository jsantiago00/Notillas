import { create } from 'zustand'

export type ToolId = 'pen' | 'highlighter' | 'eraser' | 'lasso'
export type EraserMode = 'stroke' | 'area'
export type ToolbarSide = 'left' | 'right'

export interface InkSettings {
  color: string
  size: number
}

export interface ToolPrefs {
  tool: ToolId
  pen: InkSettings
  highlighter: InkSettings
  /** Radio de la goma en píxeles de pantalla (se siente igual a cualquier zoom) */
  eraser: { size: number; mode: EraserMode }
  /** Lado de la barra flotante en la tablet */
  side: ToolbarSide
  /** Reconocimiento de formas (etapa 6) */
  shapes: boolean
}

export const PEN_COLORS = ['#1f1d1a', '#2f5bd3', '#d0342c', '#23875a', '#7b3fc4']
export const HIGHLIGHTER_COLORS = ['#ffe14d', '#8ef08a', '#ff9ad5', '#8fd3ff', '#ffb86b']
export const PEN_SIZES = [2.5, 4, 7]
export const HIGHLIGHTER_SIZES = [16, 24, 36]
export const ERASER_SIZES = [8, 16, 32]
export const SIZE_RANGE = {
  pen: { min: 1, max: 24, step: 0.5 },
  highlighter: { min: 8, max: 60, step: 1 },
  eraser: { min: 4, max: 60, step: 1 },
} as const

export const HIGHLIGHTER_OPACITY = 0.35

const KEY = 'notillas.tools'

const DEFAULTS: ToolPrefs = {
  tool: 'pen',
  pen: { color: PEN_COLORS[0], size: PEN_SIZES[1] },
  highlighter: { color: HIGHLIGHTER_COLORS[0], size: HIGHLIGHTER_SIZES[1] },
  eraser: { size: ERASER_SIZES[1], mode: 'stroke' },
  side: 'left',
  shapes: true,
}

function read(): ToolPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ToolPrefs> | null
    if (v) {
      return {
        ...DEFAULTS,
        ...v,
        pen: { ...DEFAULTS.pen, ...v.pen },
        highlighter: { ...DEFAULTS.highlighter, ...v.highlighter },
        eraser: { ...DEFAULTS.eraser, ...v.eraser },
      }
    }
  } catch {
    /* sin localStorage o JSON roto */
  }
  return DEFAULTS
}

/** Herramienta activa y ajustes de cada una; se recuerdan por dispositivo. */
export const useTools = create<ToolPrefs>(read)

useTools.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* modo privado */
  }
})

export function setTool(tool: ToolId) {
  useTools.setState({ tool })
}

export function setInk(tool: 'pen' | 'highlighter', patch: Partial<InkSettings>) {
  useTools.setState((s) => ({ [tool]: { ...s[tool], ...patch } }) as Partial<ToolPrefs>)
}

export function setEraser(patch: Partial<ToolPrefs['eraser']>) {
  useTools.setState((s) => ({ eraser: { ...s.eraser, ...patch } }))
}
