import { useParams } from 'react-router-dom'
import { getMemoryNote } from '../model/memoryNotes'
import { NoteEditor } from './NoteEditor'

/** Nota en memoria, sin guardar (la nota de prueba). */
export function MemoryNote() {
  const { id = 'borrador' } = useParams()
  return <NoteEditor note={getMemoryNote(id)} title="Nota de prueba (no se guarda)" />
}
