import { useState } from 'react'
import { clock, phraseFor, type Entry, type Phrase } from './conversation'

type Filter = { key: string; label: string; test: (e: Entry) => boolean }

const FILTERS: Filter[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'urgent', label: 'Urgent', test: (e) => !!e.urgent },
  { key: 'phrase', label: 'Phrases', test: (e) => e.source === 'phrase' },
  { key: 'read', label: 'Lip read', test: (e) => e.source === 'read' },
  { key: 'corrected', label: 'Corrected', test: (e) => !!e.corrected },
  { key: 'wrong', label: 'Not right', test: (e) => !!e.rejected },
]

function Tags({ e }: { e: Entry }) {
  return (
    <span className="tags">
      {e.urgent && <span className="tag is-urgent">! Urgent</span>}
      <span className="tag">{e.source === 'phrase' ? 'Phrase' : 'Lip read'}</span>
      {e.snapped && <span className="tag">Matched</span>}
      {e.corrected && <span className="tag">Corrected</span>}
      {e.rejected && <span className="tag">Not right</span>}
    </span>
  )
}

/**
 * For nurses and family: a handover summary of what was asked for, then everything said,
 * newest first, with how each line was produced so staff know how far to trust it.
 */
export function CareTeam({ entries, onReplay, onClear, onBack }: { entries: Entry[]; onReplay: (e: Entry) => void; onClear: () => void; onBack: () => void }) {
  const [filter, setFilter] = useState(FILTERS[0])
  const [confirming, setConfirming] = useState(false)
  const shown = entries.filter(filter.test).reverse()

  // the needs asked for most, by phrase (lip-read lines that matched one count too)
  const needs = new Map<string, { phrase: Phrase; n: number; last: number }>()
  for (const e of entries) {
    const p = !e.rejected && phraseFor(e.say)
    if (!p || p.urgent || p.group === 'answers' || p.key === 'thanks') continue
    const n = needs.get(p.key)
    needs.set(p.key, { phrase: p, n: (n?.n ?? 0) + 1, last: e.when })
  }
  const top = [...needs.values()].sort((a, b) => b.n - a.n).slice(0, 3)
  const urgent = entries.filter((e) => e.urgent && !e.rejected)

  return (
    <div className="care">
      <aside className="care-side">
        <p className="eyebrow">Care team</p>
        <h2>History</h2>
        <div className="filters" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="filter" aria-pressed={f === filter} onClick={() => setFilter(f)}>
              <span>{f.label}</span>
              <span className="count">{entries.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-line btn-sm care-back" onClick={onBack}>
          Back to the patient
        </button>
      </aside>

      <section className="care-main">
        <header className="care-head">
          <h2>{entries.length ? `Since ${clock(entries[0].when)}` : 'Nothing said yet'}</h2>
          <p className="fine">Kept in this browser tab only. Closing the tab clears it.</p>
        </header>

        {entries.length > 0 && (
          <div className="sum">
            <div className={`sum-tile ${urgent.length ? 'is-urgent' : ''}`}>
              <span className="eyebrow">{urgent.length ? '! Urgent' : 'Urgent'}</span>
              <b>{urgent.length}×</b>
              <span className="fine">{urgent.length ? `Last ${clock(urgent[urgent.length - 1].when)} · ${urgent[urgent.length - 1].text}` : 'None this session'}</span>
            </div>
            {top.map(({ phrase, n, last }) => (
              <div key={phrase.key} className="sum-tile">
                <span className="eyebrow">{phrase.label}</span>
                <b>{n}×</b>
                <span className="fine">Last {clock(last)}</span>
              </div>
            ))}
          </div>
        )}

        {shown.length > 0 ? (
          <ol className="log">
            {shown.map((e) => (
              <li key={e.id} className={e.rejected ? 'is-wrong' : ''}>
                <time>{clock(e.when)}</time>
                <span className="log-text">{e.text}</span>
                <Tags e={e} />
                {e.rejected ? (
                  <span className="log-spacer" />
                ) : (
                  <button type="button" className="btn btn-icon" onClick={() => onReplay(e)} aria-label={`Say “${e.text}” again`}>
                    ▶
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="fine">{entries.length ? 'Nothing matches this filter.' : 'Lines appear here as the patient speaks or taps a phrase.'}</p>
        )}

        {entries.length > 0 && (
          <button
            type="button"
            className="btn btn-quiet btn-sm care-clear"
            onClick={() => {
              if (!confirming) return setConfirming(true)
              onClear()
              setConfirming(false)
            }}
            onBlur={() => setConfirming(false)}
          >
            {confirming ? 'Tap again to clear the history' : 'Clear history'}
          </button>
        )}
      </section>
    </div>
  )
}
