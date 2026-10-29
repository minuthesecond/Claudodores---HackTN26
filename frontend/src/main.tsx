import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing/Landing'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/wght.css'
import './styles.css'

// "/" is the landing page; "/start" and "/login" are onboarding; "/app" is the reader.
// The last three load on demand (the reader pulls in MediaPipe).
const App = lazy(() => import('./app/App'))
const Onboarding = lazy(() => import('./onboarding/Onboarding').then((m) => ({ default: m.Onboarding })))
const path = location.pathname.replace(/\/+$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {path === '/app' ? (
        <App />
      ) : path === '/start' || path === '/login' ? (
        <Onboarding mode={path === '/login' ? 'login' : 'start'} />
      ) : (
        <Landing />
      )}
    </Suspense>
  </StrictMode>,
)
