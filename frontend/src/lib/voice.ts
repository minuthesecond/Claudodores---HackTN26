/**
 * Speaks finished sentences with the voice server in ../../voice/voice_server.py
 * (XTTS-v2, :8001). Dev: Vite proxies /voice to it (see vite.config.ts).
 *
 * /speak/stream sends a WAV header and then raw 16-bit PCM as XTTS generates it. We play
 * those samples with Web Audio the moment a little has arrived, rather than letting an
 * <audio> element buffer first, so speech starts ~0.2 s after the request on a GPU.
 * Sentences play one after another, never over each other.
 */
import { VOICEBANK } from '@voicebank'

export const VOICE = (import.meta.env.VITE_VOICE_URL as string | undefined) ?? '/voice'

export type VoiceHealth = { ok: boolean; device?: string; voice?: string }

export async function checkVoice(): Promise<VoiceHealth | null> {
  try {
    const res = await fetch(`${VOICE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as VoiceHealth) : null
  } catch {
    return null
  }
}

const RATE = 24000 // XTTS-v2: 24 kHz, mono, 16-bit
const HEADER = 44
const PREBUFFER = 0.12 // seconds of audio to hold before starting, so playback doesn't stutter
const LEAD = 0.03 // scheduling headroom

type Item = { id: number; text: string }

export class Speaker {
  private queue: Item[] = []
  private current: Item | null = null
  private abort: AbortController | null = null
  private ctx: AudioContext | null = null
  private sources = new Set<AudioBufferSourceNode>()
  private listeners = new Set<(id: number | null) => void>()
  private profile: string | null = null

  /** Speak in a banked voice (../../voicebank, same stream format), or null for the built-in voice. */
  setVoice(profile: string | null) {
    this.profile = profile
  }

  /** Called with the id of the line being spoken, or null when nothing is. */
  on(listener: (id: number | null) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  say(id: number, text: string) {
    const clean = text.trim()
    if (!clean) return
    this.queue.push({ id, text: clean })
    if (!this.current) void this.next()
  }

  stop() {
    this.queue = []
    this.abort?.abort()
    this.abort = null
    this.sources.forEach((s) => s.stop())
    this.sources.clear()
    this.set(null)
  }

  private async next() {
    const item = this.queue.shift()
    if (!item) return this.set(null)
    this.set(item)
    const abort = new AbortController()
    this.abort = abort
    try {
      await this.play(item.text, abort.signal)
    } catch {
      // network error or stopped: move on
    }
    if (this.abort !== abort) return // stopped or replaced
    this.abort = null
    void this.next()
  }

  /** Streams one sentence and resolves once its last sample has played. */
  private async play(text: string, signal: AbortSignal) {
    this.ctx ??= new AudioContext({ sampleRate: RATE })
    const ctx = this.ctx
    if (ctx.state === 'suspended') await ctx.resume()

    const url = this.profile
      ? `${VOICEBANK}/speak/stream?profile=${this.profile}&text=${encodeURIComponent(text)}`
      : `${VOICE}/speak/stream?text=${encodeURIComponent(text)}`
    const res = await fetch(url, { signal })
    if (!res.ok || !res.body) return
    const reader = res.body.getReader()

    let header = HEADER
    let carry: number | null = null // odd byte left over between network chunks
    let pending: number[] = []
    let at = 0 // when the next buffer starts
    let started = false
    let lastEnd: Promise<void> = Promise.resolve()

    const flush = () => {
      if (!pending.length) return
      const buf = ctx.createBuffer(1, pending.length, RATE)
      buf.getChannelData(0).set(pending.map((v) => v / 32768))
      pending = []
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      at = Math.max(at, ctx.currentTime + LEAD)
      src.start(at)
      at += buf.duration
      this.sources.add(src)
      lastEnd = new Promise((done) => {
        src.onended = () => {
          this.sources.delete(src)
          done()
        }
      })
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      let bytes = value
      if (header > 0) {
        const skip = Math.min(header, bytes.length)
        header -= skip
        bytes = bytes.subarray(skip)
      }
      let i = 0
      if (carry !== null && bytes.length) {
        pending.push(((bytes[0] << 8) | carry) << 16 >> 16)
        carry = null
        i = 1
      }
      for (; i + 1 < bytes.length; i += 2) pending.push(((bytes[i + 1] << 8) | bytes[i]) << 16 >> 16)
      if (i < bytes.length) carry = bytes[i]
      if (started || pending.length >= PREBUFFER * RATE) {
        started = true
        flush()
      }
    }
    flush()
    await lastEnd
  }

  private set(item: Item | null) {
    this.current = item
    this.listeners.forEach((l) => l(item?.id ?? null))
  }
}
