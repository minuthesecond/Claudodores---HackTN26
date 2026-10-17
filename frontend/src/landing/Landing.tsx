import { useEffect, useRef } from 'react'
import { Logo } from '../components/Icons'
import { Replay } from './Replay'
import { useSmoothParallax } from './motion'
import './landing.css'

const REPO = 'https://github.com/minuthesecond/Claudodores---HackTN26'

const STEPS = [
  {
    n: '01',
    title: 'Camera',
    body: 'Any webcam. In Chrome, frames come straight off the camera track, so the model gets every one.',
    spec: '30 fps · 960 px · no microphone',
  },
  {
    n: '02',
    title: 'Face',
    body: 'MediaPipe Face Landmarker finds 478 points on the face and measures how far the jaw is open.',
    spec: '478 landmarks · jawOpen blendshape',
  },
  {
    n: '03',
    title: 'Phrase',
    body: 'A phrase starts when the jaw opens and ends after a second of stillness. No button to hold.',
    spec: 'start > 0.10 · pause < 0.04 for 1.0 s',
  },
  {
    n: '04',
    title: 'Mouth',
    body: 'Each frame is aligned on the eyes, nose and mouth, then cropped to the lips in grayscale.',
    spec: '96 × 96 px · resampled to 25 fps',
  },
  {
    n: '05',
    title: 'Model',
    body: 'A visual speech model reads the crop sequence; a language model picks the likeliest sentence.',
    spec: 'Auto-AVSR · LM weight 0.3 · beam 40',
  },
]

const SPECS: [string, string][] = [
  ['Model', 'Auto-AVSR, visual only — LRS3_V_WER19.1 (Ma et al., Imperial College London)'],
  ['Benchmark', '19.1% word error rate on LRS3, as published. Not a measure of this setup.'],
  ['Face tracking', 'MediaPipe Face Landmarker, 478 landmarks + blendshapes'],
  ['Input', '30 fps camera, resampled to 25 fps; 96 × 96 grayscale mouth crop'],
  ['Live text', 'Updates while the mouth is moving, about once a second'],
  ['Final text', '≈1.5 s after the pause, on an Apple M5 Pro CPU'],
  ['Vocabulary', 'Open. English.'],
  ['Audio', 'None. The microphone is never requested.'],
  ['Video', 'Streams to your own server for decoding. Nothing is stored.'],
]

const LIMITS = [
  ['Lookalike words', 'Some words look the same on the lips. In our tests it sometimes read “Justin” as “Jason.”'],
  ['Light', 'Webcams slow down in dim rooms and accuracy goes with them. The reader shows the live frame rate.'],
  ['One phrase at a time', 'Leave a short pause between sentences.'],
  ['Talking heads', 'Trained on TED talks and YouTube interviews: front-facing, well lit. Profiles and covered mouths fail.'],
  ['Not a medical device', 'A hackathon prototype. The model is licensed for research and non-commercial use.'],
]

const SHEET_ROWS = 6 // the sprite is 13 × 6 mouth crops

export function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useSmoothParallax(root)

  useEffect(() => {
    document.title = 'UNSPOKEN — Lip reading from any webcam'
  }, [])

  return (
    <div className="lp" ref={root}>
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <Logo />
          <span>Unspoken</span>
        </a>
        <nav className="lp-links">
          <a href="#how">How it works</a>
          <a href="#specs">Specs</a>
          <a href="#limits">Limits</a>
          <a href={REPO}>Source</a>
        </nav>
        <a className="lp-btn lp-btn-solid lp-nav-cta" href="/app">
          Open the reader
        </a>
      </header>

      <section className="lp-hero lp-wrap">
        <p className="lp-kicker">
          <span>Visual speech recognition</span>
          <span>HackTN 2026</span>
        </p>
        <h1 className="lp-title">
          <span className="lp-line" data-x="-0.32">
            Speech without
          </span>
          <span className="lp-line" data-x="0.22">
            the <em>sound.</em>
          </span>
        </h1>
        <div className="lp-hero-grid">
          <div className="lp-hero-copy" data-y="0.1">
            <p className="lp-lede">
              Unspoken reads lips from an ordinary webcam and writes down what someone is saying, as they say it.
            </p>
            <p className="lp-sub">Built for people who can mouth words but can’t voice them.</p>
            <div className="lp-actions">
              <a className="lp-btn lp-btn-solid" href="/app">
                Open the reader
              </a>
              <a className="lp-btn" href="#how">
                How it works
              </a>
            </div>
          </div>
          <div data-y="-0.08">
            <Replay />
          </div>
        </div>
      </section>

      <section className="lp-strip">
        <div className="lp-wrap lp-strip-grid">
          <Fact value="30" unit="fps" label="Camera frames to the model" />
          <Fact value="96" unit="px" label="Square mouth crop it reads" />
          <Fact value="1.5" unit="s" label="From pause to final text" />
          <Fact value="0" unit="mic" label="Audio recorded, ever" />
        </div>
      </section>

      <section className="lp-band" aria-label="What isn’t said still gets read">
        <div className="lp-band-row" data-x="-0.45" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i}>What isn’t said</span>
          ))}
        </div>
        <div className="lp-band-row lp-band-accent" data-x="0.45" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i}>Still gets read</span>
          ))}
        </div>
      </section>

      <section className="lp-section lp-wrap" id="why">
        <SectionLabel n="01" title="Why" />
        <div className="lp-why">
          <p className="lp-statement">
            A ventilator takes the voice.
            <br />
            It doesn’t take the <em>words.</em>
          </p>
          <div className="lp-why-body" data-y="-0.06">
            <p>
              Patients who are intubated or have a tracheostomy often still mouth what they want to say. Reading
              lips by eye is slow and unreliable, and spelling on a letter board is slower.
            </p>
            <p>Unspoken puts their words on a screen next to the bed while they’re still saying them.</p>
          </div>
        </div>
      </section>

      <section className="lp-section lp-wrap" id="how">
        <SectionLabel n="02" title="How it works" />
        <div className="lp-how">
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="lp-step">
                <span className="lp-step-n">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <span className="lp-step-spec">{s.spec}</span>
                </div>
              </li>
            ))}
          </ol>
          <figure className="lp-sheet">
            <div className="lp-sheet-img" role="img" aria-label="78 grayscale mouth crops in a grid">
              {Array.from({ length: SHEET_ROWS }, (_, i) => (
                // rows slide in alternating directions as you scroll, like film strips
                <div
                  key={i}
                  className="lp-sheet-row"
                  data-bg={i % 2 ? 0.16 : -0.16}
                  style={{ backgroundPositionY: `${(i / (SHEET_ROWS - 1)) * 100}%` }}
                />
              ))}
            </div>
            <figcaption>
              <span>Every frame the model saw</span>
              <span>“Hi my name is Justin” · 78 frames · 3.1 s</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-section lp-wrap" id="specs">
        <SectionLabel n="03" title="Specs" />
        <dl className="lp-specs">
          {SPECS.map(([k, v]) => (
            <div key={k} className="lp-spec">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="lp-section lp-wrap" id="limits">
        <SectionLabel n="04" title="What it gets wrong" />
        <ol className="lp-limits">
          {LIMITS.map(([k, v], i) => (
            <li key={k}>
              <span className="lp-limit-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{k}</h3>
              <p>{v}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-end">
        <div className="lp-wrap lp-end-grid" data-y="-0.35">
          <h2>
            <span className="lp-line" data-x="0.18">
              Try it on
            </span>
            <span className="lp-line" data-x="-0.12">
              your own <em>face.</em>
            </span>
          </h2>
          <div className="lp-end-side">
            <a className="lp-btn lp-btn-accent" href="/app">
              Open the reader
            </a>
            <p>
              Needs the lip-reading server running: <code>./setup.sh</code> once, then <code>./run.sh</code>.
            </p>
          </div>
        </div>
      </section>

      <footer className="lp-foot lp-wrap">
        <span>Unspoken · Built at HackTN 2026 by the Claudodores</span>
        <span>
          Model: Auto-AVSR, Ma et al., Imperial College London ·{' '}
          <a href={REPO}>Source on GitHub</a>
        </span>
      </footer>
    </div>
  )
}

function SectionLabel({ n, title }: { n: string; title: string }) {
  return (
    <header className="lp-label">
      <span className="lp-label-n">{n}</span>
      <h2>{title}</h2>
    </header>
  )
}

function Fact({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="lp-fact">
      <span className="lp-fact-value">
        {value}
        <small>{unit}</small>
      </span>
      <span className="lp-fact-label">{label}</span>
    </div>
  )
}
