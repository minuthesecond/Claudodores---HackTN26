import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Neither server is meant to be called cross-origin from the dev page, so the dev server
// proxies them: /api/* to the lip reader (../lipread/server.py) and /voice/* to the voice
// server (../voice/voice_server.py). Point BACKEND_URL / VOICE_URL elsewhere if they run remotely.
const backend = process.env.BACKEND_URL ?? 'http://localhost:8000'
const voice = process.env.VOICE_URL ?? 'http://localhost:8001'

const proxy = {
  '/api': { target: backend, changeOrigin: true, ws: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
  '/voice': { target: voice, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/voice/, '') },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
