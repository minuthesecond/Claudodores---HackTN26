import { useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Icons'
import { Phone, type Screen } from './Phone'
import { Replay } from './Replay'
import { useSmoothParallax } from './motion'
import './landing.css'

const REPO = 'https://github.com/minuthesecond/Claudodores---HackTN26'

const STEPS: { screen: Screen; n: string; title: string; line: string }[] = [
  { screen: 'bank', n: '01', title: 'Bank', line: 'Fifteen minutes on camera before surgery.' },
  { screen: 'train', n: '02', title: 'Train', line: 'A clone of your voice. A model of your lips.' },
  { screen: 'speak', n: '03', title: 'Speak', line: 'Mouth it, tap the right guess, hear yourself.' },
]

// Business plan figures, with their sources
const STATS = [
  { value: '12,290', label: 'Americans diagnosed with laryngeal cancer each year', source: 'American Cancer Society, 2026 est.' },
  { value: '75–100K', label: 'Adults who get a tracheostomy each year', source: 'From ASHA incidence rates' },
  { value: '3×', label: 'Preventable adverse events when patients can’t communicate', source: 'Bartlett et al., CMAJ 2008' },
]

const FILM_ROWS = [0, 2, 4] // sprite rows used in the film strip

export function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useSmoothParallax(root)

  useEffect(() => {
    document.title = 'UNSPOKEN — Speak again, in your own voice'
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
          <a href="#why">Why</a>
          <a href="#hospitals">Hospitals</a>
        </nav>
        <a className="lp-btn lp-btn-solid lp-nav-cta" href="/app">
          Try the demo
        </a>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="lp-hero lp-wrap">
        <div className="lp-hero-copy">
          <h1 className="lp-title">
            <span className="lp-line" data-x="-0.12">
              Mouth it.
            </span>
            <span className="lp-line" data-x="0.08">
              Hear
            </span>
            <span className="lp-line" data-x="-0.05">
              <em>yourself.</em>
            </span>
          </h1>
          <p className="lp-lede">For people who lose their voice. Speak again, in your own.</p>
          <div className="lp-actions">
            <a className="lp-btn lp-btn-solid" href="/app">
              Try the demo
            </a>
            <a className="lp-btn" href="#how">
              How it works
            </a>
          </div>
        </div>
        <div className="lp-hero-phone" data-y="-0.12">
          <Phone screen="speak" />
        </div>
      </section>

      {/* ------------------------------------------------------ film strip */}
      <section className="lp-film" aria-label="Lip outlines tracked from a real clip">
        {FILM_ROWS.map((row, i) => (
          <div
            key={row}
            className="lp-film-row"
            data-bg={i % 2 ? 0.35 : -0.35}
            style={{ backgroundPositionY: `${(row / 5) * 100}%` }}
          />
        ))}
        <p className="lp-caption lp-wrap">Lip landmarks from a real clip · 25 frames a second</p>
      </section>

      {/* --------------------------------------------------------- problem */}
      <section className="lp-why lp-wrap" id="why">
        <h2 className="lp-big" data-x="-0.04">
          Losing your voice
          <br />
          shouldn’t mean <em>losing a say.</em>
        </h2>
        <div className="lp-stats">
          {STATS.map((s, i) => (
            <figure key={s.value} className="lp-stat" data-y={0.04 + i * 0.04}>
              <span className="lp-stat-value">{s.value}</span>
              <figcaption>
                <span>{s.label}</span>
                <small>{s.source}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- pinned story */}
      <Story />

      {/* ---------------------------------------------------------- map */}
      <section className="lp-map-section lp-wrap">
        <h2 className="lp-map-title">
          <span className="lp-line">Silent.</span>
          <span className="lp-line">Sounds like</span>
          <span className="lp-line">
            <em>you.</em>
          </span>
        </h2>
        <CompetitiveMap />
      </section>

      {/* -------------------------------------------------------- proof */}
      <section className="lp-proof lp-wrap">
        <div className="lp-proof-head">
          <span className="lp-tag">Working prototype</span>
          <h2>It already reads lips.</h2>
        </div>
        <div data-y="-0.06">
          <Replay />
        </div>
      </section>

      {/* ---------------------------------------------------- hospitals */}
      <section className="lp-hospitals" id="hospitals">
        <div className="lp-wrap lp-hospitals-grid" data-y="-0.25">
          <h2>
            <span className="lp-line" data-x="0.1">
              $400 a patient.
            </span>
            <span className="lp-line" data-x="-0.08">
              <em>Patients pay nothing.</em>
            </span>
          </h2>
          <div className="lp-hospitals-side">
            <p>Licensed to cancer centers and hospitals. Fits the speech therapy visit that already happens before surgery.</p>
            <a className="lp-btn lp-btn-accent" href="/app">
              Try the demo
            </a>
          </div>
        </div>
      </section>

      <footer className="lp-foot lp-wrap">
        <span>Unspoken · HackTN 2026 · The Claudodores</span>
        <span>Prototype. Not a medical device.</span>
        <a href={REPO}>Source</a>
      </footer>
    </div>
  )
}

/** Bank → Train → Speak, with the phone pinned while the steps scroll past. */
function Story() {
  const ref = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const progress = (innerHeight / 2 - r.top) / r.height
      const next = Math.max(0, Math.min(STEPS.length - 1, Math.floor(progress * STEPS.length)))
      setStep((s) => (s === next ? s : next))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section className="lp-story" id="how" ref={ref}>
      <div className="lp-story-pin lp-wrap">
        <ol className="lp-story-steps">
          {STEPS.map((s, i) => (
            <li key={s.n} className={i === step ? 'is-active' : ''}>
              <span className="lp-story-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.line}</p>
              <div className="lp-story-phone-sm">
                <Phone screen={s.screen} />
              </div>
            </li>
          ))}
        </ol>
        <div className="lp-story-phone">
          <Phone screen={STEPS[step].screen} />
          <div className="lp-story-dots">
            {STEPS.map((s, i) => (
              <i key={s.n} className={i === step ? 'is-active' : ''} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** The business plan's competitive map: effort to communicate vs. sounds like the patient. */
function CompetitiveMap() {
  const dots = [
    { x: 0.1, y: 0.74, label: 'Typing + banked voice' },
    { x: 0.1, y: 0.26, label: 'Whiteboard, letter board' },
    { x: 0.66, y: 0.38, label: 'Electrolarynx' },
    { x: 0.84, y: 0.2, label: 'Lip-reading apps' },
  ]
  return (
    <figure className="lp-map">
      <span className="lp-map-axis">↑ Sounds like you</span>
      <div className="lp-map-plot">
        <span className="lp-map-q" />
        {dots.map((d) => (
          <span
            key={d.label}
            className={`lp-map-dot ${d.x > 0.6 ? 'is-left' : ''}`}
            style={{ left: `${d.x * 100}%`, bottom: `${d.y * 100}%` }}
          >
            <i />
            {d.label}
          </span>
        ))}
        <span className="lp-map-dot is-us" style={{ left: '80%', bottom: '76%' }}>
          <i />
          Unspoken
        </span>
      </div>
      <figcaption>
        <span>Effort to communicate</span>
        <span>Silent, no typing →</span>
      </figcaption>
    </figure>
  )
}
