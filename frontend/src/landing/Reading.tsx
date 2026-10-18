import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MouthMark } from '../components/Wordmark'
import './reading.css'

/**
 * "One silent sentence, read and spoken": a pinned scene after the hero. Two bars are the lips,
 * moving on the real jawOpen trace from talking.MOV as you scroll, while the mark rolls and
 * "Want to learn more?" builds word by word; then the lips open all the way and the halves part
 * to reveal the section underneath, which waits (sticky) the whole time.
 */

type Replay = { jaw: number[]; cols: number; size: number; fps: number; frames: number; final: string }

const FIRST = 26 // the clip's frames that hold the phrase
const LAST = 62
const READ_START = 0.06 // scroll progress: watching, then reading…
const READ_END = 0.52
const SPEAK_END = 0.66 // …speaking…
const SCROLL_VH = 2 // …and opening, over this many screens of scroll
const NAV = 72 // the stage is held just under the nav
const SAID = 'Want to learn more?' // what the lips spell out as you scroll

const ROLL = 720 // degrees the mark rolls through over the whole scene

// jaw graph geometry
const GW = 600
const GH = 120
const JAW_MAX = 0.45

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function Reading({ children }: { children: ReactNode }) {
  const [skip] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const wrap = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bot = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLSpanElement | null)[]>([])
  const mouth = useRef<HTMLElement>(null)
  const state = useRef<HTMLSpanElement>(null)
  const clock = useRef<HTMLSpanElement>(null)
  const head = useRef<SVGLineElement>(null)
  const trace = useRef<SVGPolylineElement>(null)
  const jawValue = useRef<HTMLSpanElement>(null)
  const [data, setData] = useState<Replay | null>(null)

  useEffect(() => {
    if (skip) return
    fetch('/landing/replay.json')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
  }, [skip])

  useEffect(() => {
    if (skip) return
    const jaw = data?.jaw ?? []
    const n = SAID.split(' ').length
    let raf = 0
    let lastFrame = -1
    let last = -1

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = wrap.current
      if (!el) return
      const vh = innerHeight
      const p = clamp((NAV - el.getBoundingClientRect().top) / (vh * SCROLL_VH))
      if (Math.abs(p - last) < 0.0002 && lastFrame >= 0) return
      last = p

      // reading: scroll scrubs through the clip's frames
      const r = clamp((p - READ_START) / (READ_END - READ_START))
      const f = FIRST + r * (LAST - FIRST)
      const i = Math.floor(f)
      const j = jaw.length ? jaw[i] + (jaw[Math.min(i + 1, jaw.length - 1)] - jaw[i]) * (f - i) : 0
      const talk = Math.min(j, JAW_MAX) * vh * 0.34

      // opening: the two halves part and leave the screen
      const o = easeInOut(clamp((p - SPEAK_END) / (1 - SPEAK_END)))
      const gap = talk + o * vh * 1.08
      top.current!.style.transform = `translate3d(0, ${-gap / 2}px, 0)`
      bot.current!.style.transform = `translate3d(0, ${gap / 2}px, 0)`
      el.classList.toggle('is-open', p >= 0.999)
      el.style.setProperty('--fade', String(1 - clamp(o * 2.5)))

      // the mark rolls along as you scroll, like a wheel
      mouth.current?.style.setProperty('--roll', `${(p * ROLL).toFixed(1)}deg`)
      const u = clamp((r - 0.25) / 0.7) * n
      const shown = Math.round(u)
      words.current.forEach((w, m) => w?.classList.toggle('is-on', m < shown))

      const label = p >= READ_END ? 'Speaking' : r >= 1 ? 'Decoded' : r > 0 ? 'Reading lips' : 'Watching'
      if (state.current && state.current.textContent !== label) {
        state.current.textContent = label
        state.current.dataset.state = label
      }

      // frame clock, jaw graph playhead and value
      if (data) {
        const fps = data.fps
        if (clock.current) clock.current.textContent = `Frame ${i + 1} of ${data.frames} · ${(i / fps).toFixed(2)} s`
        const x = (i / (data.frames - 1)) * GW
        head.current?.setAttribute('x1', x.toFixed(1))
        head.current?.setAttribute('x2', x.toFixed(1))
        trace.current?.style.setProperty('--drawn', (i / (data.frames - 1)).toFixed(4))
        if (jawValue.current) jawValue.current.textContent = j.toFixed(2)
      }

      if (data) lastFrame = i
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [skip, data])

  if (skip) return <>{children}</>

  const text = SAID
  const jaw = data?.jaw ?? []
  const frames = data?.frames ?? 78
  const gx = (k: number) => (k / (frames - 1)) * GW
  const gy = (v: number) => GH - (Math.min(v, JAW_MAX) / JAW_MAX) * (GH - 8)
  const points = jaw.map((v, k) => `${gx(k).toFixed(1)},${gy(v).toFixed(1)}`).join(' ')

  return (
    <div className="rs" ref={wrap} style={{ ['--scroll' as string]: `${SCROLL_VH * 100}vh` }}>
      <div className="rs-stage">
        {children}
        <div className="rs-veil">
          <span className="rs-mouth" aria-hidden />
          <div className="rs-half rs-top" ref={top}>
            <div className="rs-head lp-wrap">
              <h2 className="rs-title">One silent sentence, read and spoken.</h2>
              <p className="rs-meta">
                <span className="rs-state" ref={state} data-state="Watching">
                  Watching
                </span>
                <span className="rs-clock" ref={clock}>
                  Frame 27 of 78 · 1.04 s
                </span>
              </p>
            </div>

            <div className="rs-instruments lp-wrap" aria-hidden>
              <figure className="rs-crop" ref={mouth}>
                <MouthMark className="rs-logo" live={false} />
                <figcaption>
                  The o is a mouth.
                  <small>It moves without sound. Unspoken gives it a voice.</small>
                </figcaption>
              </figure>
              <figure className="rs-graph">
                <figcaption>
                  Jaw opening <span ref={jawValue}>0.00</span>
                </figcaption>
                <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none">
                  <polyline points={points} className="rs-trace-bg" />
                  <polyline points={points} className="rs-trace" ref={trace} pathLength={1} />
                  <line x1={0} x2={0} y1={0} y2={GH} className="rs-playhead" ref={head} />
                </svg>
              </figure>
            </div>
            <span className="rs-bar rs-bar-top" aria-hidden />
          </div>

          <div className="rs-half rs-bot" ref={bot}>
            <span className="rs-bar rs-bar-bot" aria-hidden />
            <p className="rs-said" aria-label={text}>
              {text.split(' ').map((w, k) => (
                <span
                  key={k}
                  aria-hidden
                  ref={(el) => {
                    words.current[k] = el
                  }}
                >
                  {k === 0 ? w[0].toUpperCase() + w.slice(1) : w}{' '}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
