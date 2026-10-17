import { useEffect, useRef } from 'react'

/**
 * The phone app from the business plan, drawn in code: bank your voice and face
 * before surgery, train, then mouth a phrase, confirm it and hear it in your voice.
 * Mouth footage is the real model input from talking.MOV (public/landing).
 */

const SPRITE = '/landing/mouth-sprite.png'
const COLS = 13
const FRAMES = 78
const SIZE = 96
const FPS = 25

let sprite: HTMLImageElement | null = null
function getSprite() {
  if (!sprite) {
    sprite = new Image()
    sprite.src = SPRITE
  }
  return sprite
}

/** Plays the real 96×96 mouth crops on a loop. */
export function MouthClip({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const img = getSprite()
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = -1
    const t0 = performance.now()
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const f = still ? 45 : Math.floor(((now - t0) / 1000) * FPS) % FRAMES
      if (f === last || !img.complete) return
      last = f
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, (f % COLS) * SIZE, Math.floor(f / COLS) * SIZE, SIZE, SIZE, 0, 0, canvas.width, canvas.height)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} width={192} height={192} className={`mouth-clip ${className}`} />
}

/** One still mouth crop from the sprite, as a tile. */
export function MouthTile({ frame }: { frame: number }) {
  return (
    <span
      className="mouth-tile"
      style={{
        backgroundPosition: `${((frame % COLS) / (COLS - 1)) * 100}% ${(Math.floor(frame / COLS) / 5) * 100}%`,
      }}
    />
  )
}

/** Animated voice level bars. */
export function Wave({ bars = 28, live = true }: { bars?: number; live?: boolean }) {
  return (
    <span className={`wave ${live ? 'is-live' : ''}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <i
          key={i}
          style={{
            animationDelay: `${(-((i * 137) % 900) / 1000).toFixed(2)}s`,
            height: `${30 + ((i * 53) % 70)}%`,
          }}
        />
      ))}
    </span>
  )
}

export type Screen = 'bank' | 'train' | 'speak'

export function Phone({ screen }: { screen: Screen }) {
  return (
    <div className="ph" aria-hidden>
      <div className="ph-status">
        <span>9:41</span>
        <span className="ph-app">Unspoken</span>
      </div>
      <div className="ph-screens">
        <BankScreen active={screen === 'bank'} />
        <TrainScreen active={screen === 'train'} />
        <SpeakScreen active={screen === 'speak'} />
      </div>
      <div className="ph-home" />
    </div>
  )
}

function BankScreen({ active }: { active: boolean }) {
  return (
    <section className={`ph-screen ${active ? 'is-active' : ''}`}>
      <div className="ph-row">
        <span className="ph-rec">
          <i /> Rec 07:42
        </span>
        <span className="ph-dim">23 / 40</span>
      </div>
      <div className="ph-view">
        <MouthClip />
      </div>
      <span className="ph-label">Read aloud</span>
      <p className="ph-prompt">The boat sailed across the bay before dawn.</p>
      <Wave />
      <span className="ph-progress">
        <i style={{ width: '57%' }} />
      </span>
    </section>
  )
}

function TrainScreen({ active }: { active: boolean }) {
  return (
    <section className={`ph-screen ${active ? 'is-active' : ''}`}>
      <div className="ph-row">
        <span className="ph-title">Training</span>
        <span className="ph-dim">40 clips</span>
      </div>
      <div className="ph-card">
        <div className="ph-row">
          <span className="ph-label">Your voice</span>
          <span className="ph-done">Done</span>
        </div>
        <Wave bars={22} live={false} />
        <span className="ph-progress">
          <i style={{ width: '100%' }} />
        </span>
      </div>
      <div className="ph-card">
        <div className="ph-row">
          <span className="ph-label">Your lips</span>
          <span className="ph-dim">72%</span>
        </div>
        <div className="ph-tiles">
          {[3, 14, 25, 33, 38, 41, 47, 52, 55, 60, 64, 70].map((f) => (
            <MouthTile key={f} frame={f} />
          ))}
        </div>
        <span className="ph-progress">
          <i className="is-filling" style={{ width: '72%' }} />
        </span>
      </div>
    </section>
  )
}

function SpeakScreen({ active }: { active: boolean }) {
  return (
    <section className={`ph-screen ${active ? 'is-active' : ''}`}>
      <div className="ph-row">
        <span className="ph-rec">
          <i /> Reading
        </span>
        <span className="ph-dim">EN</span>
      </div>
      <div className="ph-view ph-view-ring">
        <MouthClip />
      </div>
      <span className="ph-label">Did you mean</span>
      <ol className="ph-guesses">
        <li className="is-picked">Hi my name is Justin</li>
        <li>Hi my name is Jason</li>
        <li>My name is Justice</li>
      </ol>
      <div className="ph-speaking">
        <Wave bars={20} />
        <span>In your voice</span>
      </div>
      <span className="ph-nurse">Send to nurse</span>
    </section>
  )
}
