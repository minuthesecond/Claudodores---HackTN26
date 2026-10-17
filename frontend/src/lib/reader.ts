/**
 * Lip-reading engine interface + a mock implementation.
 *
 * The UI only depends on `LipReader`. `StreamLipReader` (./backend.ts) talks to
 * the lip-reading server; `MockLipReader` is the offline fallback.
 */

export type ReaderStatus = 'idle' | 'recording' | 'processing'

export type ReaderEvent =
  // word-by-word streaming (mock)
  | { type: 'interim'; text: string }
  | { type: 'word'; text: string; confidence: number }
  | { type: 'commit' }
  // phrase-based recognition (backend)
  | { type: 'status'; status: ReaderStatus }
  /** the in-progress phrase so far; replaces the previous partial */
  | { type: 'partial'; text: string }
  /** `phrase` is only set by servers that snap to a fixed phrase list (null = no match) */
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

const CORPUS = [
  'hey can you hear me okay',
  'I think the demo is working pretty well',
  'let me try saying something a little longer this time',
  'the quick brown fox jumps over the lazy dog',
  'we should grab coffee after the presentation',
  'this is running entirely in the browser',
  'nice to meet you my name is Alex',
  'can you read what I am saying right now',
  'it works better when the lighting is good',
  'okay one more sentence and then we are done',
  'what time does the meeting start tomorrow',
  'I really like how fast this feels',
  'please turn to page forty two',
  'the weather has been great this week',
]

// Visually identical mouth shapes (visemes). Lip readers confuse these
// constantly, so the mock uses them to produce believable interim guesses.
const VISEMES = [['b', 'p', 'm'], ['f', 'v'], ['t', 'd', 'n'], ['s', 'z'], ['k', 'g'], ['sh', 'ch', 'j']]

function confuse(word: string): string {
  if (Math.random() > 0.35 || word.length < 3) return word
  for (const group of VISEMES) {
    const hit = group.find((g) => word.toLowerCase().startsWith(g))
    if (hit) {
      const alt = group.filter((g) => g !== hit)
      return alt[Math.floor(Math.random() * alt.length)] + word.slice(hit.length)
    }
  }
  return word.slice(0, -1) + (word.endsWith('s') ? '' : 's')
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

export class MockLipReader implements LipReader {
  private listeners = new Set<(e: ReaderEvent) => void>()
  private queue: string[] = []
  private pending: { text: string; finalizeAt: number } | null = null
  private nextWordAt = 0
  private lastActiveAt = 0
  private lastWordAt = 0
  private wordsInUtterance = 0
  private lastSentence = -1

  on(listener: (e: ReaderEvent) => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  reset() {
    this.queue = []
    this.pending = null
    this.wordsInUtterance = 0
  }

  flush() {
    this.pending = null
    if (this.wordsInUtterance > 0) this.commit()
    else this.emit({ type: 'commit' })
  }

  tick({ now, activity }: FrameInput) {
    const speaking = activity > 0.16
    if (speaking) this.lastActiveAt = now

    // Resolve the current interim guess into a final word.
    if (this.pending && now >= this.pending.finalizeAt) {
      const { text } = this.pending
      this.pending = null
      this.emit({ type: 'word', text, confidence: Math.min(0.99, rand(0.66, 1.06)) })
      this.wordsInUtterance++
      this.lastWordAt = now
      this.nextWordAt = now + rand(140, 340) + text.length * 14
    }

    // Start a new word while the lips are moving.
    if (!this.pending && speaking && now >= this.nextWordAt) {
      if (this.queue.length === 0) {
        if (this.wordsInUtterance > 0) return this.commit()
        this.queue = this.pickSentence().split(' ')
      }
      const text = this.queue.shift()!
      this.emit({ type: 'interim', text: confuse(text) })
      this.pending = { text, finalizeAt: now + rand(110, 300) }
      return
    }

    // Lips stopped — close out the utterance.
    if (!this.pending && this.wordsInUtterance > 0) {
      const silentFor = now - Math.max(this.lastActiveAt, this.lastWordAt)
      // A pause breaks the line; the sentence picks up on the next one.
      if (silentFor > 850) this.commit(false)
    }
  }

  private commit(endSentence = true) {
    if (endSentence) this.queue = []
    this.wordsInUtterance = 0
    this.emit({ type: 'commit' })
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
