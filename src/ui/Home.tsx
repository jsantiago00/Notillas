import { Link } from 'react-router-dom'
import { useAuth } from '../firebase/auth'
import { AccountButton } from './AccountButton'
import { Icon } from './Icon'
import { ThemeButton } from './ThemeButton'
import { LOGO } from '../lib/assets'

export function Home() {
  const user = useAuth((s) => s.user)
  const first = user?.name.split(' ')[0]
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img src={LOGO} alt="" width={28} height={28} />
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
          <p className="muted">
            Todavía no hay notas guardadas: la lista y las carpetas llegan en la etapa 5. Mientras tanto, podés probar el
            lienzo (lo que dibujes se pierde al recargar).
          </p>
          <Link to="/nota/borrador" className="btn btn-primary">
            <Icon name="pen" size={20} /> Probar el lienzo
          </Link>
        </div>
      </main>
    </div>
  )
}
