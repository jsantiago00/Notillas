import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { firebaseConfigured } from './firebase/app'
import { initAuth, useAuth } from './firebase/auth'
import { Login } from './ui/Login'
import { SetupMissing } from './ui/SetupMissing'
import { Splash } from './ui/Splash'
import { UpdatePrompt } from './ui/UpdatePrompt'

// Se cargan bajo demanda: el login no trae Firestore ni el lienzo (y el service worker
// los deja precacheados para usar la app sin conexión)
const Home = lazy(() => import('./ui/Home').then((m) => ({ default: m.Home })))
const NoteRoute = lazy(() => import('./ui/NoteRoute').then((m) => ({ default: m.NoteRoute })))
const MemoryNote = lazy(() => import('./ui/MemoryNote').then((m) => ({ default: m.MemoryNote })))

function Gate() {
  const status = useAuth((s) => s.status)
  useEffect(initAuth, [])
  if (!firebaseConfigured) return <SetupMissing />
  if (status === 'loading') return <Splash />
  if (status === 'signedOut') return <Login />
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/nota/:id" element={<NoteRoute />} />
        <Route path="/prueba" element={<MemoryNote />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <Gate />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
