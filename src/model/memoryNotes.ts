import { PAGE_HEIGHT, PAGE_WIDTH, type Page } from './types'

/**
 * Notas en memoria hasta la etapa 5 (Firestore): se pierden al recargar,
 * pero sobreviven a ir y volver de la lista.
 */
const notes = new Map<string, Page[]>()

const INITIAL_PAGES = 3

export function getMemoryPages(noteId: string): Page[] {
  let pages = notes.get(noteId)
  if (!pages) {
    pages = Array.from({ length: INITIAL_PAGES }, (_, i) => ({
      id: `${noteId}-p${i + 1}`,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      strokes: [],
    }))
    notes.set(noteId, pages)
  }
  return pages
}
