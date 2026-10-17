import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Auto-AVSR server (../avsr/avsr_server.py) has no CORS headers, so the dev
// server proxies /api/* to it. Point BACKEND_URL elsewhere if it runs remotely.
const backend = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  preview: {
    proxy: {
      '/api': { target: backend, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
