import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage, type ChipTone } from './components/Stage'
import { Transcript, Words, type StatItem } from './components/Transcript'
import { Controls } from './components/Controls'
import { Wordmark } from './components/Wordmark'
import { MouthDrawing } from './landing/glyph'
import { useCamera } from './hooks/useCamera'
import { useTranscript } from './hooks/useTranscript'
import { MockLipReader } from './lib/reader'
import { StreamLipReader, checkHealth, type Health } from './lib/backend'
import { Speaker, checkVoice, type VoiceHealth } from './lib/voice'
import { VoicebankPanel, VoicePicker, logout, useUser, useVoicebank } from '@voicebank'
import type { Line } from './hooks/useTranscript'

const VOICE_KEY = 'unspoken.voice'
function savedVoice() {
  try {
    return localStorage.getItem(VOICE_KEY)
  } catch {
    return null
  }
}

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

  // The voice server is optional: without it, sentences are only shown.
  const [voiceHealth, setVoiceHealth] = useState<VoiceHealth | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const h = await checkVoice()
      if (alive) setVoiceHealth((prev) => (h?.ok ? (prev?.ok ? prev : h) : null))
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])
  const voiceOnline = !!voiceHealth

  // Banked voices (../voicebank). The chosen one is used only while voicebank is up and it's approved.
  const user = useUser()
  const bank = useVoicebank()
  const [bankOpen, setBankOpen] = useState(false)
  const [chosenVoice, setChosenVoice] = useState<string | null>(savedVoice)
  const chooseVoice = useCallback((id: string | null) => {
    setChosenVoice(id)
    try {
      if (id) localStorage.setItem(VOICE_KEY, id)
      else localStorage.removeItem(VOICE_KEY)
    } catch {
      // private mode: just not remembered
    }
  }, [])
  const bankedVoice =
    bank.online && bank.profiles.some((p) => p.id === chosenVoice && p.status === 'approved') ? chosenVoice : null

  const mock = useMemo(() => new MockLipReader(), [])
  const backend = useMemo(() => new StreamLipReader(), [])
  const reader = online ? backend : mock

  useEffect(() => (online ? mock : backend).reset(), [online, mock, backend])

  const [reading, setReading] = useState(false)
  const [showMesh, setShowMesh] = useState(true)
  const [captions, setCaptions] = useState(true)
  const [mirrored, setMirrored] = useState(true)
  const [speakOn, setSpeakOn] = useState(true)
  const [snapOn, setSnapOn] = useState(true)
  useEffect(() => {
    backend.snap = snapOn
  }, [backend, snapOn])

  // Session clock: pauses while not reading.
  const clockRef = useRef<{ acc: number; since: number | null }>({ acc: 0, since: null })
  const clock = useCallback(() => {
    const c = clockRef.current
    return c.acc + (c.since === null ? 0 : performance.now() - c.since)
  }, [])
  const [elapsed, setElapsed] = useState(0)

  const t = useTranscript(reader, clock)

  // Speak each sentence once it's transcribed, one at a time.
  const speaker = useMemo(() => new Speaker(), [])
  const [speakingId, setSpeakingId] = useState<number | null>(null)
  useEffect(() => speaker.on(setSpeakingId), [speaker])
  useEffect(() => {
    speaker.wholeSentence = voiceHealth?.device === 'cpu'
  }, [voiceHealth, speaker])
  useEffect(() => speaker.setVoice(bankedVoice), [speaker, bankedVoice])
  const canSpeak = speakOn && (voiceOnline || !!bankedVoice)
  const spokenRef = useRef(0)
  const last = t.lines[t.lines.length - 1]
  useEffect(() => {
    if (!last || last.id === spokenRef.current) return
    spokenRef.current = last.id
    if (canSpeak && last.text && !last.result.error) speaker.say(last.id, last.text)
  }, [last, canSpeak, speaker])
  useEffect(() => {
    if (!canSpeak) speaker.stop()
  }, [canSpeak, speaker])
  const speakAgain = useCallback((line: Line) => speaker.say(line.id, line.text), [speaker])

  useEffect(() => {
    document.title = 'Unspoken'
  }, [])

  const [streamFps, setStreamFps] = useState<number | null>(null)
  useEffect(() => reader.on((e) => e.type === 'stats' && setStreamFps(e.fps)), [reader])
  useEffect(() => {
    if (!reading) setStreamFps(null)
  }, [reading])

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
    speaker.stop()
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

  // Captions: each finished sentence, for a few seconds (longer while it's being spoken).
  const [captionId, setCaptionId] = useState<number | null>(null)
  useEffect(() => {
    if (!last || last.result.error || !last.text) return
    setCaptionId(last.id)
    const id = setTimeout(() => setCaptionId(null), 5000)
    return () => clearTimeout(id)
  }, [last])
  const captionLine = last && (captionId === last.id || speakingId === last.id) ? last : null

  const [label, tone]: [string, ChipTone] = !reading
    ? ['Preview', 'idle']
    : t.status === 'recording'
      ? ['Reading lips', 'rec']
      : t.status === 'processing'
        ? ['Transcribing', 'proc']
        : speakingId !== null
          ? ['Speaking', 'listen']
          : ['Watching', 'listen']

  const stats: StatItem[] = [
    { label: 'Sentences', value: String(t.results) },
    { label: 'Words', value: String(t.wordCount) },
    { label: 'Latency', value: t.avgSeconds === null ? '—' : `${t.avgSeconds.toFixed(1)} s` },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <Wordmark className="brand-name" />
          <span className="badge">Prototype</span>
        </a>
        <dl className="topbar-meta">
          <div>
            <dt>Model</dt>
            <dd>{online ? (health.model ?? 'Auto-AVSR') : 'Mock'}</dd>
          </div>
          <div className="hide-sm">
            <dt>Backend</dt>
            <dd className={online ? 'is-on' : ''}>
              {health === undefined ? 'Checking' : online ? `Online / ${health.device ?? 'cpu'}` : 'Offline'}
            </dd>
          </div>
          <div className="hide-sm">
            <dt>Voice</dt>
            <dd className={voiceOnline || bankedVoice ? 'is-on' : ''}>
              {bankedVoice
                ? 'Banked'
                : voiceHealth === undefined
                  ? 'Checking'
                  : voiceOnline
                    ? 'Online'
                    : 'Offline'}
            </dd>
          </div>
          <div>
            <dt>Camera</dt>
            <dd className={camera.stream ? 'is-on' : ''}>{camera.stream ? 'Live' : 'Off'}</dd>
          </div>
        </dl>
        {bank.online && (
          <VoicePicker
            profiles={bank.profiles}
            value={bankedVoice}
            onChange={chooseVoice}
            onManage={() => setBankOpen(true)}
          />
        )}
        <div className="account">
          {user ? (
            <>
              <span className="account-name">{user.name}</span>
              <button onClick={() => void logout()}>Log out</button>
            </>
          ) : (
            <a href="/login">Log in</a>
          )}
        </div>
      </header>
      <VoicebankPanel
        open={bankOpen}
        onClose={() => setBankOpen(false)}
        profiles={bank.profiles}
        refresh={bank.refresh}
        onUse={chooseVoice}
      />

      <main className="layout">
        <section className="stage-col">
          <Stage
            stream={camera.stream}
            reading={reading}
            label={label}
            tone={tone}
            reader={reader}
            streamFps={online && reading ? streamFps : null}
            showMesh={showMesh}
            mirrored={mirrored}
            caption={captions && captionLine ? <Words words={captionLine.words} /> : null}
            empty={
              <div className="empty">
                <div className="empty-mark" aria-hidden>
                  <MouthDrawing jaw={0.14} />
                </div>
                <h1>Read lips in real time</h1>
                <p>Unspoken follows the shape of your mouth and turns it into text as you speak. No microphone.</p>
                <button className="btn-solid" onClick={start} disabled={busy}>
                  {busy ? 'Waiting for permission' : 'Enable camera'}
                </button>
                {camera.error && <p className="error">{camera.error}</p>}
                <p className="fineprint">
                  {online ? 'Phrase clips go to the Auto-AVSR server only while reading.' : 'Offline mock. Video never leaves the browser.'}
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
              { label: 'Voice', on: speakOn, set: setSpeakOn },
              { label: 'ICU phrases', on: snapOn, set: setSnapOn },
              { label: 'Mirror', on: mirrored, set: setMirrored },
            ]}
          />
        </section>

        <Transcript
          lines={t.lines}
          pendingAt={t.pendingAt}
          status={t.status}
          reading={reading}
          elapsed={elapsed}
          stats={stats}
          onClear={clear}
          speakingId={speakingId}
          onSpeak={canSpeak ? speakAgain : undefined}
        />
      </main>
    </div>
  )
}
