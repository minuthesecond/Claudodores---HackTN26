import { useEffect } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

const NAV_HEIGHT = 72

/** Smooth (inertial) scrolling with Lenis; off when the visitor prefers reduced motion. */
export function useSmoothScroll() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.1, anchors: { offset: -NAV_HEIGHT } })
    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])
}

/** Calls back with how far (0…1) a tall section has scrolled through its sticky stage. */
export function useScrollProgress(el: { current: HTMLElement | null }, onProgress: (p: number) => void) {
  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const node = el.current
      if (!node) return
      const r = node.getBoundingClientRect()
      const range = r.height - innerHeight
      const p = range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0
      if (Math.abs(p - last) > 0.0005) {
        last = p
        onProgress(p)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [el, onProgress])
}
