/** Tiempo después de cualquier señal del lápiz durante el que se ignoran toques nuevos. */
export const PALM_WINDOW_MS = 300

/**
 * Rechazo de palma: mientras el lápiz está apoyado o cerca (hover), y hasta 300 ms
 * después, los toques nuevos se ignoran. Es pura: recibe los tiempos de los eventos.
 */
export class PalmGuard {
  private penDown = false
  private lastPenAt = -Infinity

  /** Cualquier evento del lápiz: apoyo, movimiento, hover o levantada. */
  notePen(now: number, down: boolean) {
    this.penDown = down
    this.lastPenAt = now
  }

  touchAllowed(now: number): boolean {
    return !this.penDown && now - this.lastPenAt > PALM_WINDOW_MS
  }
}
