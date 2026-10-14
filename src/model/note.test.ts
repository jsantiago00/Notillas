import { describe, expect, it } from 'vitest'
import { NoteModel } from './note'
import type { Page, Stroke } from './types'

function stroke(id: string, z: number, pts = [0, 0, 0.5, 10, 10, 0.5]): Stroke {
  return { id, tool: 'pen', color: '#000', opacity: 1, z, size: 4, pts, simulated: false, bbox: [0, 0, 10, 10] }
}

function makeNote() {
  const page: Page = { id: 'p1', width: 100, height: 100, background: { type: 'blank', spacing: 40, color: '#ccc', paper: '#fff' }, strokes: [] }
  const note = new NoteModel([page])
  const commits: unknown[] = []
  note.subscribe((e) => e.type === 'commit' && commits.push(e.changes))
  return { note, page: () => note.pages[0], commits }
}

const ids = (p: Page) => p.strokes.map((s) => s.id).join(',')

describe('NoteModel', () => {
  it('agrega, deshace y rehace', () => {
    const { note, page, commits } = makeNote()
    note.apply([{ pageId: 'p1', before: [], after: [stroke('a', 1)] }])
    note.apply([{ pageId: 'p1', before: [], after: [stroke('b', 2)] }])
    expect(ids(page())).toBe('a,b')
    note.undo()
    expect(ids(page())).toBe('a')
    note.redo()
    expect(ids(page())).toBe('a,b')
    expect(commits).toHaveLength(4)
  })

  it('mantiene el orden por z aunque lleguen desordenados', () => {
    const { note, page } = makeNote()
    note.applyRemote([{ pageId: 'p1', before: [], after: [stroke('c', 3), stroke('a', 1)] }])
    note.applyRemote([{ pageId: 'p1', before: [], after: [stroke('b', 2)] }])
    expect(ids(page())).toBe('a,b,c')
  })

  it('reemplazar un trazo (mover con el lazo) se deshace volviendo al original', () => {
    const { note, page } = makeNote()
    const a = stroke('a', 1)
    note.apply([{ pageId: 'p1', before: [], after: [a] }])
    const moved = { ...a, pts: [5, 5, 0.5, 15, 15, 0.5] }
    note.apply([{ pageId: 'p1', before: [a], after: [moved] }])
    expect(page().strokes[0].pts[0]).toBe(5)
    note.undo()
    expect(page().strokes[0]).toBe(a)
  })

  it('una transacción guarda solo el cambio neto, como una sola acción', () => {
    const { note, page, commits } = makeNote()
    const a = stroke('a', 1)
    note.apply([{ pageId: 'p1', before: [], after: [a] }])
    commits.length = 0
    note.begin()
    // La goma corta «a» en dos y después borra uno de los pedazos
    const a1 = stroke('a1', 1)
    const a2 = stroke('a2', 1.1)
    note.preview([{ pageId: 'p1', before: [a], after: [a1, a2] }])
    note.preview([{ pageId: 'p1', before: [a2], after: [] }])
    note.commit()
    expect(ids(page())).toBe('a1')
    expect(commits).toEqual([[{ pageId: 'p1', before: [a], after: [a1] }]])
    note.undo()
    expect(ids(page())).toBe('a')
  })

  it('rollback deja todo como estaba', () => {
    const { note, page, commits } = makeNote()
    const a = stroke('a', 1)
    note.apply([{ pageId: 'p1', before: [], after: [a] }])
    commits.length = 0
    note.begin()
    note.preview([{ pageId: 'p1', before: [a], after: [] }])
    note.rollback()
    expect(ids(page())).toBe('a')
    expect(commits).toHaveLength(0)
  })

  it('los cambios remotos no entran al historial', () => {
    const { note } = makeNote()
    note.applyRemote([{ pageId: 'p1', before: [], after: [stroke('a', 1)] }])
    expect(note.history.canUndo).toBe(false)
  })
})
