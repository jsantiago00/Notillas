import { useRegisterSW } from 'virtual:pwa-register/react'

/** Avisa cuando hay una versión nueva (el service worker no se activa solo, para no cortar un trazo). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Revisa si hay versión nueva cada hora mientras la app está abierta
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  if (!needRefresh && !offlineReady) return null
  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>Hay una versión nueva.</span>
          <button className="btn btn-small" onClick={() => updateServiceWorker(true)}>
            Actualizar
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setNeedRefresh(false)}>
            Después
          </button>
        </>
      ) : (
        <>
          <span>Lista para usar sin conexión.</span>
          <button className="btn btn-small btn-ghost" onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </>
      )}
    </div>
  )
}
