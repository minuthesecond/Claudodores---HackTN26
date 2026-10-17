import { useEffect, useRef, useState } from 'react'
import type { Line, LineResult, Word } from '../hooks/useTranscript'
import type { ReaderStatus } from '../lib/reader'

export type StatItem = { label: string; value: string; bar?: number }

type Props = {
  lines: Line[]
  current: Word[]
  currentId: number
  currentAt: number
  interim: string | null
  status: ReaderStatus
  reading: boolean
  elapsed: number
  stats: StatItem[]
  onClear: () => void
}

export const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Words({ words, interim, caret }: { words: Word[]; interim: string | null; caret?: boolean }) {
  return (
    <>
      {words.map((w) => (
        <span
          key={w.id}
          className={`word ${w.confidence < 0.7 ? 'is-unsure' : ''}`}
          title={`${Math.round(w.confidence * 100)}% confidence`}
        >
          {w.text}{' '}
        </span>
      ))}
      {interim && <span className="word is-interim">{interim} </span>}
      {caret && <span className="caret" />}
    </>
  )
}

const lineText = (l: Line) => l.words.map((w) => w.text).join(' ') || (l.result?.error ? `(${l.result.error})` : '')
const toText = (lines: Line[]) => lines.map((l) => `[${fmt(l.at)}] ${lineText(l)}`).join('\n')

function resultMeta(r: LineResult) {
  const time = r.seconds !== undefined ? `${r.seconds.toFixed(2)}S` : ''
  if (r.error) return r.error
  if (r.phrase) return `Model read: ${r.raw || '—'} / ${time}`
  if (r.phrase === null) return `No phrase match / ${time}`
  return r.raw ? `Read in ${time}` : `Nothing read / ${time}`
}

export function Transcript(p: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const pending = p.status === 'recording' || p.status === 'processing'
  const hasCurrent = p.current.length > 0 || !!p.interim || pending
  const empty = p.lines.length === 0 && !hasCurrent

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [p.lines.length, p.current.length, p.interim, p.status])

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
            <p className="empty-title">{p.reading ? 'Watching — start speaking' : 'No transcript yet'}</p>
            <p className="muted small">Face the camera in good light. Audio is never recorded.</p>
          </div>
        ) : (
          <ol className="lines">
            {p.lines.map((l) => (
              <li key={l.id} className={`line ${l.result?.error ? 'is-error' : ''}`}>
                <time className="mono">{fmt(l.at)}</time>
                <div>
                  <p>{l.words.length ? <Words words={l.words} interim={null} /> : l.result?.error ? 'Not read' : '—'}</p>
                  {l.result && (
                    <span className={`line-meta mono ${l.result.phrase === null || (!l.result.raw && !l.result.error) ? 'is-warn' : ''}`}>{resultMeta(l.result)}</span>
                  )}
                </div>
              </li>
            ))}
            {hasCurrent && (
              <li key={p.currentId} className="line is-current">
                <time className="mono">{fmt(p.currentAt)}</time>
                <div>
                  {p.current.length || p.interim ? (
                    <p>
                      <Words words={p.current} interim={p.interim} caret />
                    </p>
                  ) : (
                    <p className="pending">
                      {p.status === 'recording' ? 'Reading lips' : 'Finishing'}
                      <span className="caret" />
                    </p>
                  )}
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
            {s.bar !== undefined && (
              <span className="stat-bar">
                <span style={{ transform: `scaleX(${s.bar})` }} />
              </span>
            )}
          </div>
        ))}
      </footer>
    </section>
  )
}
