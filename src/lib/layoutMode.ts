import { useSyncExternalStore } from 'react'

/**
 * Cómo se acomoda la barra de herramientas:
 * - phone: fila compacta arriba (pantalla angosta);
 * - tablet: barra flotante vertical a un costado (táctil y ancha);
 * - desktop: horizontal en la barra superior (mouse).
 */
export type LayoutMode = 'phone' | 'tablet' | 'desktop'

const narrow = () => matchMedia('(max-width: 599px)').matches
const coarse = () => matchMedia('(pointer: coarse)').matches

function read(): LayoutMode {
  if (typeof matchMedia !== 'function') return 'desktop'
  if (narrow()) return 'phone'
  return coarse() ? 'tablet' : 'desktop'
}

function subscribe(cb: () => void) {
  const queries = ['(max-width: 599px)', '(pointer: coarse)'].map((q) => matchMedia(q))
  for (const q of queries) q.addEventListener('change', cb)
  return () => {
    for (const q of queries) q.removeEventListener('change', cb)
  }
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribe, read, () => 'desktop')
}
