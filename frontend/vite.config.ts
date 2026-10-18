import { fileURLToPath } from 'node:url'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'

// Neither server is meant to be called cross-origin from the dev page, so the dev server
// proxies them: /api/* to the lip reader (../lipread/server.py) and /voice/* to the voice
// server (../voice/voice_server.py). Point BACKEND_URL / VOICE_URL elsewhere if they run remotely.
const backend = process.env.BACKEND_URL ?? 'http://localhost:8000'
const voice = process.env.VOICE_URL ?? 'http://localhost:8001'
// Voice banking lives in ../voicebank (server on :8003, UI source in ../voicebank/ui)
const voicebank = process.env.VOICEBANK_URL ?? 'http://localhost:8003'
const voicebankUi = fileURLToPath(new URL('../voicebank/ui', import.meta.url))

const proxy = {
  '/api': { target: backend, changeOrigin: true, ws: true, rewrite: (p: string) => p.replace(/^\/api/, '') },
  // before /voice, which would otherwise also match /voicebank
  '/voicebank': { target: voicebank, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/voicebank/, '') },
  '/voice': { target: voice, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/voice/, '') },
}

export default defineConfig({
  plugins: [react()],
  // ../voicebank/ui has no node_modules of its own, so react resolves from here
  resolve: { alias: { '@voicebank': voicebankUi }, dedupe: ['react', 'react-dom'] },
  server: { proxy, fs: { allow: [searchForWorkspaceRoot(process.cwd()), voicebankUi] } },
  preview: { proxy },
})
