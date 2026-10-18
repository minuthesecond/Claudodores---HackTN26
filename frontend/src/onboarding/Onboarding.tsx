import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  addRecording,
  approveProfile,
  buildProfile,
  checkVoicebank,
  createProfile,
  getProfile,
  getPrompts,
  login,
  mediaUrl,
  signup,
  speakUrl,
  useUser,
  type Profile,
  type Prompts,
} from '@voicebank'
import { Wordmark } from '../components/Wordmark'
import { MouthDrawing } from '../landing/glyph'
import './onboarding.css'

/**
 * /start: your name, then your voice (one sentence at a time), then an account that keeps it.
 * /login: straight to the account. Accounts and voices live on the voicebank server
 * (../../../voicebank/auth.py, server.py).
 *
 * One column, one question per screen. The only mark is the mouth, which moves with your
 * microphone while you record. Making the voice is a step of its own with real progress,
 * and it ends with the first sentence already generated, so "This is you" plays at once.
 */

type Step = 'name' | 'voice' | 'account'
type Saved = { step: Step; name: string; voiceId: string | null }

const KEY = 'unspoken.onboarding'
const VOICE_KEY = 'unspoken.voice' // the reader's chosen voice (App.tsx)
const MIN_S = 6 // voicebank/banking.py MIN_SPEECH_S
const STEPS: Step[] = ['name', 'voice', 'account']

function load(): Saved {
  try {
    return { step: 'name', name: '', voiceId: null, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { step: 'name', name: '', voiceId: null }
  }
}

function save(s: Saved) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // private mode: progress isn't kept across reloads
  }
}

function finish(voiceId: string | null) {
  try {
    sessionStorage.removeItem(KEY)
    if (voiceId) localStorage.setItem(VOICE_KEY, voiceId)
  } catch {
    // ignore
  }
  location.assign('/app')
}

export function Onboarding({ mode }: { mode: 'start' | 'login' }) {
  const user = useUser()
  const [s, setS] = useState<Saved>(load)
  const update = useCallback(
    (patch: Partial<Saved>) =>
      setS((prev) => {
        const next = { ...prev, ...patch }
        save(next)
        return next
      }),
    [],
  )

  useEffect(() => {
    document.title = mode === 'login' ? 'Log in — Unspoken' : 'Get started — Unspoken'
  }, [mode])

  useEffect(() => {
    if (user) location.replace('/app') // already signed in
  }, [user])

  const at = STEPS.indexOf(s.step)

  return (
    <div className="ob">
      <header className="ob-top">
        <a href="/" className="ob-brand" aria-label="Unspoken, home">
          <Wordmark />
        </a>
        <a className="ob-toplink" href={mode === 'start' ? '/login' : '/start'}>
          {mode === 'start' ? 'Log in' : 'Get started'}
        </a>
      </header>

      {mode === 'start' && (
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={at + 1} aria-label={`Step ${at + 1} of 3`}>
          {STEPS.map((st, i) => (
            <i key={st} className={i < at ? 'is-done' : i === at ? 'is-current' : ''} />
          ))}
        </div>
      )}

      <main className="ob-main" key={mode === 'login' ? 'login' : s.step}>
        {mode === 'login' ? (
          <LoginStep />
        ) : s.step === 'name' ? (
          <NameStep initial={s.name} onNext={(name) => update({ name, step: 'voice' })} />
        ) : s.step === 'voice' ? (
          <VoiceStep
            name={s.name}
            voiceId={s.voiceId}
            onVoice={(voiceId) => update({ voiceId })}
            onBack={() => update({ step: 'name' })}
            onNext={() => update({ step: 'account' })}
          />
        ) : (
          <AccountStep name={s.name} voiceId={s.voiceId} onBack={() => update({ step: 'voice' })} />
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------ shared parts */

function Screen({ ask, lede, mark, children, foot }: { ask: string; lede?: ReactNode; mark?: ReactNode; children?: ReactNode; foot?: ReactNode }) {
  return (
    <section className="ob-screen">
      {mark && <div className="ob-mark">{mark}</div>}
      <h1 className="ob-ask">{ask}</h1>
      {lede && <p className="ob-lede">{lede}</p>}
      {children && <div className="ob-body">{children}</div>}
      {foot && <div className="ob-foot">{foot}</div>}
    </section>
  )
}

const Quiet = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className="ob-quiet" onClick={onClick}>
    {children}
  </button>
)

/** Progress toward something whose length we can only estimate: eases toward 95% over
 *  roughly `expectMs`, then jumps to 100% when `done`. */
function useEta(running: boolean, done: boolean, expectMs: number) {
  const [p, setP] = useState(0)
  useEffect(() => {
    if (done) return setP(1)
    if (!running) return setP(0)
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const t = (performance.now() - t0) / expectMs
      setP(0.95 * (1 - Math.exp(-2.2 * t)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, done, expectMs])
  return p
}

function Bar({ value }: { value: number }) {
  return (
    <span className="ob-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ transform: `scaleX(${value})` }} />
    </span>
  )
}

/** Fetches a whole clip and returns a playable URL, so playback starts the moment it's asked for. */
async function fetchAudio(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error("Couldn't make that sentence. Try again.")
  return URL.createObjectURL(await res.blob())
}

function play(url: string) {
  const a = new Audio(url)
  void a.play().catch(() => {})
  return a
}

/* -------------------------------------------------------------------- name */

function NameStep({ initial, onNext }: { initial: string; onNext: (name: string) => void }) {
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onNext(name.trim())
  }
  return (
    <Screen
      ask="What should we call you?"
      lede="Next you'll record your voice, about a minute, then save it to an account."
      foot={
        <p className="ob-aside">
          Just looking? <a href="/app">Try the demo without an account</a>
        </p>
      }
    >
      <form className="ob-form" onSubmit={submit}>
        <input
          className="ob-input ob-input-big"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="given-name"
          maxLength={80}
          placeholder="Your name"
          aria-label="Your name"
        />
        <button className="ob-go" disabled={!name.trim()}>
          Continue
        </button>
      </form>
    </Screen>
  )
}

/* ------------------------------------------------------------------- voice */

/** Records one take from the microphone and reports its level, 0..1, while it runs. */
function useTake() {
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; peak: number; t0: number } | null>(null)

  const release = () => {
    const r = rec.current
    if (!r) return
    cancelAnimationFrame(r.raf)
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close()
    rec.current = null
  }
  useEffect(() => release, [])

  const start = async (onDone: (blob: Blob, peak: number) => void) => {
    // Raw audio clones better; the server evens out loudness itself
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    })
    const type = ['audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const r = { mr, stream, ctx, raf: 0, peak: 0, t0: performance.now() }
    let smooth = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      r.peak = Math.max(r.peak, peak)
      smooth = peak > smooth ? smooth + (peak - smooth) * 0.6 : smooth * 0.85
      setLevel(smooth)
      setElapsed((performance.now() - r.t0) / 1000)
      r.raf = requestAnimationFrame(tick)
    }
    tick()
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mr.onstop = () => {
      const peak = r.peak
      release()
      setRecording(false)
      setLevel(0)
      onDone(new Blob(chunks, { type: mr.mimeType }), peak)
    }
    rec.current = r
    mr.start()
    setElapsed(0)
    setRecording(true)
  }

  const stop = () => rec.current?.mr.state === 'recording' && rec.current.mr.stop()
  return { recording, level, elapsed, start, stop }
}

type Phase = 'intro' | 'record' | 'making' | 'listen'

function VoiceStep(p: { name: string; voiceId: string | null; onVoice: (id: string | null) => void; onBack: () => void; onNext: () => void }) {
  const [online, setOnline] = useState<boolean | null>(null)
  const [prompts, setPrompts] = useState<Prompts | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [phase, setPhase] = useState<Phase>(p.voiceId ? 'record' : 'intro')
  const [sample, setSample] = useState<string | null>(null) // the first sentence, ready to play

  useEffect(() => {
    checkVoicebank().then(setOnline)
    getPrompts().then(setPrompts, () => {})
  }, [])

  // A voice started earlier in this session
  const { voiceId, onVoice } = p
  useEffect(() => {
    if (!voiceId) return
    getProfile(voiceId).then(setProfile, () => {
      onVoice(null)
      setPhase('intro')
    })
  }, [voiceId, onVoice])

  if (voiceId && !profile && phase !== 'intro') return null // picking up where they left off

  if (online === false)
    return (
      <Screen
        ask={`Your voice, ${p.name}`}
        lede="Voice recording can't be reached right now. You can add your voice later from Voices in the demo."
        foot={<Quiet onClick={p.onBack}>Back</Quiet>}
      >
        <button className="ob-go" onClick={p.onNext}>
          Continue without it
        </button>
      </Screen>
    )

  if (phase === 'intro' || !profile || !prompts)
    return (
      <Intro
        name={p.name}
        count={prompts?.prompts.length ?? 8}
        ready={online === true && !!prompts}
        onBack={p.onBack}
        onSkip={p.onNext}
        onStart={async () => {
          const made = await createProfile(`${p.name}'s voice`, true)
          setProfile(made)
          p.onVoice(made.id)
          setPhase('record')
        }}
      />
    )

  if (phase === 'making')
    return (
      <Making
        profile={profile}
        sentence={prompts.preview}
        onDone={(built, url) => {
          setProfile(built)
          setSample(url)
          setPhase('listen')
        }}
        onFail={() => setPhase('record')}
      />
    )

  if (phase === 'listen')
    return (
      <Listen
        name={p.name}
        profile={profile}
        sentence={prompts.preview}
        sample={sample}
        onMore={() => setPhase('record')}
        onUse={async () => {
          if (profile.status !== 'approved') await approveProfile(profile.id)
          p.onNext()
        }}
      />
    )

  return (
    <Record
      profile={profile}
      prompts={prompts.prompts}
      onSaved={setProfile}
      onBuild={() => setPhase('making')}
      onBack={p.onBack}
      onSkip={p.onNext}
    />
  )
}

function Intro(p: { name: string; count: number; ready: boolean; onBack: () => void; onSkip: () => void; onStart: () => Promise<void> }) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Screen
      ask={`Now your voice, ${p.name}`}
      lede={`Read ${p.count} short sentences out loud, one at a time. Somewhere quiet, in your normal voice. About a minute.`}
      foot={
        <>
          <Quiet onClick={p.onBack}>Back</Quiet>
          <Quiet onClick={p.onSkip}>Skip for now</Quiet>
        </>
      }
    >
      <label className="ob-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>This is my own voice, and Unspoken can keep these recordings to build it.</span>
      </label>
      <button
        className="ob-go"
        disabled={!consent || busy || !p.ready}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await p.onStart()
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        {busy ? 'Getting ready' : 'Start recording'}
      </button>
      {error && <p className="ob-error">{error}</p>}
    </Screen>
  )
}

function Record(p: { profile: Profile; prompts: string[]; onSaved: (p: Profile) => void; onBuild: () => void; onBack: () => void; onSkip: () => void }) {
  const take = useTake()
  const total = p.prompts.length
  const takes = p.profile.media.filter((m) => m.kind === 'recording')
  const takeFor = (i: number) => takes.find((m) => m.prompt === i)
  const doneSet = new Set(takes.filter((m) => m.status === 'ready').map((m) => m.prompt))
  const firstOpen = [...Array(total).keys()].find((i) => !doneSet.has(i))
  const [index, setIndex] = useState(firstOpen ?? 0)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const current = takeFor(index)
  const seconds = p.profile.speech_seconds

  const record = async () => {
    setNote(null)
    try {
      await take.start(async (blob, peak) => {
        if (peak > 0.98) setNote('That was very loud. Sit back a little if it sounds harsh.')
        else if (peak < 0.05) setNote('That was very quiet. Move a little closer.')
        setSaving(true)
        try {
          const saved = await addRecording(p.profile.id, index, blob)
          p.onSaved(saved)
          const done = new Set(saved.media.filter((m) => m.kind === 'recording' && m.status === 'ready').map((m) => m.prompt))
          const next = [...Array(total).keys()].find((i) => i > index && !done.has(i)) ?? [...Array(total).keys()].find((i) => !done.has(i))
          if (next !== undefined) setIndex(next)
        } catch (err) {
          setNote((err as Error).message)
        } finally {
          setSaving(false)
        }
      })
    } catch {
      setNote('Unspoken needs your microphone. Allow it in the browser and try again.')
    }
  }

  return (
    <Screen
      mark={<MouthDrawing jaw={take.recording ? Math.min(0.4, take.level * 1.4) : 0.04} />}
      ask={p.prompts[index]}
      foot={
        <>
          <Quiet onClick={p.onBack}>Back</Quiet>
          <Quiet onClick={p.onSkip}>Skip for now</Quiet>
        </>
      }
    >
      <div className="ob-recrow">
        <button
          className={`ob-rec ${take.recording ? 'is-on' : ''}`}
          onClick={take.recording ? take.stop : record}
          disabled={saving}
          aria-label={take.recording ? 'Stop recording' : current ? 'Record this sentence again' : 'Record this sentence'}
        >
          <i />
        </button>
        <div className="ob-status" aria-live="polite">
          {take.recording ? (
            <>
              <b className="ob-live">
                Recording <span className="mono">{take.elapsed.toFixed(1)} s</span>
              </b>
              <span>Press again when you've read the sentence</span>
            </>
          ) : saving ? (
            <b>Saving</b>
          ) : current?.status === 'ready' ? (
            <>
              <b>
                Recorded <span className="mono muted">{current.duration_s.toFixed(1)} s</span>
              </b>
              <span>
                <button className="ob-inline" onClick={() => play(mediaUrl(p.profile.id, current.id))}>
                  Play it back
                </button>{' '}
                or record it again
              </span>
            </>
          ) : current?.status === 'failed' ? (
            <b className="ob-error">{current.error}</b>
          ) : (
            <>
              <b>Press record, then read it out loud</b>
              <span>Sentence {index + 1} of {total}</span>
            </>
          )}
        </div>
      </div>
      {note && <p className="ob-note">{note}</p>}

      <div className="ob-tally">
        <ol className="ob-dots" aria-label="Sentences">
          {p.prompts.map((text, i) => {
            const t = takeFor(i)
            return (
              <li key={i}>
                <button
                  className={`${i === index ? 'is-current' : ''} ${t?.status === 'ready' ? 'is-done' : ''}`}
                  onClick={() => !take.recording && setIndex(i)}
                  aria-label={`Sentence ${i + 1}${t?.status === 'ready' ? ', recorded' : ''}: ${text}`}
                  aria-current={i === index ? 'step' : undefined}
                />
              </li>
            )
          })}
        </ol>
        <span className="ob-seconds mono">
          {seconds.toFixed(0)} s recorded{seconds < MIN_S ? ` · ${MIN_S} s needed` : ''}
        </span>
      </div>

      {p.profile.can_build && (
        <button className="ob-go" onClick={p.onBuild} disabled={take.recording || saving}>
          {doneSet.size < total ? 'Make my voice now' : 'Make my voice'}
        </button>
      )}
    </Screen>
  )
}

/** Its own step: build the voice, then generate a first sentence in it, with progress. */
function Making(p: { profile: Profile; sentence: string; onDone: (built: Profile, sample: string | null) => void; onFail: () => void }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0) // building, first sentence, done
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const build = useEta(stage === 0, stage > 0, 5000)
  const speak = useEta(stage === 1, stage > 1, 12000) // CPU servers take ~2x the length of the sentence
  const progress = stage === 0 ? build * 0.4 : stage === 1 ? 0.4 + speak * 0.6 : 1

  const { profile, sentence, onDone } = p
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const built = await buildProfile(profile.id)
        setStage(1)
        let url: string | null = null
        try {
          url = await fetchAudio(speakUrl(profile.id, sentence))
        } catch {
          // the voice is built; the sample can be made on the next screen instead
        }
        setStage(2)
        setTimeout(() => onDone(built, url), 400)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [profile.id, sentence, onDone])

  const steps = ['Building it from your recordings', 'Saying a first sentence as you']
  return (
    <Screen
      mark={<MouthDrawing live />}
      ask="Making your voice"
      lede="This takes a few seconds. Keep this page open."
      foot={error ? <Quiet onClick={p.onFail}>Back to recording</Quiet> : undefined}
    >
      <div className="ob-making">
        <Bar value={progress} />
        <ol className="ob-stages">
          {steps.map((label, i) => (
            <li key={label} className={stage > i ? 'is-done' : stage === i ? 'is-current' : ''}>
              {label}
            </li>
          ))}
        </ol>
      </div>
      {error && <p className="ob-error">{error}</p>}
    </Screen>
  )
}

function Listen(p: { name: string; profile: Profile; sentence: string; sample: string | null; onMore: () => void; onUse: () => Promise<void> }) {
  const [text, setText] = useState('')
  const [making, setMaking] = useState<string | null>(null) // text being generated
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const progress = useEta(!!making, false, Math.max(4000, (making?.length ?? 0) * 180))

  const say = async (t: string, ready?: string | null) => {
    setError(null)
    if (ready) return void play(ready)
    setMaking(t)
    try {
      play(await fetchAudio(speakUrl(p.profile.id, t)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMaking(null)
    }
  }

  return (
    <Screen
      mark={<MouthDrawing jaw={0.18} />}
      ask={`This is you, ${p.name}`}
      lede="Unspoken, speaking in the voice you just recorded."
      foot={
        <>
          <Quiet onClick={p.onMore}>Record more sentences</Quiet>
        </>
      }
    >
      <button className="ob-sample" onClick={() => say(p.sentence, p.sample)} disabled={!!making}>
        <span className="ob-play" aria-hidden>
          <svg viewBox="0 0 20 20">
            <path d="M6.5 4.5v11l9-5.5z" fill="currentColor" />
          </svg>
        </span>
        <span>“{p.sentence}”</span>
      </button>

      <form
        className="ob-say"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim() && !making) void say(text.trim())
        }}
      >
        <input className="ob-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type something to hear it" aria-label="Text to hear in your voice" />
        <button className="ob-secondary" disabled={!text.trim() || !!making}>
          Hear it
        </button>
      </form>
      {making && (
        <div className="ob-saying">
          <Bar value={progress} />
          <span>Saying “{making}”</span>
        </div>
      )}
      {error && <p className="ob-error">{error}</p>}

      <button
        className="ob-go"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await p.onUse()
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        {busy ? 'Saving' : 'Use this voice'}
      </button>
    </Screen>
  )
}

/* ----------------------------------------------------------------- account */

function AccountForm({ submitLabel, onSubmit, newPassword }: { submitLabel: string; onSubmit: (u: string, pw: string) => Promise<unknown>; newPassword: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(username.trim(), password)
    } catch (err) {
      const msg = (err as Error).message
      setError(msg === 'Failed to fetch' ? "Can't reach Unspoken's account server. Try again in a moment." : msg)
      setBusy(false)
    }
  }

  return (
    <form className="ob-form" onSubmit={submit}>
      <label className="ob-field">
        <span>Username</span>
        <input className="ob-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus />
      </label>
      <label className="ob-field">
        <span>Password</span>
        <input className="ob-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={newPassword ? 'new-password' : 'current-password'} />
        {newPassword && <small>At least 8 characters</small>}
      </label>
      {error && <p className="ob-error">{error}</p>}
      <button className="ob-go" disabled={busy || !username.trim() || !password}>
        {busy ? 'One moment' : submitLabel}
      </button>
    </form>
  )
}

function AccountStep({ name, voiceId, onBack }: { name: string; voiceId: string | null; onBack: () => void }) {
  return (
    <Screen
      ask={voiceId ? 'Keep your voice' : `Make your account, ${name}`}
      lede={voiceId ? "Choose a username and password. Your voice will be ready whenever you log in." : 'You can record your voice later from Voices in the demo.'}
      foot={<Quiet onClick={onBack}>Back</Quiet>}
    >
      <AccountForm
        submitLabel="Create account"
        newPassword
        onSubmit={async (u, pw) => {
          await signup(u, pw, name)
          finish(voiceId)
        }}
      />
    </Screen>
  )
}

function LoginStep() {
  return (
    <Screen
      ask="Welcome back"
      lede="Log in and the demo speaks in your saved voice."
      foot={
        <p className="ob-aside">
          New here? <a href="/start">Get started</a>
        </p>
      }
    >
      <AccountForm
        submitLabel="Log in"
        newPassword={false}
        onSubmit={async (u, pw) => {
          await login(u, pw)
          finish(null)
        }}
      />
    </Screen>
  )
}
