import {
  Bytes,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from 'firebase/firestore'
import { decodePoints, encodePoints } from '../model/codec'
import { newId } from '../model/note'
import { PAGE_HEIGHT, PAGE_WIDTH, type Background, type Stroke } from '../model/types'
import { getDb } from './db'

export interface Folder {
  id: string
  name: string
  order: number
  createdAt: number
}

export interface NoteMeta {
  id: string
  title: string
  folderId: string | null
  pageIds: string[]
  thumb: string
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface PageDoc {
  id: string
  width: number
  height: number
  background: Background
  createdAt: number
}

// ---------- Rutas ----------

const db = (): Firestore => getDb()
export const foldersCol = (uid: string) => collection(db(), 'users', uid, 'folders')
export const notesCol = (uid: string) => collection(db(), 'users', uid, 'notes')
export const noteRef = (uid: string, noteId: string) => doc(db(), 'users', uid, 'notes', noteId)
export const pagesCol = (uid: string, noteId: string) => collection(db(), 'users', uid, 'notes', noteId, 'pages')
export const pageRef = (uid: string, noteId: string, pageId: string) => doc(pagesCol(uid, noteId), pageId)
export const strokesCol = (uid: string, noteId: string, pageId: string) => collection(pageRef(uid, noteId, pageId), 'strokes')
export const strokeRef = (uid: string, noteId: string, pageId: string, strokeId: string) =>
  doc(strokesCol(uid, noteId, pageId), strokeId)

/** Las marcas de tiempo del servidor llegan nulas mientras la escritura está pendiente: estimamos. */
const OPTS = { serverTimestamps: 'estimate' } as const
const millis = (t: unknown): number => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : Date.now())

// ---------- Conversión ----------

export function toNoteMeta(id: string, d: DocumentData): NoteMeta {
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '',
    folderId: typeof d.folderId === 'string' ? d.folderId : null,
    pageIds: Array.isArray(d.pageIds) ? d.pageIds : [],
    thumb: typeof d.thumb === 'string' ? d.thumb : '',
    createdAt: millis(d.createdAt),
    updatedAt: millis(d.updatedAt),
    deleted: d.deleted === true,
  }
}

export function toPageDoc(id: string, d: DocumentData): PageDoc {
  return {
    id,
    width: d.width ?? PAGE_WIDTH,
    height: d.height ?? PAGE_HEIGHT,
    background: d.background,
    createdAt: millis(d.createdAt),
  }
}

let deviceId = ''
function getDeviceId(): string {
  if (deviceId) return deviceId
  try {
    deviceId = localStorage.getItem('notillas.deviceId') ?? ''
    if (!deviceId) localStorage.setItem('notillas.deviceId', (deviceId = newId()))
  } catch {
    deviceId = newId()
  }
  return deviceId
}

export function strokeToDoc(s: Stroke): DocumentData {
  const d: DocumentData = {
    tool: s.tool,
    color: s.color,
    size: s.size,
    opacity: s.opacity,
    pts: Bytes.fromUint8Array(encodePoints(s.pts)),
    n: s.pts.length / 3,
    bbox: s.bbox,
    z: s.z,
    simulated: s.simulated,
    createdAt: serverTimestamp(),
    deviceId: getDeviceId(),
  }
  if (s.shape) d.shape = s.shape
  return d
}

export function docToStroke(id: string, d: DocumentData): Stroke | null {
  if (!(d.pts instanceof Bytes) || !Array.isArray(d.bbox)) return null
  const s: Stroke = {
    id,
    tool: d.tool === 'highlighter' ? 'highlighter' : 'pen',
    color: String(d.color ?? '#000000'),
    size: Number(d.size ?? 4),
    opacity: Number(d.opacity ?? 1),
    z: Number(d.z ?? 0),
    pts: decodePoints(d.pts.toUint8Array()),
    simulated: d.simulated === true,
    bbox: d.bbox as Stroke['bbox'],
  }
  if (d.shape) s.shape = d.shape
  return s
}

// ---------- Listas ----------

export function watchFolders(uid: string, cb: (folders: Folder[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    foldersCol(uid),
    (snap) => {
      const list = snap.docs.map((d) => {
        const v = d.data(OPTS)
        return { id: d.id, name: String(v.name ?? ''), order: Number(v.order ?? 0), createdAt: millis(v.createdAt) }
      })
      cb(list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt))
    },
    onError,
  )
}

export function watchNotes(uid: string, cb: (notes: NoteMeta[], fromCache: boolean) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    query(notesCol(uid), orderBy('updatedAt', 'desc')),
    { includeMetadataChanges: true },
    (snap) => cb(snap.docs.map((d) => toNoteMeta(d.id, d.data(OPTS))), snap.metadata.fromCache),
    onError,
  )
}

// ---------- Carpetas ----------

export async function createFolder(uid: string, name: string, order: number): Promise<string> {
  const ref = doc(foldersCol(uid))
  const b = writeBatch(db())
  b.set(ref, { name, order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  void b.commit()
  return ref.id
}

export function renameFolder(uid: string, id: string, name: string) {
  const b = writeBatch(db())
  b.update(doc(foldersCol(uid), id), { name, updatedAt: serverTimestamp() })
  void b.commit()
}

/** Borra la carpeta; sus notas pasan a «sin carpeta». */
export function deleteFolder(uid: string, id: string, noteIds: string[]) {
  const b = writeBatch(db())
  b.delete(doc(foldersCol(uid), id))
  for (const n of noteIds) b.update(noteRef(uid, n), { folderId: null })
  void b.commit()
}

// ---------- Notas ----------

export function createNote(uid: string, folderId: string | null, background: Background): string {
  const noteId = doc(notesCol(uid)).id
  const pageId = newId()
  const b = writeBatch(db())
  b.set(noteRef(uid, noteId), {
    title: '',
    folderId,
    pageIds: [pageId],
    thumb: '',
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  b.set(pageRef(uid, noteId, pageId), {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    background,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  void b.commit()
  return noteId
}

export function updateNote(uid: string, noteId: string, patch: Partial<Pick<NoteMeta, 'title' | 'folderId' | 'deleted' | 'thumb'>>) {
  const b = writeBatch(db())
  const touch = 'title' in patch || 'folderId' in patch ? { updatedAt: serverTimestamp() } : {}
  b.update(noteRef(uid, noteId), { ...patch, ...touch })
  void b.commit()
}

/**
 * Lotes de hasta 450 operaciones (el máximo es 500): borrar o copiar notas grandes puede
 * necesitar varios.
 */
export class BatchQueue {
  private batches: WriteBatch[] = []
  private count = 0

  private current(): WriteBatch {
    if (!this.batches.length || this.count >= 450) {
      this.batches.push(writeBatch(db()))
      this.count = 0
    }
    this.count++
    return this.batches[this.batches.length - 1]
  }

  set(ref: Parameters<WriteBatch['set']>[0], data: DocumentData) {
    this.current().set(ref, data)
  }

  update(ref: Parameters<WriteBatch['update']>[0], data: DocumentData) {
    this.current().update(ref, data)
  }

  delete(ref: Parameters<WriteBatch['delete']>[0]) {
    this.current().delete(ref)
  }

  get size() {
    return this.batches.length
  }

  commit(): Promise<void[]> {
    const all = this.batches.map((b) => b.commit())
    this.batches = []
    this.count = 0
    return Promise.all(all)
  }
}

/**
 * Borra de verdad una nota: trazos, páginas y la nota. Desde el cliente no hay borrado
 * recursivo, así que se hace en lotes.
 */
export async function purgeNote(uid: string, noteId: string) {
  const q = new BatchQueue()
  const pages = await getDocs(pagesCol(uid, noteId))
  for (const p of pages.docs) {
    const strokes = await getDocs(strokesCol(uid, noteId, p.id))
    for (const s of strokes.docs) q.delete(s.ref)
    q.delete(p.ref)
  }
  q.delete(noteRef(uid, noteId))
  await q.commit()
}

/** Borra una página con sus trazos. */
export async function purgePage(uid: string, noteId: string, pageId: string) {
  const q = new BatchQueue()
  const strokes = await getDocs(strokesCol(uid, noteId, pageId))
  for (const s of strokes.docs) q.delete(s.ref)
  q.delete(pageRef(uid, noteId, pageId))
  await q.commit()
}

/** Copia una nota con sus páginas y trazos, con ids nuevos. */
export async function duplicateNote(uid: string, src: NoteMeta): Promise<string> {
  const noteId = doc(notesCol(uid)).id
  const q = new BatchQueue()
  const pages = await getDocs(pagesCol(uid, src.id))
  const idMap = new Map<string, string>()
  for (const p of pages.docs) {
    const newPage = newId()
    idMap.set(p.id, newPage)
    q.set(pageRef(uid, noteId, newPage), { ...p.data(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const strokes = await getDocs(strokesCol(uid, src.id, p.id))
    for (const s of strokes.docs) q.set(strokeRef(uid, noteId, newPage, newId()), s.data())
  }
  q.set(noteRef(uid, noteId), {
    title: `${src.title || 'Sin título'} (copia)`,
    folderId: src.folderId,
    pageIds: src.pageIds.map((id) => idMap.get(id)).filter(Boolean),
    thumb: src.thumb,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  void q.commit()
  return noteId
}
