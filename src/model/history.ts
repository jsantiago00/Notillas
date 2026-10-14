import type { Stroke } from './types'

/**
 * Un cambio en los trazos de una página: los que estaban antes y los que quedan después.
 * Sirve para todo: agregar (before vacío), borrar (after vacío), cortar con la goma
 * y mover o escalar con el lazo (mismo id, contenido nuevo).
 */
export interface StrokeChange {
  pageId: string
  before: Stroke[]
  after: Stroke[]
}

export function invertChanges(changes: readonly StrokeChange[]): StrokeChange[] {
  return changes.map((c) => ({ pageId: c.pageId, before: c.after, after: c.before })).reverse()
}

/** Pila de deshacer y rehacer: local, por sesión, no se sincroniza. */
export class History {
  private undoStack: StrokeChange[][] = []
  private redoStack: StrokeChange[][] = []
  private readonly limit: number

  constructor(limit = 200) {
    this.limit = limit
  }

  /** Registra una acción nueva; borra lo que había para rehacer. */
  push(changes: StrokeChange[]) {
    if (changes.length === 0) return
    this.undoStack.push(changes)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  /** Devuelve los cambios a aplicar para deshacer (ya invertidos), o null. */
  undo(): StrokeChange[] | null {
    const c = this.undoStack.pop()
    if (!c) return null
    this.redoStack.push(c)
    return invertChanges(c)
  }

  redo(): StrokeChange[] | null {
    const c = this.redoStack.pop()
    if (!c) return null
    this.undoStack.push(c)
    return c
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}
