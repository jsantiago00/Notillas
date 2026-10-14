import { useEffect, useRef, useState } from 'react'
import type { LayoutMode } from '../lib/layoutMode'
import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_SIZES,
  PEN_COLORS,
  PEN_SIZES,
  SIZE_RANGE,
  setEraser,
  setInk,
  setTool,
  useTools,
  type ToolId,
} from '../lib/toolPrefs'
import { Icon, type IconName } from './Icon'

const TOOLS: { id: ToolId; icon: IconName; label: string; key: string }[] = [
  { id: 'pen', icon: 'pen', label: 'Lapicera', key: 'P' },
  { id: 'highlighter', icon: 'highlighter', label: 'Resaltador', key: 'H' },
  { id: 'eraser', icon: 'eraser', label: 'Goma', key: 'E' },
  { id: 'lasso', icon: 'lasso', label: 'Lazo', key: 'L' },
]

interface Props {
  mode: LayoutMode
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

/**
 * Herramientas, deshacer y rehacer. Tocar la herramienta activa abre sus opciones
 * (color, grosor, modo de la goma).
 */
export function Toolbar({ mode, canUndo, canRedo, onUndo, onRedo }: Props) {
  const tool = useTools((s) => s.tool)
  const pen = useTools((s) => s.pen)
  const hl = useTools((s) => s.highlighter)
  const shapes = useTools((s) => s.shapes)
  const [open, setOpen] = useState(false)

  const pick = (id: ToolId) => {
    if (id === tool) setOpen((o) => !o)
    else {
      setTool(id)
      setOpen(false)
    }
  }

  const dot = (id: ToolId) => (id === 'pen' ? pen.color : id === 'highlighter' ? hl.color : null)

  return (
    <div className={`toolbar toolbar-${mode}`} role="toolbar" aria-label="Herramientas">
      {TOOLS.map((t) => {
        const color = dot(t.id)
        return (
          <button
            key={t.id}
            className={`icon-btn tool-btn${tool === t.id ? ' is-on' : ''}`}
            data-panel-toggle="tool"
            aria-pressed={tool === t.id}
            aria-label={`${t.label} (${t.key})${tool === t.id ? ': tocá de nuevo para ver opciones' : ''}`}
            title={`${t.label} (${t.key})`}
            onClick={() => pick(t.id)}
          >
            <Icon name={t.icon} />
            {color && <span className="tool-dot" style={{ background: color }} />}
          </button>
        )
      })}
      <span className="toolbar-sep" />
      <button
        className={`icon-btn${shapes ? ' is-on' : ''}`}
        aria-pressed={shapes}
        aria-label={shapes ? 'Formas: activado (dejá el lápiz quieto al final del trazo)' : 'Formas: desactivado'}
        title="Reconocer formas: dejá el lápiz quieto al terminar"
        onClick={() => useTools.setState({ shapes: !shapes })}
      >
        <Icon name="shapes" />
      </button>
      <button className="icon-btn" disabled={!canUndo} onClick={onUndo} aria-label="Deshacer (Ctrl+Z)" title="Deshacer (Ctrl+Z)">
        <Icon name="undo" />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={onRedo} aria-label="Rehacer (Ctrl+Shift+Z)" title="Rehacer (Ctrl+Shift+Z)">
        <Icon name="redo" />
      </button>
      {open && <ToolOptions mode={mode} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ToolOptions({ mode, onClose }: { mode: LayoutMode; onClose: () => void }) {
  const prefs = useTools()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // En captura: el toque en la hoja que cierra el panel no llega al lienzo
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (ref.current?.contains(t) || t.closest?.('[data-panel-toggle="tool"]')) return
      onClose()
      if (t.closest?.('.board')) e.stopPropagation()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const t = prefs.tool
  return (
    <div className={`panel tool-panel tool-panel-${mode}`} ref={ref} role="dialog" aria-label="Opciones de la herramienta">
      {(t === 'pen' || t === 'highlighter') && (
        <InkOptions
          tool={t}
          color={prefs[t].color}
          size={prefs[t].size}
          colors={t === 'pen' ? PEN_COLORS : HIGHLIGHTER_COLORS}
          sizes={t === 'pen' ? PEN_SIZES : HIGHLIGHTER_SIZES}
        />
      )}
      {t === 'eraser' && (
        <>
          <strong>Goma</strong>
          <div className="segmented" role="radiogroup" aria-label="Modo de la goma">
            <button role="radio" aria-checked={prefs.eraser.mode === 'stroke'} onClick={() => setEraser({ mode: 'stroke' })}>
              Trazo entero
            </button>
            <button role="radio" aria-checked={prefs.eraser.mode === 'area'} onClick={() => setEraser({ mode: 'area' })}>
              Por área
            </button>
          </div>
          <SizeRow
            sizes={ERASER_SIZES}
            value={prefs.eraser.size}
            range={SIZE_RANGE.eraser}
            preview={(s) => Math.min(30, s * 0.9)}
            onChange={(size) => setEraser({ size })}
          />
          <p className="panel-hint">Con el botón del S Pen apretado, el lápiz borra con cualquier herramienta.</p>
        </>
      )}
      {t === 'lasso' && (
        <>
          <strong>Lazo</strong>
          <p className="panel-hint">
            Rodeá trazos para seleccionarlos. Arrastrá la selección para moverla y las esquinas para cambiar el tamaño.
          </p>
        </>
      )}
      {mode === 'tablet' && (
        <button
          className="btn btn-small btn-ghost"
          onClick={() => useTools.setState((s) => ({ side: s.side === 'left' ? 'right' : 'left' }))}
        >
          <Icon name="swap" size={18} /> Pasar la barra al otro lado
        </button>
      )}
    </div>
  )
}

function InkOptions(props: { tool: 'pen' | 'highlighter'; color: string; size: number; colors: string[]; sizes: number[] }) {
  const { tool, color, size, colors, sizes } = props
  const custom = !colors.includes(color)
  return (
    <>
      <strong>{tool === 'pen' ? 'Lapicera' : 'Resaltador'}</strong>
      <div className="swatches swatches-wrap" role="radiogroup" aria-label="Color">
        {colors.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            role="radio"
            aria-checked={c === color}
            aria-pressed={c === color}
            aria-label={`Color ${c}`}
            onClick={() => setInk(tool, { color: c })}
          />
        ))}
        <label className={`swatch swatch-custom${custom ? ' is-custom' : ''}`} title="Otro color" style={custom ? { background: color } : undefined}>
          <input type="color" value={color} onChange={(e) => setInk(tool, { color: e.target.value })} aria-label="Elegir otro color" />
        </label>
      </div>
      <SizeRow
        sizes={sizes}
        value={size}
        range={SIZE_RANGE[tool]}
        preview={(s) => (tool === 'pen' ? Math.min(22, s * 2.2 + 2) : Math.min(26, s * 0.6))}
        color={color}
        onChange={(s) => setInk(tool, { size: s })}
      />
    </>
  )
}

function SizeRow(props: {
  sizes: number[]
  value: number
  range: { min: number; max: number; step: number }
  preview: (s: number) => number
  color?: string
  onChange: (s: number) => void
}) {
  const { sizes, value, range, preview, color = 'currentColor', onChange } = props
  return (
    <>
      <div className="chips" role="radiogroup" aria-label="Grosor">
        {sizes.map((s, i) => (
          <button
            key={s}
            className="chip size-chip"
            role="radio"
            aria-checked={s === value}
            aria-pressed={s === value}
            aria-label={['Fino', 'Medio', 'Grueso'][i]}
            onClick={() => onChange(s)}
          >
            <span style={{ width: preview(s), height: preview(s), background: color }} />
          </button>
        ))}
      </div>
      <input
        type="range"
        className="slider"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Grosor fino"
      />
    </>
  )
}
