import { useEffect, useRef, useState } from 'react'
import type { Line, LineResult, Word } from '../hooks/useTranscript'
import type { ReaderStatus } from '../lib/reader'

export type StatItem = { label: string; value: string }

type Props = {
  lines: Line[]
  pendingAt: number
  status: ReaderStatus
  reading: boolean
  elapsed: number
  stats: StatItem[]
  onClear: () => void
  /** id of the line being spoken aloud right now */
  speakingId: number | null
  /** speaks a line again; absent when the voice is off or unavailable */
  onSpeak?: (line: Line) => void
}

export const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Words({ words }: { words: Word[] }) {
  return (
    <>
      {words.map((w) => (
        <span key={w.id} className="word">
          {w.text}{' '}
        </span>
      ))}
    </>
  )
}

const toText = (lines: Line[]) =>
  lines.map((l) => `[${fmt(l.at)}] ${l.text || (l.result.error ? `(${l.result.error})` : '')}`).join('\n')

function resultMeta(r: LineResult) {
  const time = r.seconds !== undefined ? `${r.seconds.toFixed(2)} s` : ''
  if (r.error) return r.error
  if (r.phrase && r.phrase !== r.raw) return `ICU phrase · model read “${r.raw || '—'}” · ${time}`
  if (r.phrase) return `ICU phrase · ${time}`
  if (r.phrase === null) return `No phrase match · ${time}`
  return r.raw ? `Transcribed in ${time}` : `Nothing read · ${time}`
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="icon">
      <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
      <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Transcript(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const pending = p.status === 'recording' || p.status === 'processing'
  const empty = p.lines.length === 0 && !pending

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [p.lines.length, p.status])

  const copy = async () => {
    await navigator.clipboard.writeText(toText(p.lines))
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([toText(p.lines)], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `unspoken-transcript-${Date.now()}.txt` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const nothingSaved = p.lines.length === 0

  return (
    <section className="panel">
      <header className="panel-head">
        <div className="panel-title">
          <h2>Transcript</h2>
          <span className="mono muted">{fmt(p.elapsed)}</span>
        </div>
        <div className="panel-actions">
          <button className="text-btn" onClick={copy} disabled={nothingSaved}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="text-btn" onClick={download} disabled={nothingSaved}>
            Export
          </button>
          <button className="text-btn" onClick={p.onClear} disabled={empty}>
            Clear
          </button>
        </div>
      </header>

      <div className="panel-body" ref={scrollRef}>
        {empty ? (
          <div className="transcript-empty">
            <p className="empty-title">{p.reading ? 'Watching. Mouth a sentence, then pause.' : 'No transcript yet'}</p>
            <p className="muted small">
              Each sentence is transcribed and spoken once you pause. Face the camera in good light.
            </p>
          </div>
        ) : (
          <ol className="lines">
            {p.lines.map((l) => {
              const speaking = p.speakingId === l.id
              const spoken = !!l.text && !l.result.error
              return (
                <li key={l.id} className={`line ${l.result.error ? 'is-error' : ''} ${speaking ? 'is-speaking' : ''}`}>
                  <time className="mono">{fmt(l.at)}</time>
                  <div>
                    <p>{l.words.length ? <Words words={l.words} /> : l.result.error ? 'Not read' : '—'}</p>
                    <span
                      className={`line-meta mono ${l.result.phrase === null || (!l.result.raw && !l.result.error) ? 'is-warn' : ''}`}
                    >
                      {speaking ? 'Speaking' : resultMeta(l.result)}
                    </span>
                  </div>
                  {p.onSpeak && spoken && (
                    <button
                      className={`speak-btn ${speaking ? 'is-on' : ''}`}
                      onClick={() => p.onSpeak!(l)}
                      aria-label={`Say “${l.text}” again`}
                      title="Say it again"
                    >
                      <SpeakerIcon />
                    </button>
                  )}
                </li>
              )
            })}
            {pending && (
              <li key="pending" className="line is-pending">
                <time className="mono">{fmt(p.pendingAt)}</time>
                <div>
                  <p className="pending">
                    {p.status === 'recording' ? 'Reading lips' : 'Transcribing'}
                    <span className="dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                  </p>
                </div>
              </li>
            )}
          </ol>
        )}
      </div>

      <footer className="panel-foot">
        {p.stats.map((s) => (
          <div key={s.label} className="stat">
            <span className="stat-label">{s.label}</span>
            <span className="stat-value mono">{s.value}</span>
          </div>
        ))}
      </footer>
    </section>
  )
}
