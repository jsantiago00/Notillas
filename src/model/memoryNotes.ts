import { readLastBackground } from './background'
import { NoteModel, newId } from './note'
import { PAGE_HEIGHT, PAGE_WIDTH, type Background, type Page } from './types'

/**
 * Notas en memoria (la nota de prueba sin conexión con Firestore): se pierden al recargar,
 * pero sobreviven a ir y volver de la lista.
 */
const notes = new Map<string, NoteModel>()

export function getMemoryNote(noteId: string): NoteModel {
  let note = notes.get(noteId)
  if (!note) {
    note = new NoteModel([newPage(readLastBackground())])
    notes.set(noteId, note)
  }
  return note
}

export function newPage(background: Background): Page {
  return {
    id: newId(),
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background: { ...background },
    strokes: [],
  }
}
