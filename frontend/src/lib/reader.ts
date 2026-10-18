/**
 * Lip-reading engine interface + a mock implementation.
 *
 * The UI only depends on `LipReader`. `StreamLipReader` (./backend.ts) talks to
 * the lip-reading server; `MockLipReader` is the offline fallback.
 */

export type ReaderStatus = 'idle' | 'recording' | 'processing'

export type ReaderEvent =
  | { type: 'status'; status: ReaderStatus }
  /** frames per second the model is receiving */
  | { type: 'stats'; fps: number }
  /** one whole sentence, decoded after the speaker pauses.
   * `phrase` is only set by servers that snap to a fixed phrase list (null = no match) */
  | { type: 'result'; raw: string; phrase?: string | null; seconds?: number; error?: string }

export type FrameInput = {
  now: number
  /** 0..1 — how much the lips are moving right now */
  activity: number
  /** 0..1 — MediaPipe `jawOpen` blendshape */
  jaw: number
  /** the camera video, for readers that send frames */
  source?: HTMLVideoElement
}

export interface LipReader {
  tick(frame: FrameInput): void
  /** finish the current utterance immediately (e.g. when reading stops) */
  flush(): void
  reset(): void
  on(listener: (e: ReaderEvent) => void): () => void
}

// The voice server pre-speaks these (voice/voice_server.py PHRASES), so offline demos play instantly
const CORPUS = [
  'i am in pain',
  "i can't breathe",
  'i need water',
  'call the nurse',
  'call my family',
  'i am cold',
  'i am hot',
  'thank you',
  'i need to use the bathroom',
  'where am i',
  'i am scared',
]

const rand = (min: number, max: number) => min + Math.random() * (max - min)

// Same as lipread/server.py
const PAUSE_MS = 700 // a pause this long ends the sentence
const MIN_MS = 800 // shorter clips are ignored
const MAX_MS = 8000 // longer ones are cut here

/**
 * Offline stand-in for the server: watches lip activity like the real segmenter, then
 * "transcribes" each sentence once the speaker pauses.
 */
export class MockLipReader implements LipReader {
  private listeners = new Set<(e: ReaderEvent) => void>()
  private startedAt: number | null = null
  private lastActiveAt = 0
  private timer = 0
  private transcribing = false
  private lastSentence = -1

  on(listener: (e: ReaderEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  reset() {
    clearTimeout(this.timer)
    this.startedAt = null
    this.transcribing = false
    this.emit({ type: 'status', status: 'idle' })
  }

  flush() {
    if (this.startedAt !== null) this.finish(performance.now())
  }

  tick({ now, activity }: FrameInput) {
    if (this.transcribing) return // like the server: no new sentence until this one is read
    if (activity > 0.16) {
      this.lastActiveAt = now
      if (this.startedAt === null) {
        this.startedAt = now
        this.emit({ type: 'status', status: 'recording' })
      }
    }
    if (this.startedAt !== null && (now - this.lastActiveAt > PAUSE_MS || now - this.startedAt > MAX_MS)) {
      this.finish(now)
    }
  }

  private finish(now: number) {
    const long = now - (this.startedAt ?? now) > MIN_MS
    this.startedAt = null
    if (!long) return this.emit({ type: 'status', status: 'idle' })
    this.transcribing = true
    this.emit({ type: 'status', status: 'processing' })
    const seconds = rand(0.6, 1.4)
    this.timer = window.setTimeout(() => {
      this.transcribing = false
      this.emit({ type: 'result', raw: this.pickSentence(), seconds: Math.round(seconds * 100) / 100 })
      this.emit({ type: 'status', status: 'idle' })
    }, seconds * 1000)
  }

  private pickSentence() {
    let i = this.lastSentence
    while (i === this.lastSentence) i = Math.floor(Math.random() * CORPUS.length)
    this.lastSentence = i
    return CORPUS[i]
  }

  private emit(e: ReaderEvent) {
    this.listeners.forEach((l) => l(e))
  }
}
