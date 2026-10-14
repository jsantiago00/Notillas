import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Diálogo modal chico con un campo de texto (renombrar, nueva carpeta). */
export function PromptDialog(props: {
  title: string
  initial?: string
  placeholder?: string
  confirm?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const { title, initial = '', placeholder, confirm = 'Guardar', onSubmit, onClose } = props
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <Modal onClose={onClose} label={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value.trim())
          onClose()
        }}
      >
        <h2 className="dialog-title">{title}</h2>
        <input
          ref={input}
          className="text-input"
          value={value}
          maxLength={120}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary-solid">
            {confirm}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ConfirmDialog(props: { title: string; body?: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { title, body, confirm, danger, onConfirm, onClose } = props
  return (
    <Modal onClose={onClose} label={title}>
      <h2 className="dialog-title">{title}</h2>
      {body && <p className="muted dialog-body">{body}</p>}
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onClose} autoFocus>
          Cancelar
        </button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary-solid'}`}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
