import { useEffect, useReducer } from 'react'
import type { LipReader, ReaderEvent, ReaderStatus } from '../lib/reader'

export type Word = { id: number; text: string }
export type LineResult = { raw: string; phrase?: string | null; seconds?: number; error?: string }
export type Line = { id: number; at: number; words: Word[]; text: string; result: LineResult }

type State = {
  lines: Line[]
  /** when the sentence being mouthed (or transcribed) started; 0 when there is none */
  pendingAt: number
  status: ReaderStatus
}

type Action = (ReaderEvent & { at: number }) | { type: 'clear' }

let uid = 0

const toWords = (text: string): Word[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ id: ++uid, text: w }))

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'status':
      return a.status === 'recording'
        ? { ...s, status: a.status, pendingAt: a.at }
        : { ...s, status: a.status, pendingAt: a.status === 'idle' ? 0 : s.pendingAt }
    case 'result': {
      const { type: _, at, ...result } = a
      const text = (result.phrase ?? result.raw).trim()
      return {
        ...s,
        lines: [...s.lines, { id: ++uid, at: s.pendingAt || at, words: toWords(text), text, result }],
        pendingAt: 0,
      }
    }
    case 'stats':
      return s
    case 'clear':
      return { ...initial, status: s.status }
  }
}

const initial: State = { lines: [], pendingAt: 0, status: 'idle' }

/** `clock` returns elapsed session time in ms, used to timestamp lines. */
export function useTranscript(reader: LipReader, clock: () => number) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => reader.on((e) => dispatch({ ...e, at: clock() })), [reader, clock])

  const timed = state.lines.filter((l) => l.result.seconds !== undefined)

  return {
    ...state,
    wordCount: state.lines.reduce((n, l) => n + l.words.length, 0),
    results: state.lines.length,
    avgSeconds: timed.length ? timed.reduce((n, l) => n + l.result.seconds!, 0) / timed.length : null,
    clear: () => dispatch({ type: 'clear' }),
  }
}
