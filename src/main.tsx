import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initPosthog } from '@/lib/posthog'
import './index.css'

// Initialiser PostHog (opt-out par defaut, RGPD-compliant)
initPosthog()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
