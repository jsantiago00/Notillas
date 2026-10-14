import { useEffect, useRef } from 'react'
import { BACKGROUND_TYPES, LINE_COLORS, PAPERS, SPACINGS, SPACING_MAX, SPACING_MIN } from '../model/background'
import type { Background, BackgroundType } from '../model/types'

export type Scope = 'page' | 'all'

interface Props {
  value: Background
  scope: Scope
  page: number
  total: number
  onChange: (bg: Background) => void
  onScope: (scope: Scope) => void
  onClose: () => void
}

/** Panel para elegir el fondo de la hoja: tipo, espaciado, color de línea y papel. */
export function BackgroundPanel({ value, scope, page, total, onChange, onScope, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // En captura: el toque en la hoja que cierra el panel no llega al lienzo (no dibuja)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (ref.current?.contains(t) || t.closest?.('[data-panel-toggle="bg"]')) return
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

  const set = (patch: Partial<Background>) => onChange({ ...value, ...patch })
  const lined = value.type !== 'blank'

  return (
    <div className="panel bg-panel" ref={ref} role="dialog" aria-label="Fondo de la hoja">
      <div className="panel-head">
        <strong>Fondo</strong>
        {total > 1 && (
          <div className="segmented" role="radiogroup" aria-label="Aplicar a">
            <button role="radio" aria-checked={scope === 'page'} onClick={() => onScope('page')}>
              Página {page + 1} de {total}
            </button>
            <button role="radio" aria-checked={scope === 'all'} onClick={() => onScope('all')}>
              Todas
            </button>
          </div>
        )}
      </div>

      <div className="bg-types" role="radiogroup" aria-label="Tipo de hoja">
        {BACKGROUND_TYPES.map((t) => (
          <button
            key={t.type}
            role="radio"
            aria-checked={value.type === t.type}
            className="bg-type"
            onClick={() => set({ type: t.type })}
          >
            <TypePreview type={t.type} bg={value} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {lined && (
        <>
          <div className="panel-row">
            <span className="panel-label">Espaciado</span>
            <div className="chips">
              {SPACINGS.map((s) => (
                <button key={s.value} className="chip" aria-pressed={value.spacing === s.value} onClick={() => set({ spacing: s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            className="slider"
            min={SPACING_MIN}
            max={SPACING_MAX}
            step={1}
            value={value.spacing}
            onChange={(e) => set({ spacing: Number(e.target.value) })}
            aria-label="Espaciado fino"
          />
          <div className="panel-row">
            <span className="panel-label">Líneas</span>
            <div className="swatches">
              {LINE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="swatch"
                  style={{ background: c.value }}
                  aria-pressed={value.color === c.value}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => set({ color: c.value })}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="panel-row">
        <span className="panel-label">Papel</span>
        <div className="swatches">
          {PAPERS.map((c) => (
            <button
              key={c.value}
              className="swatch swatch-paper"
              style={{ background: c.value }}
              aria-pressed={value.paper === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => set({ paper: c.value })}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Miniatura del tipo de hoja con los colores elegidos. */
function TypePreview({ type, bg }: { type: BackgroundType; bg: Background }) {
  const s = 10
  const lines = [s, 2 * s, 3 * s, 4 * s]
  return (
    <svg width="48" height="56" viewBox="0 0 48 56" aria-hidden="true">
      <rect x="0.5" y="0.5" width="47" height="55" rx="4" fill={bg.paper} stroke="rgb(0 0 0 / 0.15)" />
      {type === 'ruled' && (
        <>
          {lines.map((y) => (
            <line key={y} x1="2" x2="46" y1={y + 8} y2={y + 8} stroke={bg.color} strokeWidth="1.2" />
          ))}
          <line x1="9" x2="9" y1="1" y2="55" stroke="#ec9ea6" strokeWidth="1.2" />
        </>
      )}
      {type === 'grid' &&
        [8, 16, 24, 32, 40].map((v) => (
          <g key={v} stroke={bg.color} strokeWidth="1">
            <line x1={v} x2={v} y1="1" y2="55" />
            {v < 48 && <line x1="1" x2="47" y1={v + 4} y2={v + 4} />}
            <line x1="1" x2="47" y1={v + 12} y2={v + 12} />
          </g>
        ))}
      {type === 'dots' &&
        [8, 16, 24, 32, 40].flatMap((x) =>
          [8, 16, 24, 32, 40, 48].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill={bg.color} />),
        )}
    </svg>
  )
}
