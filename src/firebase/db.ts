import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseApp } from './app'

let db: Firestore | undefined

/** Firestore con caché persistente en IndexedDB, compartida entre pestañas: funciona offline. */
export function getDb(): Firestore {
  return (db ??= initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  }))
}
