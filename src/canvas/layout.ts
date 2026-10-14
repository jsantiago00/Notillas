import type { Rect } from '../model/geometry'
import type { Page } from '../model/types'

/** Separación vertical entre páginas, en unidades de página. */
export const PAGE_GAP = 48

/** Posiciones de las páginas apiladas en una columna (scroll vertical continuo). */
export function layoutPages(pages: readonly Pick<Page, 'width' | 'height'>[]): Rect[] {
  const width = Math.max(0, ...pages.map((p) => p.width))
  let y = 0
  return pages.map((p) => {
    const r = { x: (width - p.width) / 2, y, w: p.width, h: p.height }
    y += p.height + PAGE_GAP
    return r
  })
}

/** Caja de todo el contenido. */
export function contentRect(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const last = rects[rects.length - 1]
  const w = Math.max(...rects.map((r) => r.x + r.w))
  return { x: 0, y: 0, w, h: last.y + last.h }
}

/** Índice de la página bajo el punto (en coordenadas del mundo), o -1. */
export function pageAt(rects: readonly Rect[], x: number, y: number): number {
  return rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
}
