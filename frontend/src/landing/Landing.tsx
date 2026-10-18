import { useCallback, useEffect, useRef, useState } from 'react'
import { MouthMark, Wordmark } from '../components/Wordmark'
import { STEPS, StepCard } from './Deck'
import { Reading } from './Reading'
import { Replay } from './Replay'
import { useCountUp, useReveal, useScrollProgress, useScrollVars, useSmoothScroll } from './motion'
import './landing.css'
import './art.css'

const REPO = 'https://github.com/minuthesecond/Claudodores---HackTN26'

// Business plan figures, with their sources
const SOURCES = [
  'American Cancer Society, Cancer Facts & Figures 2026 (estimate).',
  'Derived from ASHA incidence rates.',
  'Bartlett G. et al., “Impact of patient communication problems on the risk of preventable adverse events in acute care settings,” CMAJ 2008.',
]

// The business plan's competitive map, as two yes/no questions per option
const OPTIONS = [
  { name: 'Typing + banked voice', silent: false, theirs: true },
  { name: 'Whiteboard, letter board', silent: false, theirs: false },
  { name: 'Electrolarynx', silent: false, theirs: false },
  { name: 'Lip-reading apps', silent: true, theirs: false },
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
  useEffect(() => {
    document.title = 'Unspoken'
  }, [])

  // the bar takes the colour of whatever is passing just beneath it, with light or dark ink
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const bar = nav.current
      if (!bar) return
      const color = colorUnder(bar.offsetHeight + 1)
      bar.style.backgroundColor = color
      bar.classList.toggle('is-light', isLight(color))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="lp" ref={root}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <header className="lp-nav" ref={nav}>
        <a className="lp-brand" href="/" aria-label="Unspoken, home">
          <Wordmark />
        </a>
        <NavLinks />
        <a className="lp-btn lp-btn-card lp-nav-cta" href="/app">
          Try the live demo
          <Arrow />
        </a>
      </header>

      <main id="main">
        {/* ------------------------------------------------------------ hero */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-top">
            <div className="lp-hero-main">
              <h1 className="lp-title" aria-label="Mouth it. Hear yourself.">
                <span className="lp-line">
                  <span aria-hidden>
                    M<MouthMark className="lp-title-o" />
                    uth it.
                  </span>
                </span>
                <span className="lp-line">
                  <span aria-hidden>
                    Hear <span className="lp-under">yourself.</span>
                  </span>
                </span>
              </h1>
              <p className="lp-lede">
                Unspoken reads a patient’s lips and says the words out loud, for people who lose their voice to
                a laryngectomy, a tracheostomy or a breathing tube.
              </p>
            </div>
            <p className="lp-hero-stat">
              <strong>3×</strong>
              <span>
                the risk of preventable harm in hospital when patients can’t communicate
                <small>Bartlett et al., CMAJ 2008</small>
              </span>
            </p>
          </div>

          <div className="lp-wrap">
            <div className="lp-stack" data-scroll>
              <span className="lp-stack-card lp-stack-b" aria-hidden />
              <div className="lp-stack-top">
                <span className="lp-hole" aria-hidden />
                <Replay />
              </div>
            </div>
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
          <div className="lp-wrap">
            <figure className="lp-voice-figure">
              <blockquote className="lp-voice-quote" data-reveal>
                <p>
                  <span className="lp-qmark">“</span>We actually can communicate. We can understand each
                  other.<span className="lp-qmark">”</span>
                </p>
              </blockquote>
              <blockquote className="lp-voice-quote" data-reveal>
                <p>
                  <span className="lp-qmark">“</span>I think a lot of patients would be very heard.
                  <span className="lp-qmark">”</span>
                </p>
              </blockquote>
              <figcaption className="lp-voice-who" data-reveal>
                <strong>Celeste</strong>
                <span>Nurse, Surgical Intensive Care Unit, Vanderbilt University Medical Center</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ------------------------------------------------ the dealt deck */}
        <Story />

        {/* ------------------------------------------------------ scorecard */}
        <section className="lp-score-section lp-wrap">
          <h2 className="lp-h2" data-reveal>
            Nothing else lets them stay silent and still sound like themselves.
          </h2>
          <Scorecard />
        </section>

        {/* ---------------------------------------------------- hospitals */}
        <section className="lp-hospitals" id="hospitals">
          <div className="lp-wrap lp-hospitals-grid">
            <h2 className="lp-price">
              <span>Every patient heard.</span>
            </h2>
            <div className="lp-hospitals-side" data-reveal>
              <p>
                Hospitals already subscribe to video interpreter services. Unspoken works the same way: a
                recurring fee based on the units or beds that use it.
              </p>
              <ul className="lp-included">
                <li>The software and every update</li>
                <li>Voice setup for each new patient</li>
                <li>Bedside calibration and support</li>
              </ul>
              <p>Patients with permanent voice loss can keep using it at home after they leave.</p>
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
          <span>HackTN 2026 · The Claudodores</span>
          <span>Prototype. Not a medical device.</span>
          <a href={REPO}>Source on GitHub</a>
        </div>
        <div className="lp-foot-mark" aria-hidden>
          <Wordmark />
        </div>
      </footer>
    </div>
  )
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** The background colour showing at height y, just below the bar, along the page's left gutter. */
function colorUnder(y: number): string {
  const root = getComputedStyle(document.querySelector('.lp')!)
  // the hero paints cobalt, then gives way to paper behind the bottom of the card
  const hero = document.querySelector<HTMLElement>('.lp-hero')
  if (hero) {
    const r = hero.getBoundingClientRect()
    if (y >= r.top && y < r.bottom) {
      const paperFrom = r.bottom - 104 - parseFloat(getComputedStyle(hero).paddingBottom)
      return (y < paperFrom ? root.getPropertyValue('--cobalt') : root.getPropertyValue('--paper')).trim()
    }
  }
  // the reading scene's veil ignores the pointer, so it is checked by position
  const veil = document.querySelector<HTMLElement>('.rs:not(.is-open) .rs-top')
  if (veil) {
    const r = veil.getBoundingClientRect()
    if (y >= r.top && y < r.bottom) return getComputedStyle(veil).backgroundColor
  }
  for (let el = document.elementFromPoint(4, y); el; el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor
    if (c !== TRANSPARENT) return c
  }
  return root.getPropertyValue('--paper').trim()
}

/** Whether a colour (#rrggbb or rgb()) is light enough to need dark ink on it. */
function isLight(color: string): boolean {
  const [r, g, b] = color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : color.match(/[\d.]+/g)!.map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6
}

const SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'why', label: 'Why it matters' },
  { id: 'hospitals', label: 'For hospitals' },
]

/**
 * The section links on a pane of frosted glass. A white highlight slides to whichever
 * link is hovered or focused, and otherwise rests on the section being read.
 */
function NavLinks() {
  const links = useRef<(HTMLAnchorElement | null)[]>([])
  const [active, setActive] = useState(-1) // the section in view
  const [hover, setHover] = useState(-1) // the link under the pointer or focus
  const [box, setBox] = useState<{ x: number; w: number } | null>(null)
  const target = hover >= 0 ? hover : active

  // the section in view: of those whose top has passed the upper third of the screen, the
  // one that passed it last (the links are not in page order, so compare positions)
  useEffect(() => {
    const onScroll = () => {
      let next = -1
      let best = -Infinity
      SECTIONS.forEach((s, i) => {
        const top = document.getElementById(s.id)?.getBoundingClientRect().top
        if (top !== undefined && top < innerHeight * 0.35 && top > best) {
          best = top
          next = i
        }
      })
      setActive((a) => (a === next ? a : next))
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])

  // move the highlight under the target link
  useEffect(() => {
    const el = links.current[target]
    const measure = () => setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null)
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [target])

  return (
    <nav className="lp-links" aria-label="Sections" onMouseLeave={() => setHover(-1)}>
      <span
        className={`lp-links-glow ${box ? 'is-on' : ''}`}
        style={box ? { translate: `${box.x}px 0`, width: box.w } : undefined}
        aria-hidden
      />
      {SECTIONS.map((s, i) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          ref={(el) => {
            links.current[i] = el
          }}
          className={i === target ? 'is-lit' : ''}
          aria-current={i === active ? 'location' : undefined}
          onMouseEnter={() => setHover(i)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(-1)}
        >
          {s.label}
        </a>
      ))}
    </nav>
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
            Their voice lives in the videos you already have.
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

/** A hand-drawn tick or cross for the scorecard. */
function Mark({ yes }: { yes: boolean }) {
  return (
    <svg className={`lp-mark ${yes ? 'is-yes' : 'is-no'}`} viewBox="0 0 40 40" role="img" aria-label={yes ? 'Yes' : 'No'}>
      {yes ? <path d="M7 21 C 11 24, 14 28, 17 32 C 22 22, 28 13, 35 7" /> : <path d="M9 9 C 17 17, 24 24, 31 32 M31 9 C 24 16, 16 24, 9 32" />}
    </svg>
  )
}

/** The competition in two questions: is it silent, and does it sound like them? */
function Scorecard() {
  return (
    // laid out as a grid, so the table roles are spelled out to keep it a table for screen readers
    <table className="lp-score" role="table" data-reveal>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">
            <span className="lp-visually-hidden">Option</span>
          </th>
          <th scope="col" role="columnheader">
            Silent, no typing
          </th>
          <th scope="col" role="columnheader">
            Sounds like them
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {OPTIONS.map((o) => (
          <tr key={o.name} role="row">
            <th scope="row" role="rowheader">
              {o.name}
            </th>
            <td role="cell">
              <Mark yes={o.silent} />
            </td>
            <td role="cell">
              <Mark yes={o.theirs} />
            </td>
          </tr>
        ))}
        <tr className="is-us" role="row">
          <th scope="row" role="rowheader">
            <Wordmark />
          </th>
          <td role="cell">
            <Mark yes />
          </td>
          <td role="cell">
            <Mark yes />
          </td>
        </tr>
      </tbody>
    </table>
  )
}
