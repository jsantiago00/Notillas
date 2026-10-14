import { History, type StrokeChange } from './history'
import type { Background, Page, Stroke } from './types'

export type NoteEvent =
  /** Cambiaron trazos (para redibujar). `origin` dice de dónde vino. */
  | { type: 'strokes'; changes: StrokeChange[]; origin: 'local' | 'remote' | 'preview' }
  /** Se confirmó una acción local (para guardar en Firestore). */
  | { type: 'commit'; changes: StrokeChange[] }
  /** Cambiaron las páginas: alta, baja, orden o fondo. */
  | { type: 'pages'; pageIds: string[] }
  | { type: 'history' }

type Listener = (e: NoteEvent) => void

/**
 * El contenido de una nota en memoria: páginas y trazos. Todos los cambios pasan por acá,
 * así deshacer, el render y la sincronización ven lo mismo.
 *
 * Las acciones largas (la goma mientras se arrastra) usan una transacción: los cambios se
 * aplican al instante para verlos, y al final se guarda el cambio neto como una sola acción.
 */
export class NoteModel {
  readonly pages: Page[]
  readonly history = new History()
  private listeners = new Set<Listener>()
  private tx: { before: Map<string, Map<string, Stroke>>; after: Map<string, Map<string, Stroke>> } | null = null

  constructor(pages: Page[]) {
    this.pages = pages
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: NoteEvent) {
    for (const fn of this.listeners) fn(e)
  }

  page(id: string): Page | undefined {
    return this.pages.find((p) => p.id === id)
  }

  pageIndex(id: string): number {
    return this.pages.findIndex((p) => p.id === id)
  }

  /** Aplica cambios sin registrarlos (base de todo lo demás). */
  private mutate(changes: readonly StrokeChange[]) {
    for (const c of changes) {
      const page = this.page(c.pageId)
      if (!page) continue
      const out = new Set(c.before.map((s) => s.id))
      for (const s of c.after) out.add(s.id)
      const kept = page.strokes.filter((s) => !out.has(s.id))
      page.strokes = insertSorted(kept, c.after)
    }
  }

  /** Una acción local completa: se aplica, se registra para deshacer y se avisa para guardar. */
  apply(changes: StrokeChange[]) {
    const real = changes.filter((c) => c.before.length || c.after.length)
    if (!real.length) return
    this.mutate(real)
    this.emit({ type: 'strokes', changes: real, origin: 'local' })
    this.history.push(real)
    this.emit({ type: 'commit', changes: real })
    this.emit({ type: 'history' })
  }

  /** Cambios que llegan de otro dispositivo: no van al historial ni se vuelven a guardar. */
  applyRemote(changes: StrokeChange[]) {
    if (!changes.length) return
    this.mutate(changes)
    this.emit({ type: 'strokes', changes, origin: 'remote' })
  }

  begin() {
    this.tx = { before: new Map(), after: new Map() }
  }

  /** Durante una transacción: se ve enseguida, pero se registra recién en `commit`. */
  preview(changes: StrokeChange[]) {
    const tx = this.tx
    if (!tx) return this.apply(changes)
    for (const c of changes) {
      const before = getMap(tx.before, c.pageId)
      const after = getMap(tx.after, c.pageId)
      for (const s of c.before) {
        // Si lo había creado esta misma transacción, simplemente desaparece
        if (after.has(s.id)) after.delete(s.id)
        else if (!before.has(s.id)) before.set(s.id, s)
      }
      for (const s of c.after) after.set(s.id, s)
    }
    this.mutate(changes)
    this.emit({ type: 'strokes', changes, origin: 'preview' })
  }

  commit() {
    const tx = this.tx
    this.tx = null
    if (!tx) return
    const changes: StrokeChange[] = []
    const ids = new Set([...tx.before.keys(), ...tx.after.keys()])
    for (const pageId of ids) {
      const before = [...(tx.before.get(pageId)?.values() ?? [])]
      const after = [...(tx.after.get(pageId)?.values() ?? [])]
      if (before.length || after.length) changes.push({ pageId, before, after })
    }
    if (!changes.length) return
    this.history.push(changes)
    this.emit({ type: 'commit', changes })
    this.emit({ type: 'history' })
  }

  /** Descarta la transacción y vuelve todo a como estaba. */
  rollback() {
    const tx = this.tx
    this.tx = null
    if (!tx) return
    const changes: StrokeChange[] = []
    const ids = new Set([...tx.before.keys(), ...tx.after.keys()])
    for (const pageId of ids) {
      changes.push({
        pageId,
        before: [...(tx.after.get(pageId)?.values() ?? [])],
        after: [...(tx.before.get(pageId)?.values() ?? [])],
      })
    }
    this.mutate(changes)
    this.emit({ type: 'strokes', changes, origin: 'preview' })
  }

  undo(): boolean {
    return this.replay(this.history.undo())
  }

  redo(): boolean {
    return this.replay(this.history.redo())
  }

  private replay(changes: StrokeChange[] | null): boolean {
    if (!changes) return false
    // Si una página se borró mientras tanto, esos cambios se ignoran
    const valid = changes.filter((c) => this.page(c.pageId))
    this.mutate(valid)
    this.emit({ type: 'strokes', changes: valid, origin: 'local' })
    this.emit({ type: 'commit', changes: valid })
    this.emit({ type: 'history' })
    return true
  }

  // ---------- Páginas ----------

  addPage(page: Page, index = this.pages.length) {
    this.pages.splice(index, 0, page)
    this.emit({ type: 'pages', pageIds: [page.id] })
  }

  removePage(id: string) {
    const i = this.pageIndex(id)
    if (i < 0 || this.pages.length === 1) return
    this.pages.splice(i, 1)
    this.emit({ type: 'pages', pageIds: [id] })
  }

  movePage(id: string, to: number) {
    const i = this.pageIndex(id)
    if (i < 0) return
    const [p] = this.pages.splice(i, 1)
    this.pages.splice(Math.max(0, Math.min(this.pages.length, to)), 0, p)
    this.emit({ type: 'pages', pageIds: [id] })
  }

  setBackground(ids: string[] | 'all', bg: Background) {
    const targets = ids === 'all' ? this.pages : this.pages.filter((p) => ids.includes(p.id))
    for (const p of targets) p.background = { ...bg }
    this.emit({ type: 'pages', pageIds: targets.map((p) => p.id) })
  }

  /** Reemplaza las páginas (al llegar de Firestore), conservando los trazos de las que siguen. */
  replacePages(next: Page[]) {
    const old = new Map(this.pages.map((p) => [p.id, p]))
    const merged = next.map((p) => {
      const prev = old.get(p.id)
      return prev ? Object.assign(prev, { ...p, strokes: prev.strokes }) : p
    })
    this.pages.splice(0, this.pages.length, ...merged)
    this.emit({ type: 'pages', pageIds: merged.map((p) => p.id) })
  }
}

function getMap(m: Map<string, Map<string, Stroke>>, k: string) {
  let v = m.get(k)
  if (!v) m.set(k, (v = new Map()))
  return v
}

/** Inserta manteniendo el orden por `z` (casi siempre van al final). */
function insertSorted(list: Stroke[], add: readonly Stroke[]): Stroke[] {
  if (!add.length) return list
  const out = list.concat(add)
  const sorted = out.every((s, i) => i === 0 || out[i - 1].z <= s.z)
  return sorted ? out : out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1))
}

let zSeq = 0
/** Orden de un trazo nuevo: hora del cliente con un desempate creciente. */
export function nextZ(): number {
  zSeq = (zSeq + 1) % 1000
  return Date.now() + zSeq / 1000
}

export function newId(): string {
  const a = new Uint8Array(10)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
}
