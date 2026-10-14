import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../firebase/auth'
import { NoteSync, type SyncState } from '../firebase/noteSync'
import { Icon } from './Icon'
import { NoteEditor, type MenuAction } from './NoteEditor'
import { Splash } from './Splash'
import { SyncBadge } from './SyncBadge'

/** Una nota guardada en Firestore: la carga, la sincroniza y abre el editor. */
export function NoteRoute({ actions }: { actions?: MenuAction[] }) {
  const { id = '' } = useParams()
  const uid = useAuth((s) => s.user?.uid)
  const [state, setState] = useState<SyncState>({ status: 'loading' })
  const sync = useRef<NoteSync | null>(null)

  useEffect(() => {
    if (!uid || !id) return
    setState({ status: 'loading' })
    const s = new NoteSync(uid, id, setState)
    sync.current = s
    s.start()
    return () => {
      s.stop()
      sync.current = null
    }
  }, [uid, id])

  if (state.status === 'loading') return <Splash />
  if (state.status !== 'ready') {
    return (
      <div className="center-screen">
        <Icon name="note" size={48} />
        <h2>{state.status === 'missing' ? 'Esta nota no existe o se borró' : 'No se pudo abrir la nota'}</h2>
        {state.status === 'error' && <p className="muted">{state.message}</p>}
        <Link to="/" className="btn">
          Volver a la lista
        </Link>
      </div>
    )
  }
  return (
    <NoteEditor
      note={state.model}
      title={state.meta.title}
      onRename={(t) => sync.current?.rename(t)}
      status={<SyncBadge />}
      actions={actions}
    />
  )
}
