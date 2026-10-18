import { useEffect, useRef, useState, type ReactNode } from 'react'
import './intro.css'

/**
 * The scroll intro: the logo's closed mouth fills the screen. Scrolling plays the real
 * jawOpen trace and mouth crops from talking.MOV, so the bars move the way Justin's jaw did
 * while the decoded words appear; then the mouth opens all the way and parts the screen
 * to reveal the hero, which waits underneath (sticky) the whole time.
 */

type Replay = { jaw: number[]; cols: number; size: number; final: string }

const FIRST = 28 // the clip's frames that hold the phrase
const LAST = 62
const SPEAK_END = 0.5 // scroll progress where speech ends…
const OPEN_START = 0.58 // …and the mouth starts to open for good
const SCROLL_VH = 1.6 // how many screens of scroll the intro takes
const NAV = 72 // the stage is held just under the nav

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function Intro({ children }: { children: ReactNode }) {
  const [skip] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const wrap = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bot = useRef<HTMLDivElement>(null)
  const words = useRef<(HTMLSpanElement | null)[]>([])
  const hint = useRef<HTMLParagraphElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
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
    const sprite = new Image()
    sprite.src = '/landing/mouth-sprite.png'
    const jaw = data?.jaw ?? []
    const n = data ? data.final.split(' ').length : 0
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

      // speaking: scroll scrubs through the clip's frames
      const s = clamp(p / SPEAK_END)
      const f = FIRST + s * (LAST - FIRST)
      const i = Math.floor(f)
      const j = jaw.length ? jaw[i] + (jaw[Math.min(i + 1, jaw.length - 1)] - jaw[i]) * (f - i) : 0
      const talk = Math.min(j, 0.45) * vh * 0.42

      // opening: the two halves part and leave the screen
      const o = easeInOut(clamp((p - OPEN_START) / (1 - OPEN_START)))
      const gap = talk + o * vh * 1.08 // each half travels past the edge
      top.current!.style.transform = `translate3d(0, ${-gap / 2}px, 0)`
      bot.current!.style.transform = `translate3d(0, ${gap / 2}px, 0)`
      el.classList.toggle('is-open', p >= 0.999)
      if (p > OPEN_START) el.classList.add('is-parting') // once parted, the hero's entrance has played

      // decoded words arrive as the phrase is mouthed, and leave as the mouth opens
      const shown = Math.round(clamp((s - 0.15) / 0.8) * n)
      words.current.forEach((w, k) => w?.classList.toggle('is-on', k < shown))
      bot.current!.style.setProperty('--fade', String(1 - clamp(o * 3)))
      hint.current?.classList.toggle('is-gone', p > 0.04)

      // the 96×96 crop the model saw at this frame
      const c = canvas.current
      if (c && data && sprite.complete && i !== lastFrame) {
        lastFrame = i
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        const sz = data.size
        ctx.drawImage(sprite, (i % data.cols) * sz, Math.floor(i / data.cols) * sz, sz, sz, 0, 0, c.width, c.height)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [skip, data])

  if (skip) return <>{children}</>

  const text = data?.final ?? 'hi my name is justin'
  return (
    <div className="in" ref={wrap} style={{ ['--scroll' as string]: `${SCROLL_VH * 100}vh` }}>
      <div className="in-stage">{children}</div>
      <div className="in-veil" aria-hidden>
        <div className="in-half in-top" ref={top}>
          <span className="in-word">Unspoken</span>
          <figure className="in-crop">
            <canvas ref={canvas} width={192} height={192} />
            <figcaption>What the model sees</figcaption>
          </figure>
          <span className="in-bar in-bar-top" />
        </div>
        <div className="in-half in-bot" ref={bot}>
          <span className="in-bar in-bar-bot" />
          <p className="in-said">
            {text.split(' ').map((w, k) => (
              <span
                key={k}
                ref={(el) => {
                  words.current[k] = el
                }}
              >
                {k === 0 ? w[0].toUpperCase() + w.slice(1) : w}{' '}
              </span>
            ))}
          </p>
          <p className="in-src">Read from a silent clip by the working prototype</p>
          <p className="in-hint" ref={hint}>
            Scroll to speak
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M10 3v13M4.5 10.5 10 16l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </p>
        </div>
      </div>
    </div>
  )
}
