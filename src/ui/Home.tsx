import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../firebase/auth'
import {
  createFolder,
  createNote,
  deleteFolder,
  duplicateNote,
  purgeNote,
  renameFolder,
  updateNote,
  watchFolders,
  watchNotes,
  type Folder,
  type NoteMeta,
} from '../firebase/repo'
import { LOGO } from '../lib/assets'
import { relativeTime } from '../lib/time'
import { readLastBackground } from '../model/background'
import { AccountButton } from './AccountButton'
import { ConfirmDialog, PromptDialog } from './Dialog'
import { Icon } from './Icon'
import { Menu } from './NoteEditor'
import { SyncBadge } from './SyncBadge'
import { ThemeButton } from './ThemeButton'

const UNDO_MS = 6000

type DialogState =
  | { kind: 'renameNote'; note: NoteMeta }
  | { kind: 'newFolder' }
  | { kind: 'renameFolder'; folder: Folder }
  | { kind: 'deleteFolder'; folder: Folder }
  | null

/** Lista de notas: carpetas (un solo nivel) y una grilla de tarjetas con miniatura. */
export function Home() {
  const uid = useAuth((s) => s.user!.uid)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const current = params.get('carpeta') // null = todas
  const [folders, setFolders] = useState<Folder[]>([])
  const [notes, setNotes] = useState<NoteMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [undo, setUndo] = useState<{ note: NoteMeta; timer: number } | null>(null)
  const undoRef = useRef(undo)
  undoRef.current = undo
  const purged = useRef(new Set<string>())

  useEffect(() => {
    const fail = (e: Error) => setError(e.message)
    const a = watchFolders(uid, setFolders, fail)
    const b = watchNotes(
      uid,
      (list, fromCache) => {
        setNotes(list)
        // Notas marcadas como borradas que quedaron sin purgar (se cerró la app antes): se purgan
        if (fromCache) return
        for (const n of list) {
          if (n.deleted && n.id !== undoRef.current?.note.id && !purged.current.has(n.id)) {
            purged.current.add(n.id)
            void purgeNote(uid, n.id)
          }
        }
      },
      fail,
    )
    return () => {
      a()
      b()
    }
  }, [uid])

  // Al salir con un «Deshacer» pendiente, la nota se purga igual
  useEffect(
    () => () => {
      const u = undoRef.current
      if (u) {
        clearTimeout(u.timer)
        void purgeNote(uid, u.note.id)
      }
    },
    [uid],
  )

  const visible = useMemo(
    () => (notes ?? []).filter((n) => !n.deleted && (current === null || n.folderId === current)),
    [notes, current],
  )
  const counts = useMemo(() => {
    const m = new Map<string | null, number>()
    for (const n of notes ?? []) if (!n.deleted) m.set(n.folderId, (m.get(n.folderId) ?? 0) + 1)
    return m
  }, [notes])
  const total = (notes ?? []).filter((n) => !n.deleted).length
  const folderName = current === null ? 'Todas las notas' : (folders.find((f) => f.id === current)?.name ?? 'Carpeta')

  const openFolder = (id: string | null) => {
    setParams(id ? { carpeta: id } : {})
    setDrawer(false)
  }

  const newNote = () => {
    const folder = current !== null && folders.some((f) => f.id === current) ? current : null
    navigate(`/nota/${createNote(uid, folder, readLastBackground())}`)
  }

  const remove = (note: NoteMeta) => {
    if (undo) {
      clearTimeout(undo.timer)
      void purgeNote(uid, undo.note.id)
    }
    updateNote(uid, note.id, { deleted: true })
    const timer = window.setTimeout(() => {
      void purgeNote(uid, note.id)
      setUndo(null)
    }, UNDO_MS)
    setUndo({ note, timer })
  }

  const restore = () => {
    if (!undo) return
    clearTimeout(undo.timer)
    updateNote(uid, undo.note.id, { deleted: false })
    setUndo(null)
  }

  const sidebar = (
    <nav className="folders" aria-label="Carpetas">
      <button className={`folder-item${current === null ? ' is-on' : ''}`} onClick={() => openFolder(null)}>
        <Icon name="note" size={18} />
        <span>Todas las notas</span>
        <span className="count">{total}</span>
      </button>
      {folders.map((f) => (
        <FolderItem
          key={f.id}
          folder={f}
          count={counts.get(f.id) ?? 0}
          active={current === f.id}
          onOpen={() => openFolder(f.id)}
          onRename={() => setDialog({ kind: 'renameFolder', folder: f })}
          onDelete={() => setDialog({ kind: 'deleteFolder', folder: f })}
        />
      ))}
      <button className="folder-item folder-new" onClick={() => setDialog({ kind: 'newFolder' })}>
        <Icon name="plus" size={18} />
        <span>Nueva carpeta</span>
      </button>
    </nav>
  )

  return (
    <div className="app-shell home">
      <header className="topbar">
        <div className="brand">
          <button className="icon-btn drawer-btn" onClick={() => setDrawer(true)} aria-label="Carpetas">
            <Icon name="folder" />
          </button>
          <img src={LOGO} alt="" width={28} height={28} />
          <span>Notillas</span>
        </div>
        <div className="topbar-actions">
          <SyncBadge />
          <ThemeButton />
          <AccountButton />
        </div>
      </header>
      <div className="home-body">
        <aside className={`sidebar${drawer ? ' is-open' : ''}`}>{sidebar}</aside>
        {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
        <main className="content">
          <div className="list-head">
            <h1>{folderName}</h1>
            <button className="btn btn-primary-solid" onClick={newNote}>
              <Icon name="plus" size={20} /> Nueva nota
            </button>
          </div>
          {error && <p className="error">No se pudieron leer las notas: {error}</p>}
          {notes === null ? (
            <p className="muted">Cargando…</p>
          ) : visible.length === 0 ? (
            <div className="empty">
              <Icon name="note" size={48} />
              <h2>{current === null ? 'Todavía no hay notas' : 'Esta carpeta está vacía'}</h2>
              <p className="muted">Tocá «Nueva nota» para empezar. Se guarda sola y se sincroniza entre tus dispositivos.</p>
            </div>
          ) : (
            <ul className="note-grid">
              {visible.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  folders={folders}
                  onRename={() => setDialog({ kind: 'renameNote', note: n })}
                  onDuplicate={async () => {
                    try {
                      await duplicateNote(uid, n)
                    } catch (e) {
                      setError((e as Error).message)
                    }
                  }}
                  onMove={(folderId) => updateNote(uid, n.id, { folderId })}
                  onDelete={() => remove(n)}
                />
              ))}
            </ul>
          )}
          <p className="home-foot">
            <Link to="/prueba">Lienzo de prueba (no se guarda)</Link>
          </p>
        </main>
      </div>

      {undo && (
        <div className="toast" role="status">
          Nota borrada
          <button className="btn btn-small" onClick={restore}>
            Deshacer
          </button>
        </div>
      )}
      {dialog?.kind === 'renameNote' && (
        <PromptDialog
          title="Renombrar nota"
          initial={dialog.note.title}
          placeholder="Sin título"
          onSubmit={(title) => updateNote(uid, dialog.note.id, { title })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'newFolder' && (
        <PromptDialog
          title="Nueva carpeta"
          placeholder="Nombre"
          confirm="Crear"
          onSubmit={(name) => name && void createFolder(uid, name, folders.length)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'renameFolder' && (
        <PromptDialog
          title="Renombrar carpeta"
          initial={dialog.folder.name}
          onSubmit={(name) => name && renameFolder(uid, dialog.folder.id, name)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deleteFolder' && (
        <ConfirmDialog
          title={`¿Borrar la carpeta «${dialog.folder.name}»?`}
          body="Las notas no se borran: pasan a «Todas las notas», sin carpeta."
          confirm="Borrar carpeta"
          danger
          onConfirm={() => {
            const f = dialog.folder
            deleteFolder(uid, f.id, (notes ?? []).filter((n) => n.folderId === f.id).map((n) => n.id))
            if (current === f.id) openFolder(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function FolderItem(props: { folder: Folder; count: number; active: boolean; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const { folder, count, active, onOpen, onRename, onDelete } = props
  const [menu, setMenu] = useState(false)
  return (
    <div className={`folder-row${active ? ' is-on' : ''}`}>
      <button className={`folder-item${active ? ' is-on' : ''}`} onClick={onOpen}>
        <Icon name="folder" size={18} />
        <span>{folder.name || 'Sin nombre'}</span>
        <span className="count">{count}</span>
      </button>
      <div className="menu-anchor">
        <button className="icon-btn icon-btn-small" onClick={() => setMenu((v) => !v)} aria-label={`Opciones de ${folder.name}`}>
          <Icon name="more" size={18} />
        </button>
        {menu && (
          <Menu onClose={() => setMenu(false)}>
            <button role="menuitem" className="menu-item" onClick={() => (setMenu(false), onRename())}>
              <Icon name="pen" size={18} /> Renombrar
            </button>
            <button role="menuitem" className="menu-item" onClick={() => (setMenu(false), onDelete())}>
              <Icon name="trash" size={18} /> Borrar carpeta
            </button>
          </Menu>
        )}
      </div>
    </div>
  )
}

function NoteCard(props: {
  note: NoteMeta
  folders: Folder[]
  onRename: () => void
  onDuplicate: () => void
  onMove: (folderId: string | null) => void
  onDelete: () => void
}) {
  const { note, folders, onRename, onDuplicate, onMove, onDelete } = props
  const [menu, setMenu] = useState<'main' | 'move' | null>(null)
  const close = () => setMenu(null)
  return (
    <li className="note-card">
      <Link to={`/nota/${note.id}`} className="note-link">
        <div className="note-thumb">{note.thumb ? <img src={note.thumb} alt="" /> : <div className="thumb-blank" />}</div>
        <div className="note-info">
          <strong>{note.title || 'Sin título'}</strong>
          <span className="muted">{relativeTime(note.updatedAt)}</span>
        </div>
      </Link>
      <div className="menu-anchor note-menu">
        <button className="icon-btn icon-btn-small" onClick={() => setMenu(menu ? null : 'main')} aria-label={`Opciones de ${note.title || 'la nota'}`}>
          <Icon name="more" size={18} />
        </button>
        {menu === 'main' && (
          <Menu onClose={close}>
            <button role="menuitem" className="menu-item" onClick={() => (close(), onRename())}>
              <Icon name="pen" size={18} /> Renombrar
            </button>
            <button role="menuitem" className="menu-item" onClick={() => (close(), onDuplicate())}>
              <Icon name="copy" size={18} /> Duplicar
            </button>
            <button role="menuitem" className="menu-item" onClick={() => setMenu('move')}>
              <Icon name="folder" size={18} /> Mover a carpeta…
            </button>
            <button role="menuitem" className="menu-item menu-danger" onClick={() => (close(), onDelete())}>
              <Icon name="trash" size={18} /> Borrar
            </button>
          </Menu>
        )}
        {menu === 'move' && (
          <Menu onClose={close}>
            <button role="menuitem" className="menu-item" disabled={note.folderId === null} onClick={() => (close(), onMove(null))}>
              <Icon name="note" size={18} /> Sin carpeta
            </button>
            {folders.map((f) => (
              <button key={f.id} role="menuitem" className="menu-item" disabled={note.folderId === f.id} onClick={() => (close(), onMove(f.id))}>
                <Icon name="folder" size={18} /> {f.name || 'Sin nombre'}
              </button>
            ))}
          </Menu>
        )}
      </div>
    </li>
  )
}
