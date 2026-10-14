import { signInWithGoogle, useAuth } from '../firebase/auth'
import { GoogleLogo } from './Icon'
import { LOGO } from '../lib/assets'

export function Login() {
  const { busy, error } = useAuth()
  return (
    <main className="center-screen login">
      <img src={LOGO} alt="" width={88} height={88} />
      <h1>Notillas</h1>
      <p className="muted">Notas a mano alzada con tu lápiz, en el celu, la tablet y la compu.</p>
      <button className="btn btn-google" onClick={signInWithGoogle} disabled={busy}>
        <GoogleLogo />
        {busy ? 'Abriendo Google…' : 'Entrar con Google'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
