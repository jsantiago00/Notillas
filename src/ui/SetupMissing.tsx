import { LOGO } from '../lib/assets'
export function SetupMissing() {
  return (
    <main className="center-screen setup">
      <img src={LOGO} alt="" width={72} height={72} />
      <h1>Falta configurar Firebase</h1>
      <p>
        Copiá <code>.env.example</code> como <code>.env</code>, completá las credenciales de tu app web de Firebase y
        reiniciá <code>npm run dev</code>.
      </p>
      <p className="muted">
        Los pasos están en <code>docs/FIREBASE.md</code>.
      </p>
    </main>
  )
}
