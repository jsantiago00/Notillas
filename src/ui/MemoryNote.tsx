import { getMemoryNote } from '../model/memoryNotes'
import { NoteEditor } from './NoteEditor'

/** Nota en memoria, sin guardar (la nota de prueba). */
export function MemoryNote() {
  return <NoteEditor note={getMemoryNote('borrador')} title="Nota de prueba (no se guarda)" />
}
