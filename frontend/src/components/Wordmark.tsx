import { useEffect, useRef } from 'react'
import { loadJaw } from '../landing/glyph'

/**
 * The name is the mark: "Unspoken" with its o drawn as a mouth, a white (current colour)
 * upper lip over an orange lower lip. At rest the two lips close into an o; they part
 * and close on the real jawOpen trace from talking.MOV, pauses included.
 */

const FPS = 25
/** How far apart the lips get at full opening, in the mark's 100-unit box. */
export const MOUTH_OPEN = 26
const JAW_MAX = 0.4

/** The mouth on its own: the o of the wordmark, also used as the mark at larger sizes.
 *  With `live={false}` it stays closed and the parent moves `.wm-lip-top` / `.wm-lip-bot` itself. */
export function MouthMark({ className = '', live = true }: { className?: string; live?: boolean }) {
  const up = useRef<SVGPathElement>(null)
  const lo = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (!live || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let data: number[] = []
    loadJaw().then((d) => (data = d))
    const t0 = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!data.length) return
      const f = (((now - t0) / 1000) * FPS) % data.length
      const i = Math.floor(f)
      const v = data[i] + (data[(i + 1) % data.length] - data[i]) * (f - i)
      const g = (Math.min(v, JAW_MAX) / JAW_MAX) * MOUTH_OPEN
      up.current?.setAttribute('transform', `translate(0 ${(-g / 2).toFixed(2)})`)
      lo.current?.setAttribute('transform', `translate(0 ${(g / 2).toFixed(2)})`)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live])

  return (
    <svg className={`wm-o ${className}`} viewBox="0 0 100 100" aria-hidden>
      <path ref={up} className="wm-lip-top" d="M14 52 A36 38 0 0 1 86 52" />
      <path ref={lo} className="wm-lip-bot" d="M14 52 A36 38 0 0 0 86 52" />
    </svg>
  )
}

/** With `live={false}` the mouth stays closed, for places where motion would distract. */
export function Wordmark({ className = '', live = true }: { className?: string; live?: boolean }) {
  return (
    <span className={`wm ${className}`} role="img" aria-label="Unspoken">
      <span aria-hidden>Unsp</span>
      <MouthMark live={live} />
      <span aria-hidden>ken</span>
    </span>
  )
}
