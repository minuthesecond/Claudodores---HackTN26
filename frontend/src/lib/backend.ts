/**
 * Talks to the lip-reading server in ../../lipread/server.py.
 *
 * While reading, camera frames stream over a WebSocket. The server runs
 * lipread/live.py's loop on them (phrase segmentation, Face Landmarker
 * keypoints, Auto-AVSR) and sends back:
 *   status  — recording | processing | idle
 *   partial — fast decode of the phrase so far (~1/s while it's mouthed)
 *   final   — full decode once the speaker pauses
 */
import type { FrameInput, LipReader, ReaderEvent, ReaderStatus } from './reader'

/** Dev: Vite proxies /api (HTTP + WebSocket) to the server (see vite.config.ts). */
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

// Send every camera frame (webcams run at ~30 fps; the server resamples to the
// model's 25) at the same size the server works at, so the mouth crop stays sharp.
const MIN_FRAME_MS = 30
const SEND_SIDE = 960
const JPEG_QUALITY = 0.92
const MAX_BUFFERED = 512 * 1024 // skip frames rather than queue them if the link is slow
const RETRY_MS = 2000

export type Health = { ok: boolean; device?: string; model?: string }

export async function checkHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as Health) : null
  } catch {
    return null
  }
}

function streamUrl() {
  const base = new URL(`${API}/stream`, location.href)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return base.href
}

type ServerMessage =
  | { type: 'status'; status: ReaderStatus }
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string; seconds?: number; error?: string }

export class StreamLipReader implements LipReader {
  private listeners = new Set<(e: ReaderEvent) => void>()
  private ws: WebSocket | null = null
  private retryAt = 0
  private lastSent = 0
  private lastFrameTime = -1
  private sending = false
  private canvas = document.createElement('canvas')

  on(listener: (e: ReaderEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  tick({ now, source }: FrameInput) {
    if (!source || source.readyState < 2 || !source.videoWidth) return
    const ws = this.connect(now)
    if (ws?.readyState !== WebSocket.OPEN) return
    if (this.sending || ws.bufferedAmount > MAX_BUFFERED) return
    // only new camera frames, and never faster than the camera
    if (source.currentTime === this.lastFrameTime || now - this.lastSent < MIN_FRAME_MS) return

    this.lastSent = now
    this.lastFrameTime = source.currentTime
    this.sending = true
    const scale = Math.min(1, SEND_SIDE / Math.max(source.videoWidth, source.videoHeight))
    const w = Math.round(source.videoWidth * scale)
    const h = Math.round(source.videoHeight * scale)
    if (this.canvas.width !== w || this.canvas.height !== h) Object.assign(this.canvas, { width: w, height: h })
    this.canvas.getContext('2d')!.drawImage(source, 0, 0, w, h)
    this.canvas.toBlob(
      async (blob) => {
        // Frames go out strictly in order: the server's tracker needs increasing timestamps.
        try {
          if (!blob || ws.readyState !== WebSocket.OPEN) return
          const msg = new Uint8Array(8 + blob.size)
          new DataView(msg.buffer).setFloat64(0, now, true)
          msg.set(new Uint8Array(await blob.arrayBuffer()), 8)
          ws.send(msg)
        } finally {
          this.sending = false
        }
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  }

  flush() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'flush' }))
  }

  reset() {
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.retryAt = 0
    this.emit({ type: 'status', status: 'idle' })
  }

  private connect(now: number) {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return this.ws
    if (now < this.retryAt) return null
    this.retryAt = now + RETRY_MS

    const ws = new WebSocket(streamUrl())
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => this.handle(JSON.parse(e.data as string) as ServerMessage)
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      this.emit({ type: 'status', status: 'idle' })
    }
    this.ws = ws
    return ws
  }

  private handle(m: ServerMessage) {
    if (m.type === 'status') this.emit({ type: 'status', status: m.status })
    else if (m.type === 'partial') this.emit({ type: 'partial', text: m.text })
    else this.emit({ type: 'result', raw: m.text, seconds: m.seconds, error: m.error })
  }

  private emit(e: ReaderEvent) {
    this.listeners.forEach((l) => l(e))
  }
}
