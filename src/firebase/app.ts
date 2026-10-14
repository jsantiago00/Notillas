import { initializeApp, type FirebaseApp } from 'firebase/app'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

/** Sin .env la app muestra cómo configurarla en vez de romperse. */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

let app: FirebaseApp | undefined

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) throw new Error('Firebase no está configurado (falta .env)')
  return (app ??= initializeApp(firebaseConfig))
}

/**
 * El login con redirect anda mejor cuando la app se sirve desde el mismo dominio que
 * `authDomain` (Safari y Chrome bloquean el almacenamiento de terceros). Firebase Hosting
 * sirve el sitio en <proyecto>.web.app y en <proyecto>.firebaseapp.com: si entran por
 * el primero, los mandamos al segundo.
 */
export function redirectToAuthDomainIfNeeded(): boolean {
  const { projectId, authDomain } = firebaseConfig
  if (!projectId || authDomain !== `${projectId}.firebaseapp.com`) return false
  if (location.hostname !== `${projectId}.web.app`) return false
  location.replace(`https://${authDomain}${location.pathname}${location.search}${location.hash}`)
  return true
}
