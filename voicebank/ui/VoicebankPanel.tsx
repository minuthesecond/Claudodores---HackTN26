import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addRecording,
  approveProfile,
  buildProfile,
  createProfile,
  deleteMedia,
  deleteProfile,
  getProfile,
  getPrompts,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADS,
  mediaUrl,
  redoProfile,
  speakUrl,
  uploadMedia,
  type Media,
  type Profile,
  type Prompts,
} from './api'
import './voicebank.css'

type Props = {
  open: boolean
  onClose: () => void
  profiles: Profile[]
  refresh: () => Promise<void>
  /** Called when a voice is approved, so the reader can switch to it. */
  onUse: (id: string) => void
}

type View = { name: 'list' } | { name: 'new' } | { name: 'voice'; id: string }

const STATUS_LABEL: Record<Profile['status'], string> = {
  draft: 'Recording',
  building: 'Building',
  preview: 'Ready to preview',
  approved: 'In use',
  failed: 'Build failed',
}

// One <audio> for every playback in the panel, so two clips never talk over each other
let player: HTMLAudioElement | null = null
function play(url: string) {
  player?.pause()
  player = new Audio(url)
  void player.play()
  return player
}

/** Slide-over in the reader for banking voices: list, create, record, build, preview, approve. */
export function VoicebankPanel({ open, onClose, profiles, refresh, onUse }: Props) {
  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    if (!open) return
    void refresh()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, refresh])

  useEffect(() => {
    if (!open) player?.pause()
  }, [open])

  if (!open) return null
  return (
    <div className="vb-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="vb-panel" role="dialog" aria-label="Voices">
        <header className="vb-head">
          {view.name !== 'list' && (
            <button className="vb-back" onClick={() => setView({ name: 'list' })} aria-label="Back to voices">
              ←
            </button>
          )}
          <h2>{view.name === 'new' ? 'New voice' : view.name === 'voice' ? 'Bank a voice' : 'Voices'}</h2>
          <button className="vb-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {view.name === 'list' && (
          <VoiceList
            profiles={profiles}
            onOpen={(id) => setView({ name: 'voice', id })}
            onNew={() => setView({ name: 'new' })}
            refresh={refresh}
          />
        )}
        {view.name === 'new' && (
          <NewVoice
            onCreated={(p) => {
              void refresh()
              setView({ name: 'voice', id: p.id })
            }}
          />
        )}
        {view.name === 'voice' && (
          <VoiceDetail
            id={view.id}
            onApproved={(id) => {
              void refresh()
              onUse(id)
            }}
            onChanged={refresh}
          />
        )}
      </aside>
    </div>
  )
}

function VoiceList(p: { profiles: Profile[]; onOpen: (id: string) => void; onNew: () => void; refresh: () => Promise<void> }) {
  const remove = async (v: Profile) => {
    if (!confirm(`Delete ${v.name}'s voice? This removes every recording and can't be undone.`)) return
    await deleteProfile(v.id)
    await p.refresh()
  }
  return (
    <div className="vb-body">
      <p className="vb-lede">
        Bank a patient's voice before they lose it. Unspoken then speaks every sentence it reads in that voice.
      </p>
      <button className="btn-solid vb-wide" onClick={p.onNew}>
        New voice
      </button>
      {p.profiles.length > 0 && (
        <ul className="vb-list">
          {p.profiles.map((v) => (
            <li key={v.id}>
              <button className="vb-row" onClick={() => p.onOpen(v.id)}>
                <span className="vb-row-name">{v.name}</span>
                <span className={`vb-pill vb-pill-${v.status}`}>{STATUS_LABEL[v.status]}</span>
                <span className="vb-row-meta">{v.speech_seconds.toFixed(0)} s of speech</span>
              </button>
              <button className="vb-delete" onClick={() => remove(v)} aria-label={`Delete ${v.name}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewVoice({ onCreated }: { onCreated: (p: Profile) => void }) {
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createProfile(name, consent))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="vb-body" onSubmit={submit}>
      <label className="vb-field">
        <span>Patient's name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Lopez" autoFocus maxLength={80} />
      </label>
      <label className="vb-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I am the patient, or I'm authorized by them or their family, to record and clone this voice. It is used only
          to speak for the patient and can be deleted at any time.
        </span>
      </label>
      {error && <p className="vb-error">{error}</p>}
      <button className="btn-solid vb-wide" disabled={!name.trim() || !consent || busy}>
        {busy ? 'Creating' : 'Create and start recording'}
      </button>
    </form>
  )
}

function VoiceDetail({ id, onApproved, onChanged }: { id: string; onApproved: (id: string) => void; onChanged: () => Promise<void> }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [prompts, setPrompts] = useState<Prompts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setProfile(await getProfile(id))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id])

  useEffect(() => {
    void load()
    getPrompts().then(setPrompts, (err) => setError((err as Error).message))
  }, [load])

  // Poll while the server is working on this voice
  const working = profile?.status === 'building' || profile?.phrases.warming || !!profile?.processing
  useEffect(() => {
    if (!working) return
    const t = setInterval(load, 1000)
    return () => clearInterval(t)
  }, [working, load])

  const run = async (label: string, fn: () => Promise<Profile>) => {
    setBusy(label)
    setError(null)
    try {
      setProfile(await fn())
      void onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!profile || !prompts) return <div className="vb-body">{error ? <p className="vb-error">{error}</p> : 'Loading'}</div>

  const built = profile.status === 'preview' || profile.status === 'approved'
  return (
    <div className="vb-body">
      <div className="vb-title">
        <h3>{profile.name}</h3>
        <span className={`vb-pill vb-pill-${profile.status}`}>{STATUS_LABEL[profile.status]}</span>
      </div>

      <section>
        <h4>1. Read these aloud</h4>
        <p className="vb-hint">A quiet room, normal voice, phone or laptop mic about an arm's length away.</p>
        <Recorder profile={profile} prompts={prompts.prompts} onSaved={(p) => (setProfile(p), void onChanged())} />
      </section>

      <section>
        <h4>Or add old videos of them talking</h4>
        <p className="vb-hint">
          Birthday clips, phone videos, voicemails. Background music and noise are removed; only the audio is kept.
          For now, pick clips where they're the only one talking.
        </p>
        <Uploads profile={profile} onChanged={(p) => (setProfile(p), void onChanged())} />
        <div className="vb-total">
          <strong>{profile.speech_seconds.toFixed(0)} s</strong> of speech recorded
          {profile.warnings.map((w) => (
            <p key={w} className="vb-warn">
              {w}
            </p>
          ))}
        </div>
      </section>

      <section>
        <h4>2. Build the voice</h4>
        <button
          className="btn-solid vb-wide"
          disabled={!profile.can_build || profile.status === 'building' || !!busy}
          onClick={() => run('build', () => buildProfile(id))}
        >
          {profile.status === 'building' || busy === 'build'
            ? 'Building (a few seconds)'
            : profile.processing
              ? 'Waiting for uploads to finish'
              : built
                ? 'Rebuild voice'
                : 'Build voice'}
        </button>
        {profile.status === 'failed' && profile.error && <p className="vb-error">{profile.error}</p>}
      </section>

      {built && (
        <section>
          <h4>3. Listen, then approve</h4>
          <Preview id={id} sentence={prompts.preview} />
          {profile.status === 'approved' ? (
            <p className="vb-ok">
              In use.{' '}
              {profile.phrases.done < profile.phrases.total
                ? `Preparing common phrases ${profile.phrases.done}/${profile.phrases.total}`
                : 'Common phrases are ready to play instantly.'}
            </p>
          ) : (
            <div className="vb-actions">
              <button
                className="btn-solid"
                disabled={!!busy}
                onClick={() =>
                  run('approve', async () => {
                    const p = await approveProfile(id)
                    onApproved(id)
                    return p
                  })
                }
              >
                Use this voice
              </button>
              <button className="btn" disabled={!!busy} onClick={() => run('redo', () => redoProfile(id))}>
                Redo
              </button>
            </div>
          )}
        </section>
      )}
      {error && <p className="vb-error">{error}</p>}
    </div>
  )
}

function Preview({ id, sentence }: { id: string; sentence: string }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const say = (t: string) => {
    setLoading(true)
    const a = play(speakUrl(id, t))
    const done = () => setLoading(false)
    a.addEventListener('playing', done, { once: true })
    a.addEventListener('error', done, { once: true })
  }
  return (
    <div className="vb-preview">
      <button className="btn vb-wide" onClick={() => say(sentence)} disabled={loading}>
        ▶ {loading ? 'Generating' : `"${sentence}"`}
      </button>
      <form
        className="vb-say"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) say(text)
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type anything to hear it" />
        <button className="btn" disabled={!text.trim() || loading}>
          Say
        </button>
      </form>
    </div>
  )
}

type Sending = { key: number; name: string; frac: number; error?: string }

function stageLabel(m: Media) {
  if (m.status === 'failed') return m.error ?? 'Failed'
  if (m.status === 'ready') return `${m.duration_s.toFixed(0)} s of speech`
  if (m.stage === 'separating') return `Removing background sound ${Math.round((m.progress ?? 0) * 100)}%`
  return 'Waiting to process'
}

/** Old videos: drag in or pick files, see each one through upload → background removal → ready. */
function Uploads({ profile, onChanged }: { profile: Profile; onChanged: (p: Profile) => void }) {
  const [sending, setSending] = useState<Sending[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const uploads = profile.media.filter((m) => m.kind === 'upload')
  const live = uploads.filter((m) => m.status !== 'failed').length

  const add = async (files: File[]) => {
    setNote(null)
    const room = MAX_UPLOADS - live - sending.length
    if (files.length > room) setNote(`A voice can have ${MAX_UPLOADS} uploads; only the first ${Math.max(0, room)} were added.`)
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = Math.random()
      if (file.size > MAX_UPLOAD_BYTES) {
        setSending((s) => [...s, { key, name: file.name, frac: 0, error: 'Over 500 MB; trim it or pick a shorter clip' }])
        continue
      }
      setSending((s) => [...s, { key, name: file.name, frac: 0 }])
      try {
        const p = await uploadMedia(profile.id, file, (frac) =>
          setSending((s) => s.map((x) => (x.key === key ? { ...x, frac } : x))),
        )
        setSending((s) => s.filter((x) => x.key !== key))
        onChanged(p)
      } catch (err) {
        setSending((s) => s.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)))
      }
    }
  }

  const remove = async (m: Media) => onChanged(await deleteMedia(profile.id, m.id))

  return (
    <>
      <div
        className={`vb-drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void add([...e.dataTransfer.files])
        }}
      >
        <p>Drop videos or audio here</p>
        <button className="btn" onClick={() => input.current?.click()} disabled={live + sending.length >= MAX_UPLOADS}>
          Choose files
        </button>
        <span className="vb-meta">Up to {MAX_UPLOADS} files, 500 MB and 15 min each</span>
        <input
          ref={input}
          type="file"
          accept="video/*,audio/*"
          multiple
          hidden
          onChange={(e) => {
            void add([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>

      {(sending.length > 0 || uploads.length > 0) && (
        <ul className="vb-uploads">
          {sending.map((s) => (
            <li key={s.key} className={s.error ? 'is-failed' : ''}>
              <span className="vb-upload-name">{s.name}</span>
              <span className="vb-upload-stage">{s.error ?? `Uploading ${Math.round(s.frac * 100)}%`}</span>
              {!s.error && <Progress frac={s.frac} />}
              {s.error && (
                <button className="vb-play" onClick={() => setSending((x) => x.filter((y) => y.key !== s.key))}>
                  Dismiss
                </button>
              )}
            </li>
          ))}
          {uploads.map((m) => (
            <li key={m.id} className={m.status === 'failed' ? 'is-failed' : m.status === 'ready' ? 'is-done' : ''}>
              <span className="vb-upload-name">{m.filename}</span>
              <span className="vb-upload-stage">{stageLabel(m)}</span>
              {m.status === 'processing' && <Progress frac={m.stage === 'separating' ? (m.progress ?? 0) : 0} />}
              <span className="vb-upload-actions">
                {m.status === 'ready' && (
                  <button className="vb-play" onClick={() => play(mediaUrl(profile.id, m.id))}>
                    ▶ Play
                  </button>
                )}
                <button className="vb-play" onClick={() => remove(m)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="vb-warn">{note}</p>}
    </>
  )
}

function Progress({ frac }: { frac: number }) {
  return (
    <span className="vb-meter vb-progress" aria-hidden>
      <span style={{ transform: `scaleX(${frac})` }} />
    </span>
  )
}

/** Guided recording: one take per prompt, re-recordable, with a live level meter. */
function Recorder({ profile, prompts, onSaved }: { profile: Profile; prompts: string[]; onSaved: (p: Profile) => void }) {
  const [active, setActive] = useState<number | null>(null)
  const [saving, setSaving] = useState<number | null>(null)
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; peak: number } | null>(null)

  const stopAll = () => {
    const r = rec.current
    if (!r) return
    cancelAnimationFrame(r.raf)
    r.stream.getTracks().forEach((t) => t.stop())
    void r.ctx.close()
    rec.current = null
  }
  useEffect(() => stopAll, [])

  const start = async (i: number) => {
    setNote(null)
    let stream: MediaStream
    try {
      // Raw audio clones better; the server normalizes loudness itself
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      })
    } catch {
      return setNote('Microphone permission was denied.')
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const r = { mr, stream, ctx, raf: 0, peak: 0 }
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
      r.peak = Math.max(r.peak, peak)
      setLevel(peak)
      r.raf = requestAnimationFrame(tick)
    }
    tick()

    const chunks: Blob[] = []
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mr.onstop = async () => {
      const peak = r.peak
      stopAll()
      setActive(null)
      setLevel(0)
      if (peak > 0.98) setNote('That take clipped (too loud). Move back a little and re-record if it sounds harsh.')
      else if (peak < 0.05) setNote('That take was very quiet. Move closer to the mic.')
      setSaving(i)
      try {
        onSaved(await addRecording(profile.id, i, new Blob(chunks, { type: mr.mimeType })))
      } catch (err) {
        setNote((err as Error).message)
      } finally {
        setSaving(null)
      }
    }
    rec.current = r
    mr.start()
    setActive(i)
  }

  const stop = () => rec.current?.mr.state === 'recording' && rec.current.mr.stop()

  return (
    <>
      <ol className="vb-prompts">
        {prompts.map((text, i) => {
          const take = profile.media.find((m) => m.kind === 'recording' && m.prompt === i)
          const isActive = active === i
          return (
            <li key={i} className={isActive ? 'is-active' : take?.status === 'ready' ? 'is-done' : ''}>
              <p>{text}</p>
              <div className="vb-prompt-row">
                {isActive ? (
                  <button className="vb-rec is-on" onClick={stop}>
                    ■ Stop
                  </button>
                ) : (
                  <button className="vb-rec" onClick={() => start(i)} disabled={active !== null || saving !== null}>
                    ● {take ? 'Re-record' : 'Record'}
                  </button>
                )}
                {isActive && (
                  <span className="vb-meter" aria-hidden>
                    <span style={{ transform: `scaleX(${Math.min(1, level * 1.6)})` }} />
                  </span>
                )}
                {saving === i && <span className="vb-meta">Saving</span>}
                {!isActive && saving !== i && take?.status === 'ready' && (
                  <button className="vb-play" onClick={() => play(mediaUrl(profile.id, take.id))}>
                    ▶ {take.duration_s.toFixed(1)} s
                  </button>
                )}
                {!isActive && take?.status === 'failed' && <span className="vb-error">{take.error}</span>}
              </div>
            </li>
          )
        })}
      </ol>
      {note && <p className="vb-warn">{note}</p>}
    </>
  )
}
