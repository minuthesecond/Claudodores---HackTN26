/**
 * Talks to the lip-reading server in ../../lipread/server.py.
 *
 * Segments phrases exactly like lipread/live.py (jawOpen thresholds + pause),
 * records each phrase from the camera with MediaRecorder, and POSTs the clip
 * to /transcribe. The server runs live.py's pipeline on it and returns text.
 * (avsr/avsr_server.py speaks the same API and also returns a snapped `phrase`.)
 */
import type { FrameInput, LipReader, ReaderEvent } from './reader'

/** Dev: Vite proxies /api to the server (see vite.config.ts). */
export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

// Same defaults as lipread/live.py
const START = 0.1 // jaw opening that starts a phrase
const STILL = 0.04 // jaw opening below this counts as a pause
const PAUSE_MS = 1000 // pause that ends a phrase
const MAX_MS = 8000
const MIN_SPEECH_MS = 300 // ignore blips shorter than this

// Recorders can't be rewound, so while idle we keep two running, restarted in
// turn every CYCLE_MS. When a phrase starts we keep the older one, which
// already holds 1–2 s of lead-in (live.py's pre-roll).
const CYCLE_MS = 1000

const MIME =
  ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm'].find(
    (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t),
  ) ?? ''

type Rec = { rec: MediaRecorder; chunks: Blob[]; startedAt: number }
type Result = Extract<ReaderEvent, { type: 'result' }>

export type Health = { ok: boolean; device?: string; model?: string }

export async function checkHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as Health) : null
  } catch {
    return null
  }
}

export class BackendLipReader implements LipReader {
  private listeners = new Set<(e: ReaderEvent) => void>()
  private stream: MediaStream | null = null
  private idle: Rec[] = []
  private clip: { rec: Rec; startedAt: number; quietSince: number | null } | null = null
  private busy = false
  private lastCycle = -Infinity
  private generation = 0

  on(listener: (e: ReaderEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  attach(stream: MediaStream | null) {
    if (stream === this.stream) return
    this.reset()
    this.stream = stream
  }

  tick({ now, jaw }: FrameInput) {
    if (!this.stream) return

    if (!this.clip) {
      if (this.busy) return // like live.py: one phrase in flight at a time
      this.cycle(now)
      if (jaw > START && this.idle.length) {
        const [oldest, ...rest] = this.idle
        rest.forEach(discard)
        this.idle = []
        this.clip = { rec: oldest, startedAt: now, quietSince: null }
        this.emit({ type: 'status', status: 'recording' })
      }
      return
    }

    const c = this.clip
    c.quietSince = jaw < STILL ? (c.quietSince ?? now) : null
    const paused = c.quietSince !== null && now - c.quietSince > PAUSE_MS
    if (paused || now - c.startedAt > MAX_MS) void this.finish(now)
  }

  flush() {
    this.idle.forEach(discard)
    this.idle = []
    this.lastCycle = -Infinity
    if (this.clip) void this.finish(performance.now())
  }

  reset() {
    this.generation++
    this.idle.forEach(discard)
    this.idle = []
    if (this.clip) discard(this.clip.rec)
    this.clip = null
    this.busy = false
    this.lastCycle = -Infinity
    this.emit({ type: 'status', status: 'idle' })
  }

  private cycle(now: number) {
    this.idle = this.idle.filter((r) => {
      const stale = now - r.startedAt > 2 * CYCLE_MS + 200
      if (stale) discard(r)
      return !stale
    })
    if (now - this.lastCycle >= CYCLE_MS) {
      this.lastCycle = now
      const r = this.record(now)
      if (r) this.idle.push(r)
    }
  }

  private record(now: number): Rec | null {
    try {
      const rec = new MediaRecorder(this.stream!, MIME ? { mimeType: MIME } : undefined)
      const r: Rec = { rec, chunks: [], startedAt: now }
      rec.ondataavailable = (e) => e.data.size && r.chunks.push(e.data)
      rec.start()
      return r
    } catch {
      return null
    }
  }

  private async finish(now: number) {
    const { rec, startedAt, quietSince } = this.clip!
    this.clip = null
    if ((quietSince ?? now) - startedAt < MIN_SPEECH_MS) {
      discard(rec)
      this.emit({ type: 'status', status: 'idle' })
      return
    }

    this.busy = true
    this.emit({ type: 'status', status: 'processing' })
    const gen = this.generation
    const result = await send(await stop(rec))
    if (gen !== this.generation) return
    this.busy = false
    this.emit(result)
    this.emit({ type: 'status', status: 'idle' })
  }

  private emit(e: ReaderEvent) {
    this.listeners.forEach((l) => l(e))
  }
}

function discard(r: Rec) {
  r.rec.ondataavailable = null
  if (r.rec.state !== 'inactive') r.rec.stop()
}

function stop(r: Rec) {
  return new Promise<Blob>((resolve) => {
    r.rec.onstop = () => resolve(new Blob(r.chunks, { type: r.rec.mimeType || MIME }))
    if (r.rec.state === 'inactive') r.rec.onstop(new Event('stop'))
    else r.rec.stop()
  })
}

async function send(blob: Blob): Promise<Result> {
  const form = new FormData()
  form.append('file', blob, blob.type.includes('mp4') ? 'clip.mp4' : 'clip.webm')
  try {
    const res = await fetch(`${API}/transcribe`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    const d = (await res.json()) as { raw?: string; phrase?: string | null; seconds?: number; error?: string }
    return { type: 'result', raw: d.raw ?? '', phrase: d.phrase, seconds: d.seconds, error: d.error }
  } catch (e) {
    return { type: 'result', raw: '', error: (e as Error).message || 'Request failed' }
  }
}
