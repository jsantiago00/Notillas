import { useState } from 'react'
import { PEN_COLORS } from '../lib/toolPrefs'
import { Icon } from './Icon'

interface Props {
  /** Caja de la selección en píxeles, relativa a la ventana */
  box: { x: number; y: number; w: number; h: number; count: number }
  onDelete: () => void
  onDuplicate: () => void
  onColor: (c: string) => void
  onDone: () => void
}

/** Acciones sobre lo seleccionado con el lazo, flotando arriba (o abajo) de la selección. */
export function SelectionBar({ box, onDelete, onDuplicate, onColor, onDone }: Props) {
  const [colors, setColors] = useState(false)
  const width = 230
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, box.x + box.w / 2 - width / 2))
  const above = box.y - 64 > 60
  const top = above ? box.y - 60 : Math.min(window.innerHeight - 60, box.y + box.h + 12)
  return (
    <div className="selection-bar" style={{ left, top }} role="toolbar" aria-label={`${box.count} trazos seleccionados`}>
      {colors ? (
        <>
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              className="swatch swatch-small"
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => {
                onColor(c)
                setColors(false)
              }}
            />
          ))}
          <button className="icon-btn" onClick={() => setColors(false)} aria-label="Cerrar colores">
            <Icon name="back" size={18} />
          </button>
        </>
      ) : (
        <>
          <button className="icon-btn" onClick={onDelete} aria-label="Borrar selección" title="Borrar (Supr)">
            <Icon name="trash" size={20} />
          </button>
          <button className="icon-btn" onClick={onDuplicate} aria-label="Duplicar" title="Duplicar">
            <Icon name="copy" size={20} />
          </button>
          <button className="icon-btn" onClick={() => setColors(true)} aria-label="Cambiar color" title="Cambiar color">
            <span className="color-ring" />
          </button>
          <button className="icon-btn" onClick={onDone} aria-label="Listo" title="Listo (Esc)">
            <Icon name="check" size={20} />
          </button>
        </>
      )}
    </div>
  )
}
