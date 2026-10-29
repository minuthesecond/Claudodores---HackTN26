import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { jawOpen, loadFaceLandmarker, measureMouth } from '../lib/faceTracker'
import type { LipReader } from '../lib/reader'

type Tracking = 'loading' | 'tracking' | 'simulated'

type Props = {
  stream: MediaStream
  /** hand frames to the reader; otherwise the camera only previews */
  reading: boolean
  reader: LipReader
  mirrored: boolean
}

const SPEAKING = 0.16 // lip activity above this counts as mouthing
const ROI_ASPECT = 1.6

/**
 * The patient's mirror: their camera, with corner marks around the mouth that turn to the
 * accent colour while they're mouthing. Runs face tracking every frame and feeds the reader.
 */
export function Camera({ stream, reading, reader, mirrored }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const trackingRef = useRef<Tracking>('loading')
  const readingRef = useRef(reading)
  const [tracking, setTracking] = useState<Tracking>('loading')
  const [face, setFace] = useState(true)

  useEffect(() => {
    readingRef.current = reading
  }, [reading])

  useEffect(() => {
    let alive = true
    const set = (t: Tracking) => {
      trackingRef.current = t
      if (alive) setTracking(t)
    }
    // `?simulate` skips face tracking and fakes lip movement (handy for demos).
    const load = new URLSearchParams(location.search).has('simulate') ? Promise.reject() : loadFaceLandmarker()
    load.then(
      (l) => {
        landmarkerRef.current = l
        set('tracking')
      },
      () => set('simulated'),
    )
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current!
    video.srcObject = stream
    video.play().catch(() => {})
  }, [stream])

  useEffect(() => {
    const video = videoRef.current!
    const overlay = overlayRef.current!
    const ctx = overlay.getContext('2d')!
    const box = { x: 0.4, y: 0.6, w: 0.2, h: 0.2 }
    let landmarks: NormalizedLandmark[] | null = null
    let raf = 0
    let lastVideoTime = -1
    let lastDetectAt = 0
    let prevOpen = 0
    let raw = 0
    let jaw = 0
    let env = 0
    let checkedAt = 0
    let live = '#fff'
    let sim = { speaking: false, until: 0 }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (video.readyState < 2 || !video.videoWidth) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      let target: typeof box | null = null

      const lmk = landmarkerRef.current
      if (lmk && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        try {
          const res = lmk.detectForVideo(video, now)
          landmarks = res.faceLandmarks[0] ?? null
          jaw = landmarks ? jawOpen(res) : 0
        } catch {
          landmarks = null
          jaw = 0
        }
        if (landmarks) {
          const m = measureMouth(landmarks, vw / vh)
          const dt = Math.max(16, now - lastDetectAt)
          const velocity = (Math.abs(m.openness - prevOpen) / dt) * 1000
          prevOpen = m.openness
          lastDetectAt = now
          raw = Math.min(1, velocity / 1.4 + Math.max(0, m.openness - 0.07) * 1.1)
        } else {
          raw = 0
        }
      }

      if (landmarks) {
        const m = measureMouth(landmarks, vw / vh)
        const cx = m.box.x + m.box.w / 2
        const cy = m.box.y + m.box.h / 2
        const w = m.box.w * 1.7
        const h = (w * vw) / vh / ROI_ASPECT
        target = { x: cx - w / 2, y: cy - h / 2, w, h }
      } else if (trackingRef.current === 'simulated') {
        if (now > sim.until) {
          sim = { speaking: !sim.speaking, until: now + (sim.speaking ? 900 + Math.random() * 1200 : 1800 + Math.random() * 2600) }
        }
        raw = sim.speaking ? 0.3 + Math.abs(Math.sin(now / 85)) * 0.5 * Math.random() : Math.random() * 0.04
        jaw = raw
        const w = 0.22
        target = { x: 0.5 - w / 2, y: 0.5, w, h: (w * vw) / vh / ROI_ASPECT }
      } else {
        raw = 0
        jaw = 0
      }

      env = raw > env ? env + (raw - env) * 0.55 : env * 0.93
      if (target) {
        const k = 0.35
        box.x += (target.x - box.x) * k
        box.y += (target.y - box.y) * k
        box.w += (target.w - box.w) * k
        box.h += (target.h - box.h) * k
      }

      if (readingRef.current) reader.tick({ now, activity: env, jaw, source: video })

      // twice a second: is there a face, and what's the accent colour (it changes with night mode)
      if (now - checkedAt > 500) {
        checkedAt = now
        const found = !!target
        setFace((f) => (f === found ? f : found))
        live = getComputedStyle(overlay).getPropertyValue('--accent').trim() || live
      }

      const dpr = Math.min(devicePixelRatio || 1, 2)
      const W = overlay.clientWidth
      const H = overlay.clientHeight
      if (overlay.width !== Math.round(W * dpr) || overlay.height !== Math.round(H * dpr)) {
        overlay.width = Math.round(W * dpr)
        overlay.height = Math.round(H * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (!target) return

      // the video is drawn with object-fit: cover; map video coords onto it the same way
      const s = Math.max(W / vw, H / vh)
      const x = box.x * vw * s + (W - vw * s) / 2
      const y = box.y * vh * s + (H - vh * s) / 2
      const w = box.w * vw * s
      const h = box.h * vh * s
      const c = Math.min(w, h) * 0.24
      ctx.strokeStyle = readingRef.current && env > SPEAKING ? live : 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y)
      ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c)
      ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h)
      ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c)
      ctx.stroke()
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [stream, reader])

  const hint =
    tracking === 'loading' ? 'Starting face tracking' : !face ? 'Move so your mouth is in view' : null

  return (
    <div className="cam">
      <video ref={videoRef} className={mirrored ? 'is-mirrored' : ''} playsInline muted />
      <canvas ref={overlayRef} className={mirrored ? 'is-mirrored' : ''} aria-hidden />
      <span className="cam-tag">{reading ? 'Reading' : 'Preview'}</span>
      {hint && <p className="cam-hint">{hint}</p>}
    </div>
  )
}
