import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, type ChipTone } from './components/Stage'
import { Transcript, Words, type StatItem } from './components/Transcript'
import { Controls } from './components/Controls'
import { Logo } from './components/Icons'
import { useCamera } from './hooks/useCamera'
import { useTranscript } from './hooks/useTranscript'
import { MockLipReader } from './lib/reader'
import { BackendLipReader, checkHealth, type Health } from './lib/backend'

export default function App() {
  const camera = useCamera()

  // Use the Auto-AVSR server when it's up; fall back to the mock reader otherwise.
  const [health, setHealth] = useState<Health | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const h = await checkHealth()
      if (alive) setHealth((prev) => (h?.ok ? (prev?.device === h.device ? prev : h) : null))
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  const online = !!health
  const mock = useMemo(() => new MockLipReader(), [])
  const backend = useMemo(() => new BackendLipReader(), [])
  const reader = online ? backend : mock

  useEffect(() => backend.attach(camera.stream), [backend, camera.stream])
  useEffect(() => (online ? mock : backend).reset(), [online, mock, backend])

  const [reading, setReading] = useState(false)
  const [showMesh, setShowMesh] = useState(true)
  const [captions, setCaptions] = useState(true)
  const [mirrored, setMirrored] = useState(true)

  // Session clock: pauses while not reading.
  const clockRef = useRef<{ acc: number; since: number | null }>({ acc: 0, since: null })
  const clock = useCallback(() => {
    const c = clockRef.current
    return c.acc + (c.since === null ? 0 : performance.now() - c.since)
  }, [])
  const [elapsed, setElapsed] = useState(0)

  const t = useTranscript(reader, clock)

  useEffect(() => {
    if (!reading) return
    const id = setInterval(() => setElapsed(clock()), 250)
    return () => clearInterval(id)
  }, [reading, clock])

  const start = useCallback(async () => {
    if (!camera.stream && !(await camera.start())) return
    clockRef.current.since = performance.now()
    setReading(true)
  }, [camera])

  const stop = useCallback(() => {
    const c = clockRef.current
    if (c.since !== null) c.acc += performance.now() - c.since
    c.since = null
    reader.flush()
    setReading(false)
    setElapsed(clock())
  }, [reader, clock])

  const toggle = useCallback(() => (reading ? stop() : start()), [reading, start, stop])

  const clear = () => {
    reader.reset()
    t.clear()
    clockRef.current = { acc: 0, since: reading ? performance.now() : null }
    setElapsed(0)
  }

  const cameraOff = () => {
    if (reading) stop()
    camera.stop()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, button, [contenteditable]')) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  const busy = camera.status === 'requesting'

  // Captions: streaming words (mock), or the latest result for a few seconds (backend).
  const last = t.lines[t.lines.length - 1]
  const [captionId, setCaptionId] = useState<number | null>(null)
  useEffect(() => {
    if (!last?.result || last.result.error) return
    setCaptionId(last.id)
    const id = setTimeout(() => setCaptionId(null), 5000)
    return () => clearTimeout(id)
  }, [last])
  const captionWords = t.current.length || t.interim ? t.current.slice(-9) : captionId === last?.id ? last.words : []

  const [label, tone]: [string, ChipTone] = !reading
    ? ['Preview', 'idle']
    : t.status === 'recording'
      ? ['Recording', 'rec']
      : t.status === 'processing'
        ? ['Reading lips', 'proc']
        : online
          ? ['Listening', 'listen']
          : ['Reading', 'rec']

  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—')
  const stats: StatItem[] = online
    ? [
        { label: 'Phrases', value: String(t.results) },
        { label: 'Words', value: String(t.wordCount) },
        { label: 'Latency', value: t.avgSeconds === null ? '—' : `${t.avgSeconds.toFixed(1)}s` },
      ]
    : [
        { label: 'Words', value: String(t.wordCount) },
        { label: 'Lines', value: String(t.lines.length) },
        { label: 'Confidence', value: pct(t.confidence, 1), bar: t.wordCount ? t.confidence : 0 },
      ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand-name">Unspoken</span>
          <span className="badge">v0.1 Preview</span>
        </div>
        <dl className="topbar-meta">
          <div>
            <dt>Model</dt>
            <dd>{online ? (health.model ?? 'AUTO-AVSR') : 'MOCK'}</dd>
          </div>
          <div className="hide-sm">
            <dt>Backend</dt>
            <dd className={online ? 'is-on' : ''}>
              {health === undefined ? 'Checking' : online ? `Online / ${health.device ?? 'cpu'}` : 'Offline'}
            </dd>
          </div>
          <div>
            <dt>Camera</dt>
            <dd className={camera.stream ? 'is-on' : ''}>{camera.stream ? 'Live' : 'Off'}</dd>
          </div>
        </dl>
      </header>

      <main className="layout">
        <section className="stage-col">
          <Stage
            stream={camera.stream}
            reading={reading}
            label={label}
            tone={tone}
            reader={reader}
            showMesh={showMesh}
            mirrored={mirrored}
            caption={
              captions && reading && (captionWords.length || t.interim) ? (
                <Words words={captionWords} interim={t.interim} />
              ) : null
            }
            empty={
              <div className="empty">
                <div className="empty-mark" aria-hidden>
                  <span />
                  <span />
                </div>
                <h1>Read lips in real time</h1>
                <p>Unspoken follows the shape of your mouth and turns it into text as you speak. No microphone.</p>
                <button className="btn-solid" onClick={start} disabled={busy}>
                  {busy ? 'Waiting for permission' : 'Enable camera'}
                </button>
                {camera.error && <p className="error">{camera.error}</p>}
                <p className="fineprint">
                  {online ? 'Phrase clips go to the Auto-AVSR server only while reading' : 'Offline mock / Video never leaves the browser'}
                </p>
              </div>
            }
          />
          <Controls
            reading={reading}
            busy={busy}
            onToggle={toggle}
            devices={camera.devices}
            deviceId={camera.deviceId}
            onDevice={(id) => camera.start(id)}
            cameraOn={!!camera.stream}
            onCameraOff={cameraOff}
            toggles={[
              { label: 'Landmarks', on: showMesh, set: setShowMesh },
              { label: 'Captions', on: captions, set: setCaptions },
              { label: 'Mirror', on: mirrored, set: setMirrored },
            ]}
          />
        </section>

        <Transcript
          lines={t.lines}
          current={t.current}
          currentId={t.currentId}
          currentAt={t.currentAt}
          interim={t.interim}
          status={t.status}
          reading={reading}
          elapsed={elapsed}
          stats={stats}
          onClear={clear}
        />
      </main>
    </div>
  )
}
