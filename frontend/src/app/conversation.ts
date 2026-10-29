/**
 * What the patient has said this session: lip-read sentences, tapped phrases, and the
 * corrections made to them. Kept in this browser tab only (sessionStorage), so a reload
 * doesn't lose it and closing the tab clears it. Nothing is sent anywhere.
 */
import { useCallback, useEffect, useState } from 'react'
import type { LipReader, ReaderStatus } from '../lib/reader'

export type Phrase = {
  key: string
  /** the one word on the tile */
  label: string
  /** the sentence as shown */
  text: string
  /** the sentence as sent to the voice: the voice servers' exact wording, so it plays from their cache */
  say: string
  group: 'needs' | 'comfort' | 'people' | 'answers'
  urgent?: boolean
}

// Same wording as voice/phrases.py and voicebank/prompts.py, which pre-speak these in every voice
export const PHRASES: Phrase[] = [
  { key: 'breathe', label: 'Breathing', text: "I can't breathe", say: "i can't breathe", group: 'needs', urgent: true },
  { key: 'pain', label: 'Pain', text: 'I am in pain', say: 'i am in pain', group: 'needs' },
  { key: 'water', label: 'Water', text: 'I need water', say: 'i need water', group: 'needs' },
  { key: 'bathroom', label: 'Bathroom', text: 'I need to use the bathroom', say: 'i need to use the bathroom', group: 'needs' },
  { key: 'suction', label: 'Suction', text: 'I need suction', say: 'i need suction', group: 'needs' },
  { key: 'nurse', label: 'Nurse', text: 'Call the nurse', say: 'call the nurse', group: 'needs' },
  { key: 'cold', label: 'Cold', text: 'I am cold', say: 'i am cold', group: 'comfort' },
  { key: 'hot', label: 'Hot', text: 'I am hot', say: 'i am hot', group: 'comfort' },
  { key: 'scared', label: 'Scared', text: 'I am scared', say: 'i am scared', group: 'comfort' },
  { key: 'where', label: 'Where am I?', text: 'Where am I?', say: 'where am i', group: 'comfort' },
  { key: 'family', label: 'Family', text: 'Call my family', say: 'call my family', group: 'people' },
  { key: 'thanks', label: 'Thank you', text: 'Thank you', say: 'thank you', group: 'people' },
  { key: 'yes', label: 'Yes', text: 'Yes', say: 'yes', group: 'answers' },
  { key: 'no', label: 'No', text: 'No', say: 'no', group: 'answers' },
]

export const phraseFor = (say: string) => PHRASES.find((p) => p.say === say.trim().toLowerCase())

export type Entry = {
  id: number
  /** wall-clock time, ms */
  when: number
  /** the sentence as shown */
  text: string
  /** the sentence as sent to the voice */
  say: string
  source: 'read' | 'phrase'
  /** lip-read only: the reading before it was matched to an ICU phrase */
  raw?: string
  /** lip-read only: the reading was a near miss for an ICU phrase and was replaced by it */
  snapped?: boolean
  /** the patient picked a different reading */
  corrected?: boolean
  /** the patient said this reading was wrong */
  rejected?: boolean
  urgent?: boolean
}

/** Lip-read text in sentence case: "i'm cold" → "I'm cold". */
export function sentence(text: string) {
  const s = text.trim().replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|d|ve)\b/g, "I'$1")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const KEY = 'unspoken.history'

function load(): Entry[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as Entry[]
  } catch {
    return []
  }
}

let uid = load().reduce((n, e) => Math.max(n, e.id), 0)

/** Reader status plus the session's entries. `missedAt` is when the last reading came back empty. */
export function useConversation(reader: LipReader) {
  const [entries, setEntries] = useState<Entry[]>(load)
  const [status, setStatus] = useState<ReaderStatus>('idle')
  const [missedAt, setMissedAt] = useState(0)

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(entries))
    } catch {
      // private mode: history lasts until reload
    }
  }, [entries])

  const add = useCallback((e: Omit<Entry, 'id' | 'when'>) => {
    const entry = { ...e, id: ++uid, when: Date.now() }
    setEntries((list) => [...list, entry])
    return entry
  }, [])

  useEffect(
    () =>
      reader.on((e) => {
        if (e.type === 'status') setStatus(e.status)
        else if (e.type === 'result') {
          const read = (e.phrase ?? e.raw).trim()
          if (e.error || !read) return setMissedAt(Date.now())
          const phrase = phraseFor(read)
          add({
            source: 'read',
            text: phrase?.text ?? sentence(read),
            say: read,
            raw: e.raw,
            snapped: !!e.phrase && e.phrase !== e.raw,
            urgent: phrase?.urgent,
          })
        }
      }),
    [reader, add],
  )

  const update = useCallback(
    (id: number, patch: Partial<Entry>) => setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e))),
    [],
  )
  const clear = useCallback(() => setEntries([]), [])

  return { entries, status, missedAt, add, update, clear }
}

export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
