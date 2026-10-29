import { useEffect, useState, type ReactNode } from 'react'
import type { LipReader } from '../lib/reader'
import { Camera } from './Camera'
import { PHRASES, clock, type Entry, type Phrase } from './conversation'

/** What the bedside is doing right now. Each has its own glyph, word and colour. */
export type Phase = 'off' | 'paused' | 'away' | 'listening' | 'reading' | 'speaking' | 'checking'

const LABEL: Record<Phase, string> = {
  off: 'Camera off',
  paused: 'Reading paused',
  away: 'Reading paused while this is open',
  listening: 'Listening',
  reading: 'Reading lips',
  speaking: 'Speaking',
  checking: 'Checking what you said',
}

function Glyph({ phase }: { phase: Phase }) {
  if (phase === 'listening') return <span className="g-ring" aria-hidden />
  if (phase === 'reading' || phase === 'checking')
    return (
      <span className="g-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    )
  if (phase === 'speaking')
    return (
      <span className="g-bars" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    )
  return <span className={phase === 'off' ? 'g-off' : 'g-pause'} aria-hidden />
}

export function Band({ phase, voice, children }: { phase: Phase; voice: string; children?: ReactNode }) {
  return (
    <div className={`band is-${phase}`}>
      <Glyph phase={phase} />
      <span className="band-label">{phase === 'speaking' ? `Speaking in ${voice}` : LABEL[phase]}</span>
      {children}
    </div>
  )
}

/** Yes and No look the same on purpose: colour could nudge the answer, so the shape and word carry it. */
export function YesNo({ onAnswer, asking = false, disabled = false }: { onAnswer: (yes: boolean) => void; asking?: boolean; disabled?: boolean }) {
  return (
    <div className={`yn ${asking ? 'is-asking' : ''}`}>
      <button type="button" className="yn-btn" onClick={() => onAnswer(true)} disabled={disabled}>
        <span aria-hidden>✓</span>Yes
      </button>
      <button type="button" className="yn-btn" onClick={() => onAnswer(false)} disabled={disabled}>
        <span aria-hidden>✕</span>No
      </button>
    </div>
  )
}

type RailProps = {
  tab: 'camera' | 'phrases'
  onTab: (tab: 'camera' | 'phrases') => void
  stream: MediaStream | null
  cameraBusy: boolean
  cameraError: string | null
  onCamera: () => void
  reading: boolean
  active: boolean
  onPause: () => void
  reader: LipReader
  mirrored: boolean
  online: boolean
  phrases: Phrase[]
  onPhrase: (p: Phrase) => void
  onAllPhrases: () => void
  /** a guess is waiting for Yes or No */
  asking: boolean
  /** Yes and No can't be used (asking, but out of guesses) */
  answerOff: boolean
  onAnswer: (yes: boolean) => void
}

/** The patient's side: their mirror, their controls, and a Yes and No that never leave. */
export function Rail(p: RailProps) {
  return (
    <aside className="rail" aria-label="Patient controls">
      <div className="seg" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={p.tab === 'camera'} onClick={() => p.onTab('camera')}>
          Camera
        </button>
        <button type="button" role="tab" aria-selected={p.tab === 'phrases'} onClick={() => p.onTab('phrases')}>
          Phrases
        </button>
      </div>

      {p.tab === 'camera' ? (
        p.stream ? (
          <div className="rail-cam">
            <Camera stream={p.stream} reading={p.active} reader={p.reader} mirrored={p.mirrored} />
            <button type="button" className="btn btn-quiet" onClick={p.onPause}>
              {p.reading ? 'Pause reading' : 'Resume reading'}
            </button>
          </div>
        ) : (
          <div className="cam-off">
            <button type="button" className="btn btn-primary btn-xl" onClick={p.onCamera} disabled={p.cameraBusy}>
              {p.cameraBusy ? 'Waiting for permission' : 'Turn on camera'}
            </button>
            <p className="fine">
              Only the mouth is read.{' '}
              {p.online
                ? 'Video goes to the lip reader only while reading.'
                : 'Practice mode: video stays on this device.'}
            </p>
            {p.cameraError && <p className="err">✕ {p.cameraError}</p>}
          </div>
        )
      ) : (
        <>
          <div className="rail-phrases">
            {p.phrases.map((ph) => (
              <button
                key={ph.key}
                type="button"
                className={`btn btn-phrase ${ph.urgent ? 'is-urgent' : ''}`}
                onClick={() => p.onPhrase(ph)}
              >
                {ph.urgent && <span className="flag">! Urgent</span>}
                {ph.text}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-line rail-all" onClick={p.onAllPhrases}>
            All phrases
          </button>
        </>
      )}

      <div className="rail-foot">
        {p.asking && <p className="rail-ask">Answer with Yes or No</p>}
        <YesNo onAnswer={p.onAnswer} asking={p.asking} disabled={p.answerOff} />
      </div>
    </aside>
  )
}

export type CheckView = {
  guess: { text: string } | null
  at: number
  total: number
  onMouth: () => void
  onPhrase: () => void
  onCancel: () => void
}

type BoardProps = {
  phase: Phase
  voice: string
  current?: Entry
  earlier: Entry[]
  missedAt: number
  check: CheckView | null
  onAgain: (e: Entry) => void
  onWrong: (e: Entry) => void
  onRoom: () => void
}

const sizeFor = (text: string) => (text.length > 70 ? 'is-long' : text.length > 34 ? 'is-mid' : '')

function meta(e: Entry) {
  if (e.source === 'phrase') return `Phrase · ${clock(e.when)}`
  return [
    `Lip read · ${clock(e.when)}`,
    e.snapped && 'Matched to a common phrase',
    e.corrected && 'Corrected',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The room's side: what was said, large, and the two lines before it. */
export function Board({ phase, voice, current, earlier, missedAt, check, onAgain, onWrong, onRoom }: BoardProps) {
  // "couldn't read that" shows for a few seconds after an empty reading
  const [missed, setMissed] = useState(false)
  useEffect(() => {
    if (!missedAt) return
    setMissed(true)
    const id = setTimeout(() => setMissed(false), 5000)
    return () => clearTimeout(id)
  }, [missedAt])

  return (
    <section className="board" aria-label="What the patient said">
      <Band phase={phase} voice={voice}>
        {current && !check && (
          <button type="button" className="band-btn" onClick={onRoom}>
            Show to room
          </button>
        )}
      </Band>

      {check ? (
        <Check {...check} />
      ) : current ? (
        <div className="said">
          <p className={`said-text ${sizeFor(current.text)}`} aria-live="polite">
            {current.text}
          </p>
          <p className="said-meta">{meta(current)}</p>
          <div className="said-actions">
            <button type="button" className="btn btn-line" onClick={() => onAgain(current)}>
              Say it again
            </button>
            {current.source === 'read' && !current.corrected && (
              <button type="button" className="btn btn-line" onClick={() => onWrong(current)}>
                That's not it
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="said is-empty">
          <p className="said-text is-mid">{phase === 'off' ? 'Turn on the camera to start.' : 'Mouth a sentence.'}</p>
          <p className="fine">
            When you pause, it appears here and is spoken aloud in {voice}. Phrases and Yes or No work any time.
          </p>
        </div>
      )}

      {missed && !check && (
        <p className="note">
          <b aria-hidden>!</b> That reading came back empty. Try again a little slower, facing the camera.
        </p>
      )}

      {!check && earlier.length > 0 && (
        <div className="earlier">
          <p className="eyebrow">Earlier</p>
          {earlier.map((e) => (
            <p key={e.id}>
              <time>{clock(e.when)}</time>
              <span>{e.text}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

/** One guess at a time, answered on the rail's Yes and No. */
function Check({ guess, at, total, onMouth, onPhrase, onCancel }: CheckView) {
  return (
    <div className="said check">
      {guess ? (
        <>
          <p className="check-ask">Did you say</p>
          <p className={`said-text ${sizeFor(guess.text)}`} aria-live="polite">
            “{guess.text}”
          </p>
          <p className="said-meta">
            Guess {at + 1} of {total}
          </p>
          <p className="fine">Answer with Yes or No. A nod works too: staff can tap Yes for the patient.</p>
        </>
      ) : (
        <>
          <p className="said-text is-mid" aria-live="polite">
            {total ? 'That was the last guess.' : 'There is no other reading to offer.'}
          </p>
          <p className="fine">Mouth it again, or choose a phrase instead.</p>
        </>
      )}
      <div className="said-actions">
        <button type="button" className={`btn ${guess ? 'btn-line' : 'btn-primary'}`} onClick={onMouth}>
          Mouth it again
        </button>
        <button type="button" className="btn btn-line" onClick={onPhrase}>
          Choose a phrase
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** The sentence across the whole screen, for someone across the room. Tap anywhere to close. */
export function RoomView({ entry, phase, voice, onClose }: { entry?: Entry; phase: Phase; voice: string; onClose: () => void }) {
  return (
    <div className="room" role="dialog" aria-modal="true" aria-label="Shown to the room" onClick={onClose}>
      <Band phase={phase} voice={voice}>
        <button type="button" className="band-btn" onClick={onClose}>
          Close
        </button>
      </Band>
      <p className="room-text">{entry?.text ?? 'Nothing said yet.'}</p>
      {entry && <p className="said-meta">{meta(entry)}</p>}
    </div>
  )
}

/** Every phrase as a big tile, for when lip reading is too slow or the patient is tired. */
export function PhraseGrid({ onPick, onClose }: { onPick: (p: Phrase) => void; onClose: () => void }) {
  const answer = (yes: boolean) => onPick(PHRASES.find((p) => p.key === (yes ? 'yes' : 'no'))!)
  return (
    <div className="grid-view" role="dialog" aria-modal="true" aria-labelledby="grid-title">
      <header className="grid-head">
        <h2 id="grid-title">Tap to say it</h2>
        <button type="button" className="btn btn-line" onClick={onClose}>
          Back
        </button>
      </header>
      <div className="tiles">
        {PHRASES.filter((p) => p.group !== 'answers').map((p) => (
          <button key={p.key} type="button" className={`tile ${p.urgent ? 'is-urgent' : ''}`} onClick={() => onPick(p)}>
            {p.urgent ? <span className="flag">! Urgent</span> : <span className="tile-group">{p.group}</span>}
            <b>{p.label}</b>
            <small>“{p.text}”</small>
          </button>
        ))}
      </div>
      <YesNo onAnswer={answer} />
    </div>
  )
}
