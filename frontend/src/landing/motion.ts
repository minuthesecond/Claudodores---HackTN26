import { useEffect, type RefObject } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

/**
 * Smooth (inertial) scrolling with Lenis, plus scroll-linked parallax.
 *
 * Mark elements inside `root` with a speed, in px of movement per px scrolled:
 *   data-y   vertical    (positive lags behind the page, negative runs ahead)
 *   data-x   horizontal
 *   data-bg  background-position-x (for seamless repeating strips)
 * Each element sits at its natural position when it's centred in the viewport,
 * clamped to the scroll range: elements in view on load start in place, and
 * elements near the bottom settle in place when the page is scrolled to the end.
 */
type Item = { el: HTMLElement; x: number; y: number; bg: number; anchor: number }

const NAV_HEIGHT = 64

export function useSmoothParallax(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current
    if (!host) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    const lenis = new Lenis({ lerp: 0.085, anchors: { offset: -NAV_HEIGHT } })
    let items: Item[] = []

    const measure = () => {
      if (reduce) return
      const vh = innerHeight
      const maxScroll = document.documentElement.scrollHeight - vh
      items = [...host.querySelectorAll<HTMLElement>('[data-x],[data-y],[data-bg]')].map((el) => {
        const transform = el.style.transform
        el.style.transform = '' // measure the untransformed position
        const r = el.getBoundingClientRect()
        el.style.transform = transform
        return {
          el,
          x: Number(el.dataset.x ?? 0),
          y: Number(el.dataset.y ?? 0),
          bg: Number(el.dataset.bg ?? 0),
          anchor: Math.min(maxScroll, Math.max(0, r.top + scrollY + r.height / 2 - vh / 2)),
        }
      })
    }

    const apply = (scroll: number) => {
      for (const it of items) {
        const d = scroll - it.anchor
        if (it.bg) it.el.style.backgroundPositionX = `${(d * it.bg).toFixed(1)}px`
        if (it.x || it.y) it.el.style.transform = `translate3d(${(d * it.x).toFixed(1)}px, ${(d * it.y).toFixed(1)}px, 0)`
      }
    }

    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      apply(lenis.scroll)
      raf = requestAnimationFrame(loop)
    }

    measure()
    raf = requestAnimationFrame(loop)
    const ro = new ResizeObserver(measure) // layout shifts: fonts, the replay loading, resizes
    ro.observe(host)
    document.fonts?.ready.then(measure)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      lenis.destroy()
      for (const it of items) {
        it.el.style.transform = ''
        it.el.style.backgroundPositionX = ''
      }
    }
  }, [root])
}
