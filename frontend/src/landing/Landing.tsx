import { useCallback, useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Icons'
import { STEPS, StepCard } from './Deck'
import { MouthGlyph } from './glyph'
import { Reading } from './Reading'
import { Replay } from './Replay'
import { useCountUp, useReveal, useScrollProgress, useScrollVars, useSmoothScroll } from './motion'
import './landing.css'

const REPO = 'https://github.com/minuthesecond/Claudodores---HackTN26'

// Business plan figures, with their sources
const SOURCES = [
  'American Cancer Society, Cancer Facts & Figures 2026 (estimate).',
  'Derived from ASHA incidence rates.',
  'Bartlett G. et al., “Impact of patient communication problems on the risk of preventable adverse events in acute care settings,” CMAJ 2008.',
]

// The business plan's competitive map: x = silent, no typing; y = sounds like the patient
const OPTIONS = [
  { x: 0.12, y: 0.68, name: 'Typing + banked voice', trade: 'Sounds like them, but every sentence is typed.' },
  { x: 0.16, y: 0.26, name: 'Whiteboard, letter board', trade: 'Slow, and no voice at all.' },
  { x: 0.62, y: 0.44, name: 'Electrolarynx', trade: 'Fast, held to the throat, robotic.' },
  { x: 0.86, y: 0.08, name: 'Lip-reading apps', trade: 'Silent, but a stranger’s voice.' },
]

function Arrow() {
  return (
    <svg className="lp-arrow" viewBox="0 0 20 20" aria-hidden>
      <path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}

/** A figure that counts up from zero when it scrolls into view. */
function Count({ to }: { to: number }) {
  const ref = useCountUp<HTMLSpanElement>(to)
  return <span ref={ref}>{to.toLocaleString('en-US')}</span>
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useSmoothScroll()
  useReveal(root)
  useScrollVars(root)
  const heroCta = useRef<HTMLAnchorElement>(null)
  const [ctaInView, setCtaInView] = useState(true)

  // one "Try the live demo" at a time: the nav's appears once the hero's scrolls away
  useEffect(() => {
    const el = heroCta.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCtaInView(e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    document.title = 'Unspoken — Speak again, in your own voice'
  }, [])

  return (
    <div className="lp" ref={root}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <header className="lp-nav">
        <a className="lp-brand" href="/" aria-label="Unspoken, home">
          <Logo size={26} />
          <span>Unspoken</span>
        </a>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#why">Why it matters</a>
          <a href="#hospitals">For hospitals</a>
        </nav>
        <a
          className={`lp-btn lp-btn-card lp-nav-cta ${ctaInView ? 'is-hidden' : ''}`}
          href="/app"
          tabIndex={ctaInView ? -1 : undefined}
          aria-hidden={ctaInView || undefined}
        >
          Try the live demo
          <Arrow />
        </a>
      </header>

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-top">
            <h1 className="lp-title">
              <span className="lp-line">
                <span>Mouth it.</span>
              </span>
              <span className="lp-line">
                <span>
                  Hear <span className="lp-under">yourself.</span>
                </span>
              </span>
            </h1>
            <div className="lp-hero-aside lp-intro">
              <p className="lp-lede">
                Unspoken reads a patient’s lips and speaks for them in their own voice, for people who lose
                it to a laryngectomy or tracheostomy.
              </p>
              <a className="lp-btn lp-btn-card" href="/app" ref={heroCta}>
                Try the live demo
                <Arrow />
              </a>
            </div>
          </div>

          <div className="lp-wrap">
            <div className="lp-stack" data-scroll>
              <span className="lp-stack-card lp-stack-a" aria-hidden />
              <span className="lp-stack-card lp-stack-b" aria-hidden />
              <div className="lp-stack-top">
                <span className="lp-hole" aria-hidden />
                <Replay />
              </div>
            </div>
            <p className="lp-note" data-reveal>
              A real three-second clip, read by the working prototype. The model sees only the mouth.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- problem */}
        <Reading>
          <section className="lp-why lp-wrap" id="why">
            <h2 className="lp-h2" data-reveal>
              <span className="lp-nowrap">Losing your voice</span> shouldn’t mean{' '}
              <span className="lp-under">losing a say.</span>
            </h2>
            <div className="lp-why-body" data-reveal>
              <p className="lp-claim">
                Every year{' '}
                <strong>
                  <Count to={12290} />
                </strong>
                <sup>1</sup> Americans are diagnosed with laryngeal cancer, and{' '}
                <strong>
                  <Count to={75} />–<Count to={100} />K
                </strong>
                <sup>2</sup> adults get a tracheostomy. Patients who can’t communicate are <strong>three times</strong>
                <sup>3</sup> as likely to suffer a preventable adverse event in hospital.
              </p>
              <ol className="lp-sources">
                {SOURCES.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          </section>
        </Reading>

        {/* ------------------------------------------------- from the floor */}
        <section className="lp-voice">
          <figure className="lp-wrap lp-voice-grid">
            <MouthGlyph live className="lp-voice-glyph" />
            <div>
              <blockquote className="lp-voice-quote" data-reveal>
                <p>
                  “I think it would be nice for them to see, oh, we actually can communicate, we can understand
                  each other. It’s not this back and forth of interpreting what they’re saying.”
                </p>
              </blockquote>
              <figcaption className="lp-voice-who" data-reveal>
                <strong>Celeste</strong>
                <span>Nurse, Surgical Intensive Care Unit, Vanderbilt University Medical Center</span>
              </figcaption>
            </div>
          </figure>
        </section>

        {/* ------------------------------------------------ the dealt deck */}
        <Story />

        {/* ---------------------------------------------------------- map */}
        <section className="lp-map-section lp-wrap">
          <h2 className="lp-h2 lp-map-title" data-reveal>The only option that’s silent and still sounds like them.</h2>
          <div className="lp-map-grid">
            <CompetitiveMap />
            <ul className="lp-options" data-reveal>
              {OPTIONS.map((o, i) => (
                <li key={o.name} style={{ ['--i' as string]: i }}>
                  <strong>{o.name}</strong>
                  <span>{o.trade}</span>
                </li>
              ))}
              <li className="is-us" style={{ ['--i' as string]: OPTIONS.length }}>
                <strong>Unspoken</strong>
                <span>Mouth it, confirm it, heard in their own voice.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------- hospitals */}
        <section className="lp-hospitals" id="hospitals" data-scroll>
          <div className="lp-wrap lp-hospitals-grid">
            <h2 className="lp-price">
              <span>$400 a patient.</span>
              <span>Patients pay nothing.</span>
            </h2>
            <div className="lp-hospitals-side" data-reveal>
              <p>
                Licensed to cancer centers and hospitals. Banking fits the speech therapy visit that already
                happens before surgery, so there is no new appointment to schedule.
              </p>
              <div className="lp-actions">
                <a className="lp-btn lp-btn-ink" href="/app">
                  Try the live demo
                  <Arrow />
                </a>
                <a className="lp-btn lp-btn-line" href={REPO}>
                  Read the source
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-row">
          <span className="lp-brand lp-brand-sm">
            <Logo size={20} />
            <span>Unspoken</span>
          </span>
          <span>HackTN 2026 · The Claudodores</span>
          <span>Prototype. Not a medical device.</span>
          <a href={REPO}>Source on GitHub</a>
        </div>
      </footer>
    </div>
  )
}

/** Bank → Train → Speak: the deck sits pinned while each card is dealt off as you scroll. */
function Story() {
  const ref = useRef<HTMLElement>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1

  const onProgress = useCallback(
    (p: number) => {
      const t = p * last
      cards.current.forEach((el, i) => {
        if (!el) return
        const local = t - i // >0: being dealt off; <0: waiting in the stack
        el.style.setProperty('--off', Math.min(1, Math.max(0, local)).toFixed(4))
        el.style.setProperty('--depth', Math.max(0, -local).toFixed(4))
      })
      const next = Math.min(last, Math.round(t))
      setStep((s) => (s === next ? s : next))
    },
    [last],
  )
  useScrollProgress(ref, onProgress)

  return (
    <section className="lp-story" id="how" ref={ref}>
      <div className="lp-story-pin lp-wrap">
        <div className="lp-story-copy">
          <h2 className="lp-h2" data-reveal>
            Fifteen minutes before surgery. Their own voice after.
          </h2>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i === step ? 'is-active' : ''}>
                <span className="lp-step-when">{s.when}</span>
                <h3>{s.title}</h3>
                <p>{s.line}</p>
                <div className="lp-step-card">
                  <StepCard step={s.id} />
                </div>
              </li>
            ))}
          </ol>
          <p className="lp-story-note">
            The phone app is in design. The lip reader at the top of this page runs today.
          </p>
        </div>
        <div className="lp-deck" aria-hidden>
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className="lp-deck-slot"
              ref={(el) => {
                cards.current[i] = el
              }}
              style={{ zIndex: STEPS.length - i, ['--depth' as string]: i, ['--off' as string]: 0 }}
            >
              <StepCard step={s.id} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** The business plan's competitive map, plotted on a card. */
function CompetitiveMap() {
  return (
    <figure className="lp-map" data-reveal aria-label="Communication options plotted by how silent they are and how much they sound like the patient">
      <span className="lp-hole" aria-hidden />
      <div className="lp-map-plot">
        <span className="lp-map-q" aria-hidden />
        <span className="lp-map-y">Sounds like them</span>
        <span className="lp-map-x">Silent, no typing</span>
        {OPTIONS.map((d, i) => (
          <span
            key={d.name}
            className={`lp-map-dot ${d.x > 0.55 ? 'is-left' : ''}`}
            style={{ left: `${d.x * 100}%`, bottom: `${d.y * 100}%`, ['--i' as string]: i }}
          >
            <i />
            {d.name}
          </span>
        ))}
        <span className="lp-map-us" style={{ left: '84%', bottom: '84%' }}>
          <MouthGlyph jaw={0.18} />
          Unspoken
        </span>
      </div>
    </figure>
  )
}
