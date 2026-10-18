import { useEffect, useRef } from 'react'

/**
 * The Unspoken mouth: the logo's two bars, parted by how open the jaw is.
 * Animated versions replay the real jawOpen signal from talking.MOV
 * (public/landing/replay.json), so the motion is real speech without a face.
 * Colours come from CSS (.glyph-top / .glyph-bot) so the glyph sits on any card.
 */

const FPS = 25

let jawPromise: Promise<number[]> | null = null
function loadJaw() {
  jawPromise ??= fetch('/landing/replay.json')
    .then((r) => r.json())
    .then((d: { jaw: number[] }) => d.jaw)
    .catch(() => [])
  return jawPromise
}

/** Bar geometry in a 100×100 box for a jaw opening of 0…~0.5. */
function bars(jaw: number) {
  const open = Math.min(Math.max(jaw, 0), 0.5)
  const w = 64 - open * 18 // the mouth narrows a little as it opens
  const t = 9
  const gap = 3 + open * 64
  const x = (100 - w) / 2
  return { x, w, t, top: 50 - gap / 2 - t, bottom: 50 + gap / 2 }
}

/** A two-ink articulation drawing (upper lip ink, lower lip orange) in a 100×64 box. */
function lips(jaw: number) {
  const open = Math.min(Math.max(jaw, 0), 0.4) / 0.4
  const g = open * 22 // lip gap at the centre
  const x0 = 8 + open * 7 // the corners draw in as the mouth opens
  const x1 = 92 - open * 7
  const c = 32
  const yU = c - 11 - g / 2 // top of the upper lip
  const yi = c - g * 0.67 // control points that put the inner lines ±g/2 at the centre
  const yj = c + g * 0.67
  const yL = c + (13 + g / 2) * 1.33
  const upper =
    `M${x0},${c} C${x0 + 12},${yU + 7} 34,${yU} 42,${yU} Q46,${yU} 50,${yU + 3.5} Q54,${yU} 58,${yU} ` +
    `C66,${yU} ${x1 - 12},${yU + 7} ${x1},${c} C${x1 - 16},${yi} ${x0 + 16},${yi} ${x0},${c}Z`
  const lower = `M${x0},${c} C${x0 + 16},${yj} ${x1 - 16},${yj} ${x1},${c} C${x1 - 14},${yL} ${x0 + 14},${yL} ${x0},${c}Z`
  return { upper, lower }
}

/** The mouth drawn as an articulation card would draw it; `live` replays the real jaw trace. */
export function MouthDrawing({ jaw, live = false, className = '' }: { jaw?: number; live?: boolean; className?: string }) {
  const upRef = useRef<SVGPathElement>(null)
  const loRef = useRef<SVGPathElement>(null)
  const p = lips(jaw ?? 0)

  useEffect(() => {
    if (!live) return
    let raf = 0
    let data: number[] = []
    loadJaw().then((d) => (data = d))
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!data.length) return
      const f = still ? 34 : (((now - t0) / 1000) * FPS) % data.length
      const i = Math.floor(f)
      const v = data[i] + (data[(i + 1) % data.length] - data[i]) * (f - i)
      const q = lips(v)
      upRef.current?.setAttribute('d', q.upper)
      loRef.current?.setAttribute('d', q.lower)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <svg viewBox="0 0 100 64" className={`lips ${className}`} aria-hidden>
      <path ref={upRef} className="lips-upper" d={p.upper} />
      <path ref={loRef} className="lips-lower" d={p.lower} />
    </svg>
  )
}

export function MouthGlyph({ jaw, live = false, className = '' }: { jaw?: number; live?: boolean; className?: string }) {
  const topRef = useRef<SVGRectElement>(null)
  const botRef = useRef<SVGRectElement>(null)
  const g = bars(jaw ?? 0)

  useEffect(() => {
    if (!live) return
    let raf = 0
    let data: number[] = []
    loadJaw().then((d) => (data = d))
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!data.length) return
      const f = still ? 45 : (((now - t0) / 1000) * FPS) % data.length
      const i = Math.floor(f)
      const v = data[i] + (data[(i + 1) % data.length] - data[i]) * (f - i) // ease between frames
      const b = bars(v)
      topRef.current?.setAttribute('y', String(b.top))
      botRef.current?.setAttribute('y', String(b.bottom))
      for (const el of [topRef.current, botRef.current]) {
        el?.setAttribute('x', String(b.x))
        el?.setAttribute('width', String(b.w))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <svg viewBox="0 0 100 100" className={`glyph ${className}`} aria-hidden>
      <rect ref={topRef} className="glyph-top" x={g.x} y={g.top} width={g.w} height={g.t} rx={1.5} />
      <rect ref={botRef} className="glyph-bot" x={g.x} y={g.bottom} width={g.w} height={g.t} rx={1.5} />
    </svg>
  )
}
