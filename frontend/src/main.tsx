import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Landing } from './landing/Landing'
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource-variable/atkinson-hyperlegible-mono/wght.css'
import './styles.css'

// "/" is the landing page; "/app" is the reader (loaded on demand, it pulls in MediaPipe).
const App = lazy(() => import('./App'))
const isApp = location.pathname.replace(/\/+$/, '') === '/app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isApp ? (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    ) : (
      <Landing />
    )}
  </StrictMode>,
)
