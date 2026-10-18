import { useEffect, useRef } from 'react'
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

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scroll reveals. Content is visible by default; only once this runs (and motion is allowed)
 * does the root get `is-armed`, which hides `[data-reveal]` until it scrolls into view.
 */
export function useReveal(root: { current: HTMLElement | null }) {
  useEffect(() => {
    const host = root.current
    if (!host || reduced()) return
    const els = [...host.querySelectorAll<HTMLElement>('[data-reveal]')]
    host.classList.add('is-armed')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.classList.add('is-in')
          io.unobserve(e.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => {
      io.disconnect()
      host.classList.remove('is-armed')
    }
  }, [root])
}

/**
 * Scroll-linked CSS: every `[data-scroll]` element gets `--p`, 0 as its top enters the
 * bottom of the viewport and 1 as its bottom leaves the top. CSS does the rest.
 */
export function useScrollVars(root: { current: HTMLElement | null }) {
  useEffect(() => {
    const host = root.current
    if (!host || reduced()) return
    const els = [...host.querySelectorAll<HTMLElement>('[data-scroll]')]
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const vh = innerHeight
      for (const el of els) {
        const r = el.getBoundingClientRect()
        if (r.bottom < -vh || r.top > vh * 2) continue
        const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
        el.style.setProperty('--p', p.toFixed(4))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [root])
}

/** Counts a number up from zero the first time it scrolls into view. */
export function useCountUp<T extends HTMLElement>(to: number, ms = 1400) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced()) return
    const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
    el.textContent = fmt(0)
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms)
        el.textContent = fmt(to * (1 - Math.pow(1 - t, 4)))
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      el.textContent = fmt(to)
    }
  }, [to, ms])
  return ref
}
