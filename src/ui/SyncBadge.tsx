import { useSyncStatus } from '../firebase/syncStatus'
import { Icon } from './Icon'

const LABEL = {
  synced: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Sin conexión: los cambios se guardan en este dispositivo y suben al volver',
} as const

/** Puntito de estado junto al título: sincronizado, sincronizando o sin conexión. */
export function SyncBadge() {
  const status = useSyncStatus()
  return (
    <span className={`sync-badge sync-${status}`} title={LABEL[status]} aria-label={LABEL[status]} role="status">
      <Icon name={status === 'offline' ? 'cloudOff' : status === 'syncing' ? 'refresh' : 'cloud'} size={18} />
    </span>
  )
}
