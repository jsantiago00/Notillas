import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { firebaseConfigured } from './firebase/app'
import { initAuth, useAuth } from './firebase/auth'
import { Home } from './ui/Home'
import { Login } from './ui/Login'
import { NoteEditor } from './ui/NoteEditor'
import { SetupMissing } from './ui/SetupMissing'
import { Splash } from './ui/Splash'
import { UpdatePrompt } from './ui/UpdatePrompt'

function Gate() {
  const status = useAuth((s) => s.status)
  useEffect(initAuth, [])
  if (!firebaseConfigured) return <SetupMissing />
  if (status === 'loading') return <Splash />
  if (status === 'signedOut') return <Login />
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/nota/:id" element={<NoteEditor />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
