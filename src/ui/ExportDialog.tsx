import { useState } from 'react'
import { canShareFiles, exportPdf, exportPng, fileName, shareOrDownload, download } from '../export/exporters'
import type { Page } from '../model/types'
import { Modal } from './Dialog'
import { Icon } from './Icon'

interface Props {
  pages: readonly Page[]
  current: number
  title: string
  onClose: () => void
}

/** Exportar: PNG de la página actual o PDF de toda la nota, con o sin fondo. */
export function ExportDialog({ pages, current, title, onClose }: Props) {
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf')
  const [background, setBackground] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const share = canShareFiles()

  const run = async (mode: 'share' | 'download') => {
    setBusy(true)
    setError(null)
    try {
      const blob = format === 'pdf' ? await exportPdf(pages, { background }, title) : await exportPng(pages[current], { background })
      const name = format === 'pdf' ? fileName(title, 'pdf') : fileName(title, 'png', pages.length > 1 ? `-p${current + 1}` : '')
      if (mode === 'share') {
        if ((await shareOrDownload(blob, name)) !== 'cancelled') onClose()
      } else {
        download(blob, name)
        onClose()
      }
    } catch (e) {
      setError((e as Error).message || 'No se pudo exportar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} label="Exportar">
      <h2 className="dialog-title">Exportar</h2>
      <div className="export-options">
        <div className="segmented" role="radiogroup" aria-label="Formato">
          <button role="radio" aria-checked={format === 'pdf'} onClick={() => setFormat('pdf')}>
            PDF · {pages.length === 1 ? '1 página' : `${pages.length} páginas`}
          </button>
          <button role="radio" aria-checked={format === 'png'} onClick={() => setFormat('png')}>
            PNG · página {current + 1}
          </button>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Fondo">
          <button role="radio" aria-checked={background} onClick={() => setBackground(true)}>
            Con fondo
          </button>
          <button role="radio" aria-checked={!background} onClick={() => setBackground(false)}>
            {format === 'png' ? 'Sin fondo (transparente)' : 'Sin fondo'}
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        {share && (
          <button className="btn" disabled={busy} onClick={() => run('share')}>
            <Icon name="share" size={18} /> Compartir
          </button>
        )}
        <button className="btn btn-primary-solid" disabled={busy} onClick={() => run('download')}>
          <Icon name="download" size={18} /> {busy ? 'Generando…' : 'Descargar'}
        </button>
      </div>
    </Modal>
  )
}
