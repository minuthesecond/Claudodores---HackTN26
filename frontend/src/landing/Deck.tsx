import type { CSSProperties } from 'react'
import { MouthDrawing } from './glyph'

/**
 * The phone app from the business plan, drawn as articulation cards:
 * collect videos of the patient talking, learn their voice and lips,
 * then mouth a phrase and hear it in their own voice.
 */

/** Animated voice level bars. */
export function Wave({ bars = 28, live = true }: { bars?: number; live?: boolean }) {
  return (
    <span className={`wave ${live ? 'is-live' : ''}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <i
          key={i}
          style={{
            animationDelay: `${(-((i * 137) % 900) / 1000).toFixed(2)}s`,
            height: `${28 + ((i * 53) % 72)}%`,
          }}
        />
      ))}
    </span>
  )
}

export type Step = 'bank' | 'train' | 'speak'

export const STEPS: { id: Step; when: string; title: string; line: string }[] = [
  {
    id: 'bank',
    when: 'Any time',
    title: 'Collect',
    line: 'Family send in videos of the patient talking: birthdays, holidays, old phone clips. Before a planned surgery, the patient can record their own.',
  },
  {
    id: 'train',
    when: 'Behind the scenes',
    title: 'Learn',
    line: 'Unspoken learns their voice from those videos, and a short calibration at the bedside tunes the lip reader to how they move their lips.',
  },
  {
    id: 'speak',
    when: 'At the bedside',
    title: 'Speak',
    line: 'They mouth a sentence to a phone or the room’s camera. It appears as text, and the room hears it in their own voice.',
  },
]

export function StepCard({ step, style }: { step: Step; style?: CSSProperties }) {
  const meta = STEPS.find((s) => s.id === step)!
  return (
    <article className={`dk dk-${step}`} style={style} aria-hidden>
      <header className="dk-band">
        <span className="dk-hole" />
        <span>{meta.title}</span>
        <span className="dk-when">{meta.when}</span>
      </header>
      <div className="dk-body">{step === 'bank' ? <Bank /> : step === 'train' ? <Train /> : <Speak />}</div>
    </article>
  )
}

// sample clips a family might send in
const CLIPS = [
  { title: 'Birthday toast', from: 'From their daughter', length: '0:48', state: 'Learning' },
  { title: 'Thanksgiving 2024', from: 'From their son', length: '2:10', state: 'Added' },
  { title: 'Voicemail to Mom', from: 'From the patient', length: '0:22', state: 'Added' },
]

function Bank() {
  return (
    <>
      <span className="dk-label">Videos of them talking</span>
      <ul className="dk-clips">
        {CLIPS.map((c, i) => (
          <li key={c.title} style={{ ['--i' as string]: i }}>
            <span className="dk-thumb">
              <MouthDrawing live={i === 0} jaw={0.12} />
              <small>{c.length}</small>
            </span>
            <span className="dk-clip-text">
              <strong>{c.title}</strong>
              <span>{c.from}</span>
            </span>
            <span className={`dk-clip-state ${i === 0 ? 'is-live' : ''}`}>{c.state}</span>
          </li>
        ))}
      </ul>
      <Wave bars={30} />
      <div className="dk-meter">
        <span>3 videos · 3 minutes of their voice</span>
        <span className="dk-bar">
          <i className="is-filling" style={{ width: '64%' }} />
        </span>
      </div>
    </>
  )
}

// frames 32–43 of the real clip: the jaw opening and closing on "hi my name"
const TILE_JAW = [0.03, 0.15, 0.28, 0.38, 0.4, 0.28, 0.12, 0.04, 0.04, 0.05, 0.14, 0.14]

function Train() {
  return (
    <>
      <div className="dk-row">
        <span className="dk-label">Their voice</span>
        <span className="dk-ok">Ready</span>
      </div>
      <Wave bars={30} live={false} />
      <div className="dk-row dk-gap">
        <span className="dk-label">Their lips</span>
        <span className="dk-num">72%</span>
      </div>
      <div className="dk-tiles">
        {TILE_JAW.map((j, i) => (
          <span key={i} className="dk-tile" style={{ ['--i' as string]: i }}>
            <MouthDrawing jaw={j} />
          </span>
        ))}
      </div>
      <span className="dk-bar">
        <i className="is-filling" style={{ width: '72%' }} />
      </span>
    </>
  )
}

function Speak() {
  return (
    <>
      <div className="dk-view dk-view-sm">
        <MouthDrawing live className="dk-mouth" />
      </div>
      <span className="dk-label">Did you mean</span>
      <ol className="dk-guesses">
        <li className="is-picked">I need water</li>
        <li>I need a walk</li>
        <li>I’m not worried</li>
      </ol>
      <div className="dk-playing">
        <Wave bars={22} />
        <span>In their voice</span>
      </div>
    </>
  )
}
