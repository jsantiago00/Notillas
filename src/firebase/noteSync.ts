import { onSnapshot, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { thumbnail } from '../canvas/renderPage'
import type { StrokeChange } from '../model/history'
import { NoteModel } from '../model/note'
import type { Page, Stroke } from '../model/types'
import {
  BatchQueue,
  docToStroke,
  purgePage,
  noteRef,
  pageRef,
  pagesCol,
  strokeRef,
  strokesCol,
  strokeToDoc,
  toNoteMeta,
  toPageDoc,
  updateNote,
  type NoteMeta,
  type PageDoc,
} from './repo'
import { trackWrite } from './syncStatus'

/** Agrupa las escrituras de trazos para no mandar una por cada trazo. */
const FLUSH_MS = 400
const THUMB_MS = 2000

export type SyncState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: NoteModel; meta: NoteMeta }

/**
 * Sincroniza una nota abierta con Firestore, en los dos sentidos:
 * - lo que cambia en el modelo (trazos, páginas, fondos) se escribe en lotes, con debounce;
 * - lo que llega de otros dispositivos se aplica al modelo de forma incremental.
 * El eco de las escrituras propias se reconoce porque el trazo ya está igual en el modelo.
 */
export class NoteSync {
  private model: NoteModel | null = null
  private meta: NoteMeta | null = null
  private pageDocs = new Map<string, PageDoc>()
  private gotPages = false
  private strokeSubs = new Map<string, Unsubscribe>()
  private loadedPages = new Set<string>()
  private subs: Unsubscribe[] = []
  /** Escrituras pendientes de trazos: «pageId/strokeId» → trazo (o null para borrar) */
  private pending = new Map<string, { pageId: string; stroke: Stroke | null }>()
  /** Lo último escrito (o leído) de cada página, para no reescribir lo mismo */
  private written = new Map<string, string>()
  private writtenOrder = ''
  private pagesDirty = false
  private flushTimer = 0
  private thumbTimer = 0
  private unsubModel: (() => void) | null = null
  private readonly uid: string
  private readonly noteId: string
  private readonly onState: (s: SyncState) => void

  constructor(uid: string, noteId: string, onState: (s: SyncState) => void) {
    this.uid = uid
    this.noteId = noteId
    this.onState = onState
  }

  start() {
    const fail = (e: Error) => this.onState({ status: 'error', message: e.message })
    this.subs.push(
      onSnapshot(
        noteRef(this.uid, this.noteId),
        (snap) => {
          if (!snap.exists()) {
            // Puede ser que la caché todavía no la tenga: esperamos al servidor
            if (!snap.metadata.fromCache) this.onState({ status: 'missing' })
            return
          }
          this.meta = toNoteMeta(snap.id, snap.data({ serverTimestamps: 'estimate' }))
          if (this.meta.deleted) return this.onState({ status: 'missing' })
          this.reconcilePages()
          this.maybeReady()
        },
        fail,
      ),
      onSnapshot(
        pagesCol(this.uid, this.noteId),
        (snap) => {
          this.gotPages = true
          for (const ch of snap.docChanges()) {
            if (ch.type === 'removed') this.pageDocs.delete(ch.doc.id)
            else this.pageDocs.set(ch.doc.id, toPageDoc(ch.doc.id, ch.doc.data({ serverTimestamps: 'estimate' })))
          }
          this.reconcilePages()
        },
        fail,
      ),
    )
    const onHide = () => document.visibilityState === 'hidden' && this.flush()
    document.addEventListener('visibilitychange', onHide)
    this.subs.push(() => document.removeEventListener('visibilitychange', onHide))
  }

  stop() {
    this.flush()
    this.writeThumb()
    for (const u of this.subs) u()
    for (const u of this.strokeSubs.values()) u()
    this.subs = []
    this.strokeSubs.clear()
    this.unsubModel?.()
    clearTimeout(this.thumbTimer)
  }

  rename(title: string) {
    updateNote(this.uid, this.noteId, { title })
  }

  // ---------- Firestore → modelo ----------

  /** Arma la lista de páginas según `pageIds` de la nota y la aplica si cambió. */
  private reconcilePages() {
    const meta = this.meta
    if (!meta || !this.gotPages) return
    // Con cambios locales de páginas sin escribir, lo local manda: el próximo snapshot
    // (ya con lo nuestro) vuelve a reconciliar
    if (this.model && this.pagesDirty) return
    const ordered = meta.pageIds.filter((id) => this.pageDocs.has(id))
    // Páginas que existen pero no figuran en el orden (otro dispositivo a mitad de escribir): al final
    for (const p of [...this.pageDocs.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      if (!ordered.includes(p.id)) ordered.push(p.id)
    }
    if (!ordered.length) return

    for (const id of ordered) this.written.set(id, JSON.stringify(this.pageDocs.get(id)!.background))
    this.writtenOrder = ordered.join(',')

    if (!this.model) {
      this.model = new NoteModel(ordered.map((id) => this.toPage(id)))
      this.unsubModel = this.model.subscribe((e) => {
        if (e.type === 'commit') this.queueStrokes(e.changes)
        else if (e.type === 'pages') this.queuePages()
      })
    } else {
      const current = this.model.pages
      const same =
        current.length === ordered.length &&
        current.every((p, i) => p.id === ordered[i] && JSON.stringify(p.background) === this.written.get(p.id))
      if (!same) this.model.replacePages(ordered.map((id) => this.toPage(id)))
    }
    this.syncStrokeSubs(ordered)
    this.maybeReady()
  }

  private toPage(id: string): Page {
    const d = this.pageDocs.get(id)!
    const existing = this.model?.page(id)
    return { id, width: d.width, height: d.height, background: d.background, strokes: existing?.strokes ?? [] }
  }

  private syncStrokeSubs(pageIds: string[]) {
    const keep = new Set(pageIds)
    for (const [id, u] of this.strokeSubs) {
      if (!keep.has(id)) {
        u()
        this.strokeSubs.delete(id)
        this.loadedPages.delete(id)
      }
    }
    for (const id of pageIds) {
      if (this.strokeSubs.has(id)) continue
      this.strokeSubs.set(
        id,
        onSnapshot(strokesCol(this.uid, this.noteId, id), (snap) => {
          const model = this.model
          const page = model?.page(id)
          if (!model || !page) return
          const byId = new Map(page.strokes.map((s) => [s.id, s]))
          const before: Stroke[] = []
          const after: Stroke[] = []
          for (const ch of snap.docChanges()) {
            const old = byId.get(ch.doc.id)
            // Si hay una escritura propia pendiente para este trazo, manda lo local
            if (this.pending.has(`${id}/${ch.doc.id}`)) continue
            if (ch.type === 'removed') {
              if (old) before.push(old)
              continue
            }
            const s = docToStroke(ch.doc.id, ch.doc.data())
            if (!s) continue
            if (old && signature(old) === signature(s)) continue
            if (old) before.push(old)
            after.push(s)
          }
          if (before.length || after.length) model.applyRemote([{ pageId: id, before, after }])
          this.loadedPages.add(id)
          this.maybeReady()
        }),
      )
    }
  }

  private readyOnce = false
  private lastMeta: NoteMeta | null = null
  /** Avisa cuando la nota está lista y, después, cada vez que cambian sus datos (título, etc.). */
  private maybeReady() {
    const model = this.model
    if (!model || !this.meta) return
    // Lista cuando llegaron los trazos de todas las páginas (desde la caché es casi inmediato)
    if (!this.readyOnce && !model.pages.every((p) => this.loadedPages.has(p.id))) return
    if (this.readyOnce && this.lastMeta === this.meta) return
    this.readyOnce = true
    this.lastMeta = this.meta
    this.onState({ status: 'ready', model, meta: this.meta })
  }

  // ---------- Modelo → Firestore ----------

  private queueStrokes(changes: StrokeChange[]) {
    for (const c of changes) {
      const afterIds = new Set(c.after.map((s) => s.id))
      for (const s of c.before) if (!afterIds.has(s.id)) this.pending.set(`${c.pageId}/${s.id}`, { pageId: c.pageId, stroke: null })
      for (const s of c.after) this.pending.set(`${c.pageId}/${s.id}`, { pageId: c.pageId, stroke: s })
    }
    this.scheduleFlush()
    this.scheduleThumb()
  }

  private queuePages() {
    this.pagesDirty = true
    this.scheduleFlush()
    this.scheduleThumb()
  }

  private scheduleFlush() {
    clearTimeout(this.flushTimer)
    this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_MS)
    trackWrite('queued')
  }

  /** Escribe todo lo pendiente en lotes (también al pasar a segundo plano o al salir). */
  flush() {
    clearTimeout(this.flushTimer)
    const model = this.model
    if (!model || (!this.pending.size && !this.pagesDirty)) {
      trackWrite('idle')
      return
    }
    const q = new BatchQueue()
    const { uid, noteId } = this

    if (this.pagesDirty) {
      this.pagesDirty = false
      const ids = model.pages.map((p) => p.id)
      for (const p of model.pages) {
        const bg = JSON.stringify(p.background)
        const prev = this.written.get(p.id)
        if (prev === bg) continue
        if (prev === undefined) {
          q.set(pageRef(uid, noteId, p.id), {
            width: p.width,
            height: p.height,
            background: p.background,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        } else {
          q.update(pageRef(uid, noteId, p.id), { background: p.background, updatedAt: serverTimestamp() })
        }
        this.written.set(p.id, bg)
      }
      // Páginas borradas: sus trazos y la página
      for (const id of [...this.written.keys()]) {
        if (ids.includes(id)) continue
        this.written.delete(id)
        void purgePage(uid, noteId, id)
      }
      const order = ids.join(',')
      if (order !== this.writtenOrder) {
        this.writtenOrder = order
        q.update(noteRef(uid, noteId), { pageIds: ids, updatedAt: serverTimestamp() })
      }
    }

    for (const { pageId, stroke } of this.pending.values()) {
      // Si la página ya no existe, no tiene sentido escribir sus trazos
      if (!model.page(pageId)) continue
      if (stroke) q.set(strokeRef(uid, noteId, pageId, stroke.id), strokeToDoc(stroke))
    }
    for (const [key, { pageId, stroke }] of this.pending) {
      if (!stroke) q.delete(strokeRef(uid, noteId, pageId, key.slice(pageId.length + 1)))
    }
    if (this.pending.size) q.update(noteRef(uid, noteId), { updatedAt: serverTimestamp() })
    this.pending.clear()
    trackWrite('idle')
    if (q.size) trackWrite(q.commit())
  }

  private thumbDirty = false

  private scheduleThumb() {
    this.thumbDirty = true
    clearTimeout(this.thumbTimer)
    this.thumbTimer = window.setTimeout(() => this.writeThumb(), THUMB_MS)
  }

  /** Miniatura de la primera página, solo si algo cambió desde la última. */
  private writeThumb() {
    clearTimeout(this.thumbTimer)
    const page = this.model?.pages[0]
    if (!page || !this.thumbDirty) return
    this.thumbDirty = false
    try {
      updateNote(this.uid, this.noteId, { thumb: thumbnail(page) })
    } catch {
      /* sin canvas */
    }
  }
}

/** Lo que identifica el contenido de un trazo (para reconocer el eco de lo propio). */
function signature(s: Stroke): string {
  return `${s.z}|${s.pts.length}|${s.color}|${s.size.toFixed(2)}|${s.bbox.map((v) => Math.round(v)).join(',')}`
}
