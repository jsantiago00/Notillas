import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './app'

let db: Firestore | undefined

/** Firestore con caché persistente en IndexedDB, compartida entre pestañas: funciona offline. */
export function getDb(): Firestore {
  if (db) return db
  db = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
  // Solo para pruebas locales: VITE_USE_EMULATORS=1 (nunca en el build publicado)
  if (import.meta.env.VITE_USE_EMULATORS === '1') connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return db
}
