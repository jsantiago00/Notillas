import { useEffect, useRef, useState } from 'react'
import { signOut, useAuth } from '../firebase/auth'
import { Icon } from './Icon'

export function AccountButton() {
  const user = useAuth((s) => s.user)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (!user) return null
  const initial = user.name.trim().charAt(0).toUpperCase()
  return (
    <div className="menu-anchor" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-label="Cuenta" aria-expanded={open}>
        {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <strong>{user.name}</strong>
            <span className="muted">{user.email}</span>
          </div>
          <button role="menuitem" className="menu-item" onClick={() => signOut()}>
            <Icon name="logout" size={18} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
