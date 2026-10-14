import { readLastBackground } from './background'
import { PAGE_HEIGHT, PAGE_WIDTH, type Background, type Page } from './types'

/**
 * Notas en memoria hasta la etapa 5 (Firestore): se pierden al recargar,
 * pero sobreviven a ir y volver de la lista.
 */
const notes = new Map<string, Page[]>()

const INITIAL_PAGES = 1

export function getMemoryPages(noteId: string): Page[] {
  let pages = notes.get(noteId)
  if (!pages) {
    const background = readLastBackground()
    pages = Array.from({ length: INITIAL_PAGES }, () => newPage(background))
    notes.set(noteId, pages)
  }
  return pages
}

export function newPage(background: Background): Page {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: { ...background },
    strokes: [],
  }
}
