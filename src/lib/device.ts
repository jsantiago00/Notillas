/** Rasgos del dispositivo que deciden cómo loguear y cómo dibujar. */
export interface DeviceTraits {
  /** Corre como app instalada (display-mode: standalone o navigator.standalone en iOS) */
  standalone: boolean
  /** Puntero principal grueso y sin hover: celular o tablet */
  touchPrimary: boolean
  /** iPadOS se presenta como Mac de escritorio; lo detectamos por los puntos de toque */
  ipadDesktopUA: boolean
}

export function readDeviceTraits(): DeviceTraits {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches
  return {
    standalone: mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navigator.standalone === true,
    touchPrimary: mq('(hover: none) and (pointer: coarse)'),
    ipadDesktopUA: /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1,
  }
}

/**
 * signInWithPopup falla seguido en la PWA instalada y en navegadores móviles
 * (el popup se abre en otra pestaña o lo bloquean); ahí conviene el redirect.
 */
export function prefersRedirectLogin(t: DeviceTraits): boolean {
  return t.standalone || t.touchPrimary || t.ipadDesktopUA
}
