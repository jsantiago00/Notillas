import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { redirectToAuthDomainIfNeeded } from './firebase/app'
import './styles.css'

if (!redirectToAuthDomainIfNeeded()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
