import { useAuth } from '../firebase/auth'
import { AccountButton } from './AccountButton'
import { Icon } from './Icon'
import { ThemeButton } from './ThemeButton'

export function Home() {
  const user = useAuth((s) => s.user)
  const first = user?.name.split(' ')[0]
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span>Notillas</span>
        </div>
        <div className="topbar-actions">
          <ThemeButton />
          <AccountButton />
        </div>
      </header>
      <main className="content">
        <div className="empty">
          <Icon name="note" size={48} />
          <h2>Hola{first ? `, ${first}` : ''}</h2>
          <p className="muted">Todavía no hay notas. La lista, las carpetas y el lienzo llegan en las próximas etapas.</p>
        </div>
      </main>
    </div>
  )
}
