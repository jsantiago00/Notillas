import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { create } from 'zustand'
import { firebaseConfig, firebaseConfigured, getFirebaseApp } from './app'
import { prefersRedirectLogin, readDeviceTraits } from '../lib/device'

export interface SessionUser {
  uid: string
  name: string
  email: string
  photoURL: string | null
}

interface AuthState {
  /** loading: todavía no sabemos si hay sesión (se resuelve desde IndexedDB, también offline) */
  status: 'loading' | 'signedOut' | 'signedIn'
  user: SessionUser | null
  busy: boolean
  error: string | null
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', user: null, busy: false, error: null }))

let auth: Auth | undefined

function toSessionUser(u: User): SessionUser {
  return { uid: u.uid, name: u.displayName ?? u.email ?? 'Sin nombre', email: u.email ?? '', photoURL: u.photoURL }
}

function messageFor(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null
    case 'auth/network-request-failed':
      return 'No hay conexión. Para entrar la primera vez en este dispositivo necesitás internet.'
    case 'auth/unauthorized-domain':
      return `Este dominio (${location.hostname}) no está autorizado en Firebase Authentication.`
    case 'auth/operation-not-allowed':
      return 'El acceso con Google no está habilitado en el proyecto de Firebase.'
    default:
      return `No se pudo iniciar sesión${code ? ` (${code})` : ''}.`
  }
}

/** Arranca la escucha de sesión. getAuth usa persistencia en IndexedDB: si ya entraste, entra directo. */
export function initAuth(): void {
  if (!firebaseConfigured || auth) return
  auth = getAuth(getFirebaseApp())
  auth.languageCode = 'es'
  onAuthStateChanged(auth, (u) => {
    useAuth.setState({ status: u ? 'signedIn' : 'signedOut', user: u ? toSessionUser(u) : null })
  })
  // Si volvemos de un signInWithRedirect, acá aparece el resultado (o el error)
  getRedirectResult(auth).catch((err) => useAuth.setState({ error: messageFor(err) }))
}

function provider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  return p
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) return
  useAuth.setState({ busy: true, error: null })
  try {
    if (prefersRedirectLogin(readDeviceTraits(), location.host === firebaseConfig.authDomain)) {
      await signInWithRedirect(auth, provider()) // navega fuera de la app; no vuelve
      return
    }
    try {
      await signInWithPopup(auth, provider())
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider())
        return
      }
      throw err
    }
  } catch (err) {
    useAuth.setState({ error: messageFor(err) })
  } finally {
    useAuth.setState({ busy: false })
  }
}

export async function signOut(): Promise<void> {
  if (auth) await fbSignOut(auth)
}
