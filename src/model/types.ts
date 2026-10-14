/** Caja alineada a los ejes: [x0, y0, x1, y1]. */
export type BBox = [number, number, number, number]

export type Tool = 'pen'

export interface Stroke {
  id: string
  tool: Tool
  color: string
  /** Diámetro base, en unidades de página */
  size: number
  /** Puntos intercalados x, y, presión (0–1), en coordenadas de la página */
  pts: number[]
  /** La presión es simulada por velocidad (mouse o dedo) */
  simulated: boolean
  /** Caja del contorno ya dibujado, con el grosor incluido */
  bbox: BBox
}

export type BackgroundType = 'blank' | 'ruled' | 'grid' | 'dots'

export interface Background {
  type: BackgroundType
  /** Distancia entre líneas o puntos, en unidades de página */
  spacing: number
  /** Color de las líneas o puntos */
  color: string
  /** Color del papel */
  paper: string
}

export interface Page {
  id: string
  width: number
  height: number
  background: Background
  strokes: Stroke[]
}

/** Tamaño tipo A4 (1240 × 1754 unidades), igual para todas las páginas. */
export const PAGE_WIDTH = 1240
export const PAGE_HEIGHT = 1754
