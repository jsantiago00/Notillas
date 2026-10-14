import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Board } from '../canvas/Board'
import type { PointerDebug } from '../canvas/InputController'
import { dismissPenNotice, notePenSeen, setFingerDraws, useInputPrefs } from '../lib/inputPrefs'
import { saveLastBackground } from '../model/background'
import { getMemoryPages } from '../model/memoryNotes'
import type { Background } from '../model/types'
import { BackgroundPanel, type Scope } from './BackgroundPanel'
import { Icon } from './Icon'

const PEN = { color: '#1f1d1a', size: 4 }

export function NoteEditor() {
  const { id = 'borrador' } = useParams()
  const rootRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<Board | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showDebug, setShowDebug] = useState(false)
  const [debug, setDebug] = useState<PointerDebug | null>(null)
  const debugOn = useRef(false)
  const [page, setPage] = useState({ index: 0, total: 1 })
  const [bgOpen, setBgOpen] = useState(false)
  const [bg, setBg] = useState<Background | null>(null)
  const [scope, setScope] = useState<Scope>('page')
  const fingerDraws = useInputPrefs((s) => s.fingerDraws)
  const justDetectedPen = useInputPrefs((s) => s.justDetectedPen)

  useEffect(() => {
    debugOn.current = showDebug
  }, [showDebug])

  useEffect(() => {
    const root = rootRef.current!
    let lastDebug = 0
    const board = new Board(root, getMemoryPages(id), {
      pen: PEN,
      fingerDraws: () => useInputPrefs.getState().fingerDraws,
      onPenDetected: notePenSeen,
      onZoom: setZoom,
      onPage: (index, total) => setPage({ index, total }),
      onDebug: (info) => {
        if (!debugOn.current) return
        const now = performance.now()
        if (now - lastDebug < 100) return
        lastDebug = now
        setDebug(info)
      },
    })
    boardRef.current = board
    return () => {
      board.destroy()
      boardRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (!justDetectedPen) return
    const t = setTimeout(dismissPenNotice, 5000)
    return () => clearTimeout(t)
  }, [justDetectedPen])

  // Con el panel abierto, muestra el fondo de la página que está a la vista
  useEffect(() => {
    if (bgOpen && boardRef.current) setBg(boardRef.current.background(page.index))
  }, [bgOpen, page.index])

  const changeBackground = (next: Background) => {
    setBg(next)
    boardRef.current?.setBackground(scope === 'all' ? 'all' : page.index, next)
    saveLastBackground(next)
  }

  const changeScope = (next: Scope) => {
    setScope(next)
    if (next === 'all' && bg) boardRef.current?.setBackground('all', bg)
  }

  const closeBg = useCallback(() => setBgOpen(false), [])

  const fingerLabel = fingerDraws ? 'El dedo dibuja (tocá para que desplace)' : 'El dedo desplaza (tocá para que dibuje)'

  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to="/" className="icon-btn" aria-label="Volver a la lista" title="Volver">
          <Icon name="back" />
        </Link>
        <span className="editor-title">Nota sin título</span>
        <div className="editor-actions">
          <button
            className={`icon-btn${fingerDraws ? ' is-on' : ''}`}
            onClick={() => setFingerDraws(!fingerDraws)}
            aria-pressed={fingerDraws}
            aria-label={fingerLabel}
            title={fingerLabel}
          >
            <Icon name={fingerDraws ? 'finger' : 'hand'} />
          </button>
          <button
            className={`icon-btn${bgOpen ? ' is-on' : ''}`}
            data-panel-toggle="bg"
            onClick={() => setBgOpen((v) => !v)}
            aria-expanded={bgOpen}
            aria-label="Fondo de la hoja"
            title="Fondo de la hoja"
          >
            <Icon name="sheet" />
          </button>
          <button
            className="icon-btn"
            onClick={() => boardRef.current?.addPage()}
            aria-label="Agregar una página al final"
            title="Agregar página"
          >
            <Icon name="pagePlus" />
          </button>
          <button
            className="btn btn-small btn-ghost zoom-btn"
            onClick={() => boardRef.current?.fitWidth()}
            title="Ajustar al ancho"
            aria-label={`Zoom ${Math.round(zoom * 100)} %. Tocá para ajustar al ancho`}
          >
            {Math.round(zoom * 100)} %
          </button>
          <button
            className={`icon-btn${showDebug ? ' is-on' : ''}`}
            onClick={() => setShowDebug((v) => !v)}
            aria-pressed={showDebug}
            aria-label="Datos del lápiz"
            title="Datos del lápiz"
          >
            <Icon name="info" />
          </button>
        </div>
      </header>
      <div className="board" ref={rootRef} />
      {page.total > 1 && (
        <div className="page-pill" aria-live="polite">
          {page.index + 1} / {page.total}
        </div>
      )}
      {bgOpen && bg && (
        <BackgroundPanel
          value={bg}
          scope={scope}
          page={page.index}
          total={page.total}
          onChange={changeBackground}
          onScope={changeScope}
          onClose={closeBg}
        />
      )}
      {showDebug && (
        <div className="debug-panel" aria-live="off">
          {debug ? (
            <>
              <span>{debug.type}</span>
              <span>presión {debug.pressure.toFixed(2)}</span>
              <span>
                incl. {debug.tiltX}° / {debug.tiltY}°
              </span>
              <span>botones {debug.buttons}</span>
              <span>
                eventos ×{debug.coalesced} · pred. {debug.predicted}
              </span>
              <span>
                contacto {Math.round(debug.width)}×{Math.round(debug.height)}
              </span>
            </>
          ) : (
            <span>Tocá la hoja para ver los datos del puntero</span>
          )}
        </div>
      )}
      {justDetectedPen && (
        <div className="toast" role="status">
          Detectamos un lápiz: ahora el dedo desplaza la hoja.
          <button className="btn btn-small" onClick={() => setFingerDraws(true)}>
            Que dibuje
          </button>
        </div>
      )}
    </div>
  )
}
