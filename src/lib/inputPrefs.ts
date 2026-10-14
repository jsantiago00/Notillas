import { create } from 'zustand'

const PEN_SEEN = 'notillas.penSeen'
const FINGER_DRAWS = 'notillas.fingerDraws'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* modo privado: vale para esta sesión */
  }
}

interface InputPrefs {
  /** Ya se usó un lápiz en este dispositivo */
  penSeen: boolean
  /** El dedo dibuja (si no, desplaza la hoja) */
  fingerDraws: boolean
  /** Se acaba de detectar el lápiz por primera vez (para avisar) */
  justDetectedPen: boolean
}

const penSeen = read(PEN_SEEN) === '1'
const stored = read(FINGER_DRAWS)

/**
 * Si en este dispositivo nunca se vio un lápiz, el dedo dibuja (es lo útil en el
 * celular). Cuando aparece un lápiz, el dedo pasa a desplazar la hoja.
 */
export const useInputPrefs = create<InputPrefs>(() => ({
  penSeen,
  fingerDraws: stored === null ? !penSeen : stored === '1',
  justDetectedPen: false,
}))

export function setFingerDraws(v: boolean) {
  write(FINGER_DRAWS, v ? '1' : '0')
  useInputPrefs.setState({ fingerDraws: v, justDetectedPen: false })
}

export function notePenSeen() {
  if (useInputPrefs.getState().penSeen) return
  write(PEN_SEEN, '1')
  write(FINGER_DRAWS, '0')
  useInputPrefs.setState({ penSeen: true, fingerDraws: false, justDetectedPen: true })
}

export function dismissPenNotice() {
  useInputPrefs.setState({ justDetectedPen: false })
}
