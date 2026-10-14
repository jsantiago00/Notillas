import { create } from 'zustand'

export type SyncStatus = 'synced' | 'syncing' | 'offline'

interface SyncState {
  online: boolean
  /** Hay cambios esperando el debounce */
  queued: boolean
  /** Lotes enviados que el servidor todavía no confirmó (offline quedan en IndexedDB) */
  inFlight: number
}

export const useSyncState = create<SyncState>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  queued: false,
  inFlight: 0,
}))

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSyncState.setState({ online: true }))
  window.addEventListener('offline', () => useSyncState.setState({ online: false }))
}

/** Sin conexión, sincronizando o sincronizado. */
export function useSyncStatus(): SyncStatus {
  return useSyncState((s) => (!s.online ? 'offline' : s.queued || s.inFlight > 0 ? 'syncing' : 'synced'))
}

/** Avisa de escrituras: «queued» (en espera), «idle» (se mandó) o la promesa del lote. */
export function trackWrite(w: 'queued' | 'idle' | Promise<unknown>) {
  if (w === 'queued') return useSyncState.setState({ queued: true })
  if (w === 'idle') return useSyncState.setState({ queued: false })
  useSyncState.setState((s) => ({ inFlight: s.inFlight + 1 }))
  // La promesa resuelve cuando el servidor confirma (sin conexión, recién al volver)
  w.catch(() => undefined).finally(() => useSyncState.setState((s) => ({ inFlight: Math.max(0, s.inFlight - 1) })))
}
