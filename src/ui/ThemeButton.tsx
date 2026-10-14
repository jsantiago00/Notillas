import { cycleTheme, useTheme } from '../lib/theme'
import { Icon } from './Icon'

const label = { system: 'Tema: según el sistema', light: 'Tema: claro', dark: 'Tema: oscuro' } as const
const icon = { system: 'monitor', light: 'sun', dark: 'moon' } as const

export function ThemeButton() {
  const pref = useTheme((s) => s.pref)
  return (
    <button className="icon-btn" onClick={cycleTheme} title={label[pref]} aria-label={label[pref]}>
      <Icon name={icon[pref]} />
    </button>
  )
}
