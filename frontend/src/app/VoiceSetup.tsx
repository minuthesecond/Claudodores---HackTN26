import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
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
  speakUrl,
  uploadMedia,
  type Media,
  type Profile,
} from '@voicebank'
import { sentence } from './conversation'

// Same as voicebank/banking.py: a voice can be made from 6 s of speech, and sounds most like them from 30 s
const MIN_SPEECH_S = 6
const TARGET_SPEECH_S = 30

const STATUS: Record<Profile['status'], string> = {
  draft: 'Collecting',
  building: 'Making',
  preview: 'Ready to hear',
  approved: 'Approved',
  failed: 'Failed',
}

// One player for every clip on the page, so two never talk over each other
let player: HTMLAudioElement | null = null
function play(url: string) {
  player?.pause()
  player = new Audio(url)
  player.play().catch(() => {})
  return player
}

const firstName = (p: Profile) => p.name.trim().split(/\s+/)[0] || p.name

type Props = {
  online: boolean
  profiles: Profile[]
  refresh: () => Promise<void>
  /** the voice the bedside speaks in, or null for the standard voice */
  chosen: string | null
  onChoose: (id: string | null) => void
  signedIn: boolean
}

/** For the family: make the patient's voice from home videos, hear it, and approve it for the bedside. */
export function VoiceSetup({ online, profiles, refresh, chosen, onChoose, signedIn }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useEffect(() => () => player?.pause(), [])

  if (!online)
    return (
      <div className="voice">
        <div className="panel">
          <p className="eyebrow">Voice setup</p>
          <h2>The voice server isn't reachable</h2>
          <p className="fine">Voices can't be made or changed until it's back. The bedside keeps speaking in the standard voice.</p>
        </div>
      </div>
    )

  const open = creating ? undefined : (profiles.find((p) => p.id === openId) ?? profiles.find((p) => p.id === chosen) ?? profiles[0])
  const inUse = profiles.find((p) => p.id === chosen && p.status === 'approved')

  return (
    <div className="voice">
      <header className="voice-head">
        <div>
          <p className="eyebrow">Voice setup</p>
          <h2>Voices</h2>
        </div>
        <p className="voice-using">
          <span className="eyebrow">Bedside speaks in</span>
          <b>{inUse ? `${inUse.name}'s voice` : 'The standard voice'}</b>
          {inUse && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChoose(null)}>
              Use the standard voice
            </button>
          )}
        </p>
      </header>

      {profiles.length > 0 && (
        <div className="voice-tabs" role="group" aria-label="Voices">
          {profiles.map((p) => (
            <button key={p.id} type="button" className="voice-tab" aria-pressed={p === open} onClick={() => (setCreating(false), setOpenId(p.id))}>
              <b>{p.name}</b>
              <span className="tag">{p.id === chosen && p.status === 'approved' ? 'At bedside' : STATUS[p.status]}</span>
            </button>
          ))}
          <button type="button" className="voice-tab is-new" aria-pressed={creating} onClick={() => setCreating(true)}>
            <b>+ New voice</b>
          </button>
        </div>
      )}

      {!signedIn && (
        <p className="fine">
          You're not signed in, so voices are kept in this browser. <a href="/login">Log in</a> or{' '}
          <a href="/start">create an account</a> to keep them.
        </p>
      )}

      {open ? (
        <VoiceDetail
          key={open.id}
          id={open.id}
          chosen={chosen}
          onChoose={onChoose}
          onChanged={refresh}
          onDeleted={() => {
            if (chosen === open.id) onChoose(null)
            setOpenId(null)
            void refresh()
          }}
        />
      ) : (
        <NewVoice
          onCancel={profiles.length ? () => setCreating(false) : undefined}
          onCreated={(p) => {
            setCreating(false)
            setOpenId(p.id)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

function NewVoice({ onCreated, onCancel }: { onCreated: (p: Profile) => void; onCancel?: () => void }) {
  const [name, setName] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createProfile(name.trim(), consent))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="panel new-voice" onSubmit={submit}>
      <p className="eyebrow">New voice</p>
      <h2>Whose voice is this?</h2>
      <label className="field">
        <span className="eyebrow">Patient's name</span>
        <input id="voice-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" autoFocus />
      </label>
      <label className="consent">
        <input id="voice-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I am the patient, or I'm authorized by them or their family, to record and clone this voice. It is used only
          to speak for the patient and can be deleted at any time.
        </span>
      </label>
      {error && <p className="err">✕ {error}</p>}
      <div className="actions">
        <button className="btn btn-primary" disabled={!name.trim() || !consent || busy}>
          {busy ? 'Creating' : 'Create voice'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

type Mark = 'done' | 'busy' | 'todo' | 'fail'
const MARK: Record<Mark, string> = { done: '✓', busy: '●', todo: '○', fail: '✕' }

function VoiceDetail(p: { id: string; chosen: string | null; onChoose: (id: string) => void; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const { id, onChanged } = p
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sample, setSample] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      setProfile(await getProfile(id))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id])

  useEffect(() => {
    void load()
    getPrompts().then((pr) => setSample(pr.preview), () => {})
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

  if (!profile) return <div className="panel">{error ? <p className="err">✕ {error}</p> : <p className="fine">Loading</p>}</div>

  const first = firstName(profile)
  const built = profile.status === 'preview' || profile.status === 'approved'
  const ready = profile.media.filter((m) => m.status === 'ready').length
  const processing = profile.media.filter((m) => m.status === 'processing').length
  const { done, total } = profile.phrases
  const steps: [Mark, string][] = [
    [ready ? 'done' : 'todo', ready ? `${ready} ${ready === 1 ? 'clip' : 'clips'} with ${first}'s speech` : `Add a video of ${first} talking`],
    ...(processing ? [['busy', `Finding ${first}'s voice in ${processing} more`] as [Mark, string]] : []),
    profile.status === 'building'
      ? ['busy', 'Making the voice']
      : profile.status === 'failed'
        ? ['fail', 'Making the voice failed']
        : [built ? 'done' : 'todo', built ? 'Voice made' : 'Make the voice'],
    profile.status === 'approved'
      ? done < total
        ? ['busy', `Preparing common phrases ${done}/${total}`]
        : ['done', 'Approved for the bedside']
      : ['todo', 'Listen, then approve'],
  ]

  const say = () => {
    if (!sample) return
    setLoading(true)
    const a = play(speakUrl(id, sample))
    const stop = () => setLoading(false)
    a.addEventListener('playing', stop, { once: true })
    a.addEventListener('error', stop, { once: true })
  }

  const remove = async () => {
    if (!confirming) return setConfirming(true)
    try {
      await deleteProfile(id)
      p.onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setConfirming(false)
    }
  }

  const canRebuild = profile.can_build && !processing && !busy
  const atBedside = p.chosen === id && profile.status === 'approved'

  return (
    <div className="voice-grid">
      <section className="panel">
        <p className="eyebrow">01 · Videos</p>
        <h2>Videos of {first} talking</h2>
        <p className="fine">
          Birthdays, voicemails, phone clips: any video where {first} speaks clearly and is the only one talking. Music and
          background noise are removed, and only the audio is kept.
        </p>
        <Uploads profile={profile} first={first} onChanged={(next) => (setProfile(next), void onChanged())} />
      </section>

      <section className="panel">
        <p className="eyebrow">02 · Voice</p>
        <h2>{first}'s voice</h2>
        <div className="meter">
          <p>
            <b className="num">{Math.round(profile.speech_seconds)} s</b> of clear speech
            <span className="fine"> · {TARGET_SPEECH_S} s sounds most like {first}</span>
          </p>
          <div className="bar">
            <i style={{ width: `${Math.min(100, (profile.speech_seconds / TARGET_SPEECH_S) * 100)}%` }} />
            <span className="bar-min" style={{ left: `${(MIN_SPEECH_S / TARGET_SPEECH_S) * 100}%` }} title={`${MIN_SPEECH_S} s minimum`} />
          </div>
        </div>
        <ol className="checklist">
          {steps.map(([mark, text]) => (
            <li key={text} className={`is-${mark}`}>
              <span className="mark" aria-hidden>
                {MARK[mark]}
              </span>
              {text}
            </li>
          ))}
        </ol>
        {profile.status === 'failed' && profile.error && <p className="err">✕ {profile.error}</p>}
        {profile.warnings.map((w) => (
          <p key={w} className="note">
            <b aria-hidden>!</b> {w}
          </p>
        ))}

        {built && sample && (
          <div className="sample">
            <button type="button" className="play" onClick={say} disabled={loading} aria-label={`Play a sample of ${first}'s voice`}>
              {loading ? '…' : '▶'}
            </button>
            <p>“{sentence(sample)}”</p>
          </div>
        )}

        <div className="actions">
          {!built && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!profile.can_build || !!processing || profile.status === 'building' || !!busy}
              onClick={() => run('build', () => buildProfile(id))}
            >
              {profile.status === 'building' || busy === 'build'
                ? 'Making the voice'
                : processing
                  ? 'Waiting for videos to finish'
                  : profile.can_build
                    ? `Make ${first}'s voice`
                    : `Needs ${MIN_SPEECH_S} s of speech`}
            </button>
          )}
          {profile.status === 'preview' && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!busy}
              onClick={() =>
                run('approve', async () => {
                  const next = await approveProfile(id)
                  p.onChoose(id)
                  return next
                })
              }
            >
              Use this voice at the bedside
            </button>
          )}
          {profile.status === 'approved' &&
            (atBedside ? (
              <p className="ok">✓ In use at the bedside</p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => p.onChoose(id)}>
                Use at the bedside
              </button>
            ))}
          {built && (
            <button type="button" className="btn btn-line" disabled={!canRebuild} onClick={() => run('build', () => buildProfile(id))}>
              {busy === 'build' ? 'Rebuilding' : 'Rebuild with new videos'}
            </button>
          )}
        </div>
        {error && <p className="err">✕ {error}</p>}
        <button type="button" className="btn btn-quiet btn-sm voice-delete" onClick={remove} onBlur={() => setConfirming(false)}>
          {confirming ? `Tap again to delete ${first}'s voice and every clip` : 'Delete this voice'}
        </button>
      </section>
    </div>
  )
}

type Sending = { key: number; name: string; frac: number; error?: string }

function stage(m: Media, first: string): { text: string; frac?: number; mark: Mark } {
  if (m.status === 'failed') return { text: m.error ?? 'No clear speech found', mark: 'fail' }
  if (m.status === 'ready') return { text: `${m.duration_s.toFixed(0)} s of ${first} speaking found`, mark: 'done' }
  if (m.stage === 'separating') return { text: `Separating ${first}'s voice from background sound`, frac: m.progress ?? 0, mark: 'busy' }
  return { text: 'Waiting its turn', frac: 0, mark: 'busy' }
}

/** Drag in or pick files, then follow each one through upload, voice separation and ready. */
function Uploads({ profile, first, onChanged }: { profile: Profile; first: string; onChanged: (p: Profile) => void }) {
  const [sending, setSending] = useState<Sending[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const uploads = profile.media.filter((m) => m.kind === 'upload')
  const live = uploads.filter((m) => m.status !== 'failed').length
  const full = live + sending.length >= MAX_UPLOADS

  const add = async (files: File[]) => {
    setNote(null)
    const room = MAX_UPLOADS - live - sending.length
    if (files.length > room) setNote(`A voice can have ${MAX_UPLOADS} videos; only the first ${Math.max(0, room)} were added.`)
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = Math.random()
      if (file.size > MAX_UPLOAD_BYTES) {
        setSending((s) => [...s, { key, name: file.name, frac: 0, error: 'Over 500 MB. Trim it or pick a shorter clip.' }])
        continue
      }
      setSending((s) => [...s, { key, name: file.name, frac: 0 }])
      try {
        const next = await uploadMedia(profile.id, file, (frac) => setSending((s) => s.map((x) => (x.key === key ? { ...x, frac } : x))))
        setSending((s) => s.filter((x) => x.key !== key))
        onChanged(next)
      } catch (err) {
        setSending((s) => s.map((x) => (x.key === key ? { ...x, error: (err as Error).message } : x)))
      }
    }
  }

  return (
    <>
      <div
        className={`drop ${over ? 'is-over' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void add([...e.dataTransfer.files])
        }}
      >
        <p className="drop-title">Drop videos here</p>
        <button type="button" className="btn btn-line btn-sm" onClick={() => input.current?.click()} disabled={full}>
          Choose files
        </button>
        <p className="eyebrow">
          Up to {MAX_UPLOADS} files · 500 MB · 15 min each
        </p>
        <input
          ref={input}
          id="voice-files"
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

      {(sending.length > 0 || profile.media.length > 0) && (
        <ul className="uploads">
          {sending.map((s) => (
            <li key={s.key} className={s.error ? 'is-fail' : 'is-busy'}>
              <div className="up-row">
                <span className="up-name">{s.name}</span>
                {!s.error && <span className="num">{Math.round(s.frac * 100)}%</span>}
              </div>
              <p className={s.error ? 'err' : 'fine'}>{s.error ? `✕ ${s.error}` : 'Uploading'}</p>
              {s.error ? (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSending((x) => x.filter((y) => y.key !== s.key))}>
                  Dismiss
                </button>
              ) : (
                <div className="bar">
                  <i style={{ width: `${s.frac * 100}%` }} />
                </div>
              )}
            </li>
          ))}
          {profile.media.map((m) => {
            const st = stage(m, first)
            return (
              <li key={m.id} className={`is-${st.mark}`}>
                <div className="up-row">
                  <span className="up-name">{m.filename ?? `Recorded line ${(m.prompt ?? 0) + 1}`}</span>
                  {st.frac !== undefined && <span className="num">{Math.round(st.frac * 100)}%</span>}
                </div>
                <p className={st.mark === 'fail' ? 'err' : st.mark === 'done' ? 'ok' : 'fine'}>
                  {st.mark === 'fail' ? '✕ ' : st.mark === 'done' ? '✓ ' : ''}
                  {st.text}
                </p>
                {st.frac !== undefined && (
                  <div className="bar">
                    <i style={{ width: `${st.frac * 100}%` }} />
                  </div>
                )}
                <div className="up-actions">
                  {m.status === 'ready' && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => play(mediaUrl(profile.id, m.id))}>
                      ▶ Play
                    </button>
                  )}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={async () => onChanged(await deleteMedia(profile.id, m.id))}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {note && (
        <p className="note">
          <b aria-hidden>!</b> {note}
        </p>
      )}
    </>
  )
}
