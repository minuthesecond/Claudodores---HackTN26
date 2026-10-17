import { useEffect, useReducer } from 'react'
import type { LipReader, ReaderEvent, ReaderStatus } from '../lib/reader'

export type Word = { id: number; text: string; confidence: number }
export type LineResult = { raw: string; phrase: string | null; seconds?: number; error?: string }
export type Line = { id: number; at: number; words: Word[]; result?: LineResult }

type State = {
  lines: Line[]
  current: Word[]
  currentId: number
  currentAt: number
  interim: string | null
  status: ReaderStatus
}

type Action = (ReaderEvent & { at: number }) | { type: 'clear' }

let uid = 0

const toWords = (text: string, confidence = 1): Word[] =>
  text.split(/\s+/).filter(Boolean).map((w) => ({ id: ++uid, text: w, confidence }))

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'interim':
      // The in-progress line keeps its id when committed, so React keeps its DOM.
      return s.currentId
        ? { ...s, interim: a.text }
        : { ...s, interim: a.text, currentId: ++uid, currentAt: a.at }
    case 'word':
      return {
        ...s,
        interim: null,
        current: [...s.current, { id: ++uid, text: a.text, confidence: a.confidence }],
      }
    case 'commit':
      if (!s.current.length) return { ...s, interim: null, currentId: 0 }
      return {
        ...s,
        lines: [...s.lines, { id: s.currentId, at: s.currentAt, words: s.current }],
        current: [],
        currentId: 0,
        currentAt: 0,
        interim: null,
      }
    case 'status':
      return a.status === 'recording'
        ? { ...s, status: a.status, currentAt: a.at, currentId: s.currentId || ++uid }
        : { ...s, status: a.status }
    case 'result': {
      const { type: _, at, ...result } = a
      return {
        ...s,
        lines: [
          ...s.lines,
          { id: s.currentId || ++uid, at: s.currentAt || at, words: toWords(result.phrase ?? result.raw), result },
        ],
        currentId: 0,
        currentAt: 0,
      }
    }
    case 'clear':
      return { ...initial, status: s.status }
  }
}

const initial: State = { lines: [], current: [], currentId: 0, currentAt: 0, interim: null, status: 'idle' }

/** `clock` returns elapsed session time in ms, used to timestamp lines. */
export function useTranscript(reader: LipReader, clock: () => number) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => reader.on((e) => dispatch({ ...e, at: clock() })), [reader, clock])

  const all = [...state.lines.flatMap((l) => l.words), ...state.current]
  const confidence = all.length ? all.reduce((n, w) => n + w.confidence, 0) / all.length : 0

  const results = state.lines.flatMap((l) => (l.result ? [l.result] : []))
  const timed = results.filter((r) => r.seconds !== undefined)

  return {
    ...state,
    wordCount: all.length,
    confidence,
    results: results.length,
    matched: results.filter((r) => r.phrase).length,
    avgSeconds: timed.length ? timed.reduce((n, r) => n + r.seconds!, 0) / timed.length : null,
    clear: () => dispatch({ type: 'clear' }),
  }
}
