import { LOGO } from '../lib/assets'
export function Splash() {
  return (
    <div className="center-screen" aria-busy="true">
      <img src={LOGO} alt="" width={72} height={72} className="splash-logo" />
    </div>
  )
}
