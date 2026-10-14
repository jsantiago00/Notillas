import type { Page } from '../model/types'
import { drawPageBackground } from './backgrounds'
import { strokePath } from './strokeOutline'

export interface RenderOptions {
  /** Píxeles por unidad de página */
  scale: number
  /** Con el fondo de la hoja (papel y líneas) o transparente */
  background: boolean
}

/**
 * Dibuja una página completa en un canvas fuera de pantalla: fondo, resaltadores y después
 * tinta. Se usa para las miniaturas y para exportar a PNG.
 */
export function renderPage(page: Page, { scale, background }: RenderOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale))
  canvas.height = Math.max(1, Math.round(page.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  if (background) drawPageBackground(ctx, page.background, page.width, page.height, scale)
  ctx.beginPath()
  ctx.rect(0, 0, page.width, page.height)
  ctx.clip()
  for (const pass of ['highlighter', 'pen'] as const) {
    for (const s of page.strokes) {
      if (s.tool !== pass) continue
      ctx.globalAlpha = s.opacity
      ctx.fillStyle = s.color
      ctx.fill(strokePath(s))
    }
  }
  ctx.globalAlpha = 1
  return canvas
}

/** Miniatura chica de la primera página, como data URL WebP (unos 5–20 KB). */
export function thumbnail(page: Page, width = 240): string {
  const c = renderPage(page, { scale: width / page.width, background: true })
  const webp = c.toDataURL('image/webp', 0.7)
  // Safari viejo no codifica WebP y devuelve PNG: igual sirve
  return webp
}
