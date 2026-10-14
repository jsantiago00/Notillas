import { drawPageBackground } from '../canvas/backgrounds'
import { renderPage } from '../canvas/renderPage'
import { outlineOf, traceOutline } from '../canvas/strokeOutline'
import { inkColor } from '../model/background'
import type { Page } from '../model/types'

export interface ExportOptions {
  /** Con el fondo de la hoja, o sin fondo (PNG transparente / PDF blanco sin líneas) */
  background: boolean
}

/** PNG de una página a 2× (2480 × 3508 px, como un A4 a 300 ppp). */
export async function exportPng(page: Page, { background }: ExportOptions): Promise<Blob> {
  const canvas = renderPage(page, { scale: 2, background })
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'),
  )
}

/**
 * PDF de toda la nota, una hoja A4 por página. Es vectorial: el contorno de cada trazo va
 * como un trazado relleno (los resaltadores con transparencia) y el fondo como líneas.
 * jsPDF se carga recién acá, para no sumarle peso al inicio de la app.
 */
export async function exportPdf(pages: readonly Page[], { background }: ExportOptions, title = ''): Promise<Blob> {
  const { jsPDF, GState } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true })
  doc.setProperties({ title: title || 'Notillas', creator: 'Notillas' })
  const pw = doc.internal.pageSize.getWidth()
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage('a4', 'portrait')
    const scale = pw / page.width
    const ctx = doc.context2d
    ctx.save()
    ctx.scale(scale, scale)
    // El contexto de jsPDF imita al del canvas: los fondos se dibujan con el mismo código
    if (background) drawPageBackground(ctx as unknown as CanvasRenderingContext2D, page.background, page.width, page.height, scale * 2)
    const paper = background ? page.background.paper : '#ffffff'
    // La opacidad va con un estado gráfico de PDF (globalAlpha del contexto de jsPDF no la aplica)
    let alpha = 1
    for (const pass of ['highlighter', 'pen'] as const) {
      for (const s of page.strokes) {
        if (s.tool !== pass) continue
        if (s.opacity !== alpha) doc.setGState(new GState({ opacity: (alpha = s.opacity) }))
        ctx.fillStyle = inkColor(s.color, paper)
        ctx.beginPath()
        traceOutline(ctx, outlineOf(s, true))
        ctx.fill()
      }
    }
    if (alpha !== 1) doc.setGState(new GState({ opacity: 1 }))
    ctx.restore()
  })
  return doc.output('blob')
}

/** Comparte el archivo (celular) o, si no se puede, lo descarga. */
export async function shareOrDownload(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // Si falla el menú de compartir, descargamos
    }
  }
  download(blob, filename)
  return 'downloaded'
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Nombre de archivo a partir del título, sin tildes (algunos navegadores descartan esos nombres). */
export function fileName(title: string, ext: string, suffix = ''): string {
  const ascii = (title || 'Nota').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const base = ascii.replace(/[^\w .,()-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nota'
  return `${base}${suffix}.${ext}`
}

export const canShareFiles = () =>
  typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })
