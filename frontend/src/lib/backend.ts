/**
 * Talks to the lip-reading server in ../../lipread/server.py.
 *
 * While reading, camera frames stream over a WebSocket (owned by
 * ./frameWorker.ts, which also does the JPEG encoding). The server runs
 * lipread/live.py's loop on them (phrase segmentation, Face Landmarker
 * keypoints, Auto-AVSR) and sends back:
 *   status  — recording | processing | idle
 *   final   — the whole sentence, decoded once the speaker pauses
 */
import type { FrameInput, LipReader, ReaderEvent, ReaderStatus } from './reader'

/** Dev: Vite proxies /api (HTTP + WebSocket) to the server (see vite.config.ts). */
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

const FRAME_MS = 30 // webcams run at ~30 fps; the server resamples to the model's 25
const MAX_IN_FLIGHT = 6 // frames grabbed but not yet handed to the worker
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

// Chrome/Edge: a ReadableStream of every frame from a camera track.
declare const MediaStreamTrackProcessor:
  | (new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<unknown> })
  | undefined

type ServerMessage =
  | { type: 'stats'; fps: number }
  | { type: 'status'; status: ReaderStatus }
  | { type: 'final'; text: string; seconds?: number; error?: string }

export class StreamLipReader implements LipReader {
  private listeners = new Set<(e: ReaderEvent) => void>()
  private worker: Worker | null = null
  private state: 'closed' | 'connecting' | 'open' = 'closed'
  private retryAt = 0
  private lastSent = 0
  private inFlight = 0
  private active = false
  private camera: MediaStreamTrack | null = null // the page's camera track the worker reads from
  private feed: MediaStreamTrack | null = null // our clone of it, consumed by the worker

  on(listener: (e: ReaderEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  tick({ now, source }: FrameInput) {
    if (!source || source.readyState < 2 || !source.videoWidth) return
    this.connect(now)
    if (this.state !== 'open') return
    if (!this.active) {
      this.active = true
      this.worker!.postMessage({ type: 'active', on: true })
    }
    // Best case, the worker reads every frame straight off the camera track, so the rate
    // doesn't depend on how fast this page renders.
    if (this.readTrack(source)) return

    if (now - this.lastSent < FRAME_MS || this.inFlight >= MAX_IN_FLIGHT) return
    // Grabbing a bitmap is a cheap GPU copy; encoding and sending happen in the worker.
    this.lastSent = now
    this.inFlight++
    createImageBitmap(source)
      .then((bitmap) => this.worker?.postMessage({ type: 'frame', bitmap, t: now }, [bitmap]))
      .catch(() => {})
      .finally(() => this.inFlight--)
  }

  flush() {
    this.active = false
    this.worker?.postMessage({ type: 'flush' })
  }

  reset() {
    this.active = false
    this.worker?.postMessage({ type: 'close' })
    this.state = 'closed'
    this.retryAt = 0
    this.emit({ type: 'status', status: 'idle' })
  }

  private readTrack(source: HTMLVideoElement) {
    if (typeof MediaStreamTrackProcessor === 'undefined') return false
    const track = (source.srcObject as MediaStream | null)?.getVideoTracks()[0]
    if (!track || track.readyState !== 'live') return false
    if (track === this.camera) return true
    try {
      const feed = track.clone() // the <video> keeps its own copy of the frames
      const { readable } = new MediaStreamTrackProcessor({ track: feed })
      this.worker!.postMessage({ type: 'track', readable }, [readable as unknown as Transferable])
      this.feed?.stop()
      this.camera = track
      this.feed = feed
      return true
    } catch {
      return false
    }
  }

  private connect(now: number) {
    if (this.state !== 'closed' || now < this.retryAt) return
    this.retryAt = now + RETRY_MS
    if (!this.worker) {
      this.worker = new Worker(new URL('./frameWorker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<{ type: string; data?: string }>) => {
        const m = e.data
        if (m.type === 'open') this.state = 'open'
        else if (m.type === 'closed') {
          this.state = 'closed'
          this.emit({ type: 'status', status: 'idle' })
        } else if (m.data) this.handle(JSON.parse(m.data) as ServerMessage)
      }
    }
    this.state = 'connecting'
    this.worker.postMessage({ type: 'connect', url: streamUrl() })
  }

  private handle(m: ServerMessage) {
    if (m.type === 'stats') this.emit({ type: 'stats', fps: m.fps })
    else if (m.type === 'status') this.emit({ type: 'status', status: m.status })
    else if (m.type === 'final') this.emit({ type: 'result', raw: m.text, seconds: m.seconds, error: m.error })
  }

  private emit(e: ReaderEvent) {
    this.listeners.forEach((l) => l(e))
  }
}
