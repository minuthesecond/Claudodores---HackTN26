import type { CSSProperties } from 'react'
import { MouthDrawing } from './glyph'

/**
 * The phone app from the business plan, drawn as articulation cards:
 * bank your voice and lips before surgery, train, then mouth a phrase,
 * pick the right guess and hear it in your own voice.
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
    when: 'Before surgery',
    title: 'Bank',
    line: 'About fifteen minutes on camera, reading sentences aloud, during the speech therapy visit that already happens.',
  },
  {
    id: 'train',
    when: 'Behind the scenes',
    title: 'Train',
    line: 'Those recordings become a clone of the patient’s voice and a model of their lips. Nobody else’s.',
  },
  {
    id: 'speak',
    when: 'After surgery',
    title: 'Speak',
    line: 'They mouth a phrase, tap the right guess, and the room hears it in their own voice.',
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

function Bank() {
  return (
    <>
      <div className="dk-view">
        <span className="dk-rec">
          <i /> Recording
        </span>
        <MouthDrawing live className="dk-mouth" />
      </div>
      <span className="dk-label">Read aloud</span>
      <p className="dk-prompt">The boat sailed across the bay before dawn.</p>
      <Wave bars={30} />
      <div className="dk-meter">
        <span>Sentence 23 of 40</span>
        <span className="dk-bar">
          <i style={{ width: '57%' }} />
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
          <span key={i} className="dk-tile">
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
