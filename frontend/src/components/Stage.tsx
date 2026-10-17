import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { LIP_EDGES, OVAL_EDGES, jawOpen, loadFaceLandmarker, measureMouth } from '../lib/faceTracker'
import type { LipReader } from '../lib/reader'

type Tracking = 'loading' | 'tracking' | 'simulated'

export type ChipTone = 'idle' | 'listen' | 'rec' | 'proc'

type Props = {
  stream: MediaStream | null
  reading: boolean
  label: string
  tone: ChipTone
  reader: LipReader
  showMesh: boolean
  mirrored: boolean
  caption?: ReactNode
  empty: ReactNode
}

const ACCENT = '#ff3d00'
const HISTORY = 44
const SPEAKING = 0.16
const ROI_ASPECT = 1.6

export function Stage({ stream, reading, label, tone, reader, showMesh, mirrored, caption, empty }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const roiRef = useRef<HTMLCanvasElement>(null)
  const sparkRef = useRef<HTMLCanvasElement>(null)
  const landmarkerRef = useRef<FaceLandmarker | null>(null)
  const trackingRef = useRef<Tracking>('loading')
  const optsRef = useRef({ reading, showMesh })

  const [tracking, setTracking] = useState<Tracking>('loading')
  const [stats, setStats] = useState({ fps: 0, face: false })

  useEffect(() => {
    optsRef.current = { reading, showMesh }
  }, [reading, showMesh])

  useEffect(() => {
    let alive = true
    const set = (t: Tracking) => {
      trackingRef.current = t
      if (alive) setTracking(t)
    }
    // `?simulate` skips face tracking and fakes lip movement (handy for demos).
    const load = new URLSearchParams(location.search).has('simulate')
      ? Promise.reject()
      : loadFaceLandmarker()
    load
      .then((l) => {
        landmarkerRef.current = l
        set('tracking')
      })
      .catch(() => set('simulated'))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.srcObject = stream
    if (stream) v.play().catch(() => {})
  }, [stream])

  useEffect(() => {
    if (!stream) return
    const video = videoRef.current!
    const overlay = overlayRef.current!
    const roi = roiRef.current!
    const spark = sparkRef.current!
    const octx = overlay.getContext('2d')!
    const rctx = roi.getContext('2d')!
    const sctx = spark.getContext('2d')!

    const history: number[] = new Array(HISTORY).fill(0)
    const box = { x: 0.4, y: 0.6, w: 0.2, h: 0.2 }
    let landmarks: NormalizedLandmark[] | null = null
    let raf = 0
    let lastVideoTime = -1
    let lastDetectAt = 0
    let prevOpen = 0
    let raw = 0
    let jaw = 0
    let env = 0
    let detections = 0
    let statsAt = performance.now()
    let sampleAt = 0
    let sim = { speaking: false, until: 0 }

    const fit = (c: HTMLCanvasElement) => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = Math.round(c.clientWidth * dpr)
      const h = Math.round(c.clientHeight * dpr)
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      return dpr
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (video.readyState < 2 || !video.videoWidth) return
      const vw = video.videoWidth
      const vh = video.videoHeight
      const { reading, showMesh } = optsRef.current

      // ---- detect -------------------------------------------------------
      const lmk = landmarkerRef.current
      let target: typeof box | null = null

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
        detections++
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

      if (reading) reader.tick({ now, activity: env, jaw })

      // ---- overlay ------------------------------------------------------
      const dpr = fit(overlay)
      const W = overlay.clientWidth
      const H = overlay.clientHeight
      const s = Math.max(W / vw, H / vh)
      const ox = (W - vw * s) / 2
      const oy = (H - vh * s) / 2
      const px = (x: number) => x * vw * s + ox
      const py = (y: number) => y * vh * s + oy

      octx.setTransform(dpr, 0, 0, dpr, 0, 0)
      octx.clearRect(0, 0, W, H)
      octx.lineCap = 'butt'
      octx.lineJoin = 'miter'

      if (showMesh && landmarks) {
        const path = (edges: typeof LIP_EDGES) => {
          octx.beginPath()
          for (const { start, end } of edges) {
            octx.moveTo(px(landmarks![start].x), py(landmarks![start].y))
            octx.lineTo(px(landmarks![end].x), py(landmarks![end].y))
          }
          octx.stroke()
        }
        octx.strokeStyle = 'rgba(255,255,255,0.22)'
        octx.lineWidth = 1
        path(OVAL_EDGES)
        octx.strokeStyle = ACCENT
        octx.lineWidth = 1.5
        path(LIP_EDGES)
      }

      if (target) {
        const x = px(box.x)
        const y = py(box.y)
        const w = box.w * vw * s
        const h = box.h * vh * s
        const c = Math.min(w, h) * 0.22
        const live = reading && env > SPEAKING
        octx.strokeStyle = live ? ACCENT : '#ffffff'
        octx.lineWidth = 2
        octx.beginPath()
        octx.moveTo(x, y + c); octx.lineTo(x, y); octx.lineTo(x + c, y)
        octx.moveTo(x + w - c, y); octx.lineTo(x + w, y); octx.lineTo(x + w, y + c)
        octx.moveTo(x + w, y + h - c); octx.lineTo(x + w, y + h); octx.lineTo(x + w - c, y + h)
        octx.moveTo(x + c, y + h); octx.lineTo(x, y + h); octx.lineTo(x, y + h - c)
        octx.stroke()
      }

      // ---- mouth crop ---------------------------------------------------
      fit(roi)
      const sx = Math.max(0, box.x * vw)
      const sy = Math.max(0, box.y * vh)
      const sw = Math.min(vw - sx, box.w * vw)
      const sh = Math.min(vh - sy, box.h * vh)
      rctx.setTransform(1, 0, 0, 1, 0, 0)
      rctx.filter = 'grayscale(1) contrast(1.15)'
      if (sw > 2 && sh > 2) rctx.drawImage(video, sx, sy, sw, sh, 0, 0, roi.width, roi.height)
      rctx.filter = 'none'

      // ---- activity bars ------------------------------------------------
      if (now - sampleAt > 55) {
        sampleAt = now
        history.shift()
        history.push(env)
      }
      const sdpr = fit(spark)
      const SW = spark.clientWidth
      const SH = spark.clientHeight
      sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0)
      sctx.clearRect(0, 0, SW, SH)
      const gap = 2
      const bw = (SW - gap * (HISTORY - 1)) / HISTORY
      history.forEach((v, i) => {
        const bh = Math.max(1, Math.round(Math.min(1, v * 1.4) * SH))
        sctx.fillStyle = v > SPEAKING && reading ? ACCENT : '#5a5a5a'
        sctx.fillRect(Math.round(i * (bw + gap)), SH - bh, Math.max(1, Math.floor(bw)), bh)
      })

      // ---- stats --------------------------------------------------------
      if (now - statsAt > 500) {
        const fps = Math.round((detections * 1000) / (now - statsAt))
        setStats((p) => (p.fps === fps && p.face === !!landmarks ? p : { fps, face: !!landmarks }))
        detections = 0
        statsAt = now
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [stream, reader])

  const status =
    tracking === 'loading'
      ? 'Loading face model'
      : tracking === 'simulated'
        ? 'Simulated tracking'
        : stats.face
          ? `Face locked · ${stats.fps} fps`
          : 'Looking for a face'

  return (
    <div className={`stage ${stream ? 'is-live' : ''}`}>
      <video ref={videoRef} className={`stage-video ${mirrored ? 'mirrored' : ''}`} playsInline muted />
      <canvas ref={overlayRef} className={`stage-overlay ${mirrored ? 'mirrored' : ''}`} />

      {!stream && <div className="stage-empty">{empty}</div>}

      <div className="hud" hidden={!stream}>
        <div className="hud-top">
          <span className={`chip chip-${tone}`}>
            <span className="chip-dot" />
            {label}
          </span>
          <span className="chip chip-mono">
            <span className={`signal ${tracking === 'tracking' && stats.face ? 'ok' : tracking === 'loading' ? 'wait' : 'warn'}`} />
            {status}
          </span>
        </div>

        <div className="hud-bottom">
          {caption && <div className="caption">{caption}</div>}
          <div className="hud-row">
            <div className="glass meter">
              <span className="glass-label">Lip activity</span>
              <canvas ref={sparkRef} className="spark" />
            </div>
            <div className="glass roi">
              <canvas ref={roiRef} className={`roi-canvas ${mirrored ? 'mirrored' : ''}`} />
              <span className="glass-label">Mouth ROI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
