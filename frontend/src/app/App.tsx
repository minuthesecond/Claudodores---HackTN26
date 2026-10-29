/**
 * The bedside app (/app), laid out as a "Bedside Board": a narrow rail on the patient's side
 * (camera, phrases, an ever-present Yes and No) and a wide board facing the room showing what
 * was said. Also the care team's history and the family's voice setup.
 *
 * Lip reading, the standard voice and banked voices all go through the same servers as before
 * (../lib/backend.ts, ../lib/voice.ts, @voicebank).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUser, useVoicebank } from '@voicebank'
import { Wordmark } from '../components/Wordmark'
import { useCamera } from '../hooks/useCamera'
import { StreamLipReader } from '../lib/backend'
import { MockLipReader } from '../lib/reader'
import { Speaker } from '../lib/voice'
import { Board, PhraseGrid, Rail, RoomView, type Phase } from './Bedside'
import { CareTeam } from './CareTeam'
import { Mark, SettingsSheet, type Readout } from './SettingsSheet'
import { VoiceSetup } from './VoiceSetup'
import { PHRASES, phraseFor, sentence, useConversation, type Entry, type Phrase } from './conversation'
import { useLipServer, useVoiceServer } from './servers'
import { useChosenVoice, useNight, useSettings } from './settings'
import './app.css'

type View = 'bedside' | 'care' | 'voice'

/** "That's not it" on a reading: the other readings to offer, one at a time. */
type Check = { id: number; guesses: { text: string; say: string }[]; at: number }

const VIEWS: [View, string][] = [
  ['bedside', 'Bedside'],
  ['care', 'Care team'],
  ['voice', 'Voice setup'],
]

const URGENT = PHRASES.filter((p) => p.urgent)
const EVERYDAY = PHRASES.filter((p) => !p.urgent && p.group !== 'answers')

/** The rail's short list: the urgent phrase, then the five used most this session. */
function railPhrases(entries: Entry[]) {
  const uses = new Map<string, number>()
  for (const e of entries) {
    const p = phraseFor(e.say)
    if (p) uses.set(p.key, (uses.get(p.key) ?? 0) + 1)
  }
  // a stable sort keeps the default order among phrases used equally often
  return [...URGENT, ...[...EVERYDAY].sort((a, b) => (uses.get(b.key) ?? 0) - (uses.get(a.key) ?? 0)).slice(0, 5)]
}

export default function App() {
  const camera = useCamera()
  const lip = useLipServer()
  const voiceServer = useVoiceServer()
  const bank = useVoicebank()
  const user = useUser()
  const [settings, set] = useSettings()
  const [chosenVoice, chooseVoice] = useChosenVoice()
  const night = useNight(settings.light)

  // Harbor, day or night, on the whole page
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('ua')
    root.dataset.light = night ? 'night' : 'day'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#14242A' : '#FFFFFF')
    document.title = 'Unspoken'
  }, [night])

  // Use the lip reader when it's up; fall back to practice readings otherwise.
  const online = !!lip
  const mock = useMemo(() => new MockLipReader(), [])
  const backend = useMemo(() => new StreamLipReader(), [])
  const reader = online ? backend : mock
  useEffect(() => (online ? mock : backend).reset(), [online, mock, backend])
  useEffect(() => {
    backend.snap = settings.snap
  }, [backend, settings.snap])

  const talk = useConversation(reader)
  const { add, update } = talk

  // The banked voice is used only while the voicebank is up and the voice is approved.
  const banked = bank.online ? bank.profiles.find((p) => p.id === chosenVoice && p.status === 'approved') : undefined
  const voiceName = banked ? `${banked.name}'s voice` : 'the standard voice'

  const speaker = useMemo(() => new Speaker(), [])
  const [speakingId, setSpeakingId] = useState<number | null>(null)
  useEffect(() => speaker.on(setSpeakingId), [speaker])
  useEffect(() => {
    speaker.wholeSentence = voiceServer?.device === 'cpu'
  }, [voiceServer, speaker])
  useEffect(() => speaker.setVoice(banked?.id ?? null), [speaker, banked?.id])
  const canSpeak = settings.speak && (!!voiceServer || !!banked)
  useEffect(() => {
    if (!canSpeak) speaker.stop()
  }, [canSpeak, speaker])

  const say = useCallback(
    (e: Entry) => {
      if (!canSpeak) return
      if (e.urgent) speaker.stop() // an urgent line goes ahead of anything queued
      speaker.say(e.id, e.say)
    },
    [canSpeak, speaker],
  )

  // Speak each new line once, as it arrives
  const last = talk.entries[talk.entries.length - 1]
  const spokenRef = useRef(last?.id ?? 0)
  useEffect(() => {
    if (!last || last.id <= spokenRef.current) return
    spokenRef.current = last.id
    say(last)
  }, [last, say])

  const [view, setView] = useState<View>('bedside')
  const [reading, setReading] = useState(false)
  const [railTab, setRailTab] = useState<'camera' | 'phrases'>('camera')
  const [shortList, setShortList] = useState<Phrase[]>(() => railPhrases(talk.entries))
  const [grid, setGrid] = useState(false)
  const [room, setRoom] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [check, setCheck] = useState<Check | null>(null)

  // Frames go to the reader only while the bedside is in front and nothing else is asked of the patient
  const active = reading && !!camera.stream && view === 'bedside' && !check && !grid && !sheet
  const wasActive = useRef(false)
  useEffect(() => {
    if (wasActive.current && !active) reader.flush()
    wasActive.current = active
  }, [active, reader])

  const phase: Phase = check
    ? 'checking'
    : speakingId !== null
      ? 'speaking'
      : !camera.stream
        ? 'off'
        : !reading
          ? 'paused'
          : !active
            ? 'away'
            : talk.status === 'idle'
              ? 'listening'
              : 'reading'

  const shown = talk.entries.filter((e) => !e.rejected)
  const current = shown[shown.length - 1]
  const earlier = shown.slice(-3, -1).reverse()

  const turnOn = async () => {
    if (await camera.start()) setReading(true)
  }

  const pick = (p: Phrase) => {
    add({ source: 'phrase', text: p.text, say: p.say, urgent: p.urgent })
    setGrid(false)
  }

  const showTab = (tab: 'camera' | 'phrases') => {
    // the short list is ordered when it opens, so buttons never move under a finger
    if (tab === 'phrases') setShortList(railPhrases(talk.entries))
    setRailTab(tab)
  }

  const wrong = (e: Entry) => {
    const guesses = e.snapped && e.raw ? [{ text: sentence(e.raw), say: e.raw }] : []
    setRoom(false)
    setCheck({ id: e.id, guesses, at: 0 })
  }

  const guess = check?.guesses[check.at]
  const answer = (yes: boolean) => {
    if (!check) return pick(PHRASES.find((p) => p.key === (yes ? 'yes' : 'no'))!)
    if (!guess) return
    if (!yes) return setCheck({ ...check, at: check.at + 1 })
    const fixed = { text: guess.text, say: guess.say, corrected: true, snapped: false, urgent: phraseFor(guess.say)?.urgent }
    update(check.id, fixed)
    const entry = talk.entries.find((e) => e.id === check.id)
    if (entry) say({ ...entry, ...fixed })
    setCheck(null)
  }

  const reject = () => check && update(check.id, { rejected: true })

  const cameraOff = () => {
    setReading(false)
    camera.stop()
  }

  // Space pauses and resumes reading; Escape closes whatever is on top
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sheet) setSheet(false)
        else if (room) setRoom(false)
        else if (grid) setGrid(false)
        else if (check) setCheck(null)
        return
      }
      if (e.code !== 'Space' || e.repeat || view !== 'bedside' || !camera.stream || sheet || grid || room) return
      if ((e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]')) return
      e.preventDefault()
      setReading((r) => !r)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, camera.stream, sheet, grid, room, check])

  const readouts: Readout[] = [
    { label: 'Lip reader', ok: lip === undefined ? undefined : online, value: lip === undefined ? 'Checking' : online ? `Online · ${lip.device ?? 'cpu'}` : 'Offline · practice' },
    {
      label: 'Voice',
      ok: voiceServer === undefined && !banked ? undefined : !!voiceServer || !!banked,
      value: !settings.speak ? 'Muted' : banked ? banked.name : voiceServer === undefined ? 'Checking' : voiceServer ? 'Standard' : 'Offline',
    },
    { label: 'Voicebank', ok: bank.online, value: bank.online ? 'Online' : 'Offline' },
    { label: 'Camera', ok: !!camera.stream, value: camera.stream ? (active ? 'Reading' : 'On') : 'Off' },
  ]

  return (
    <div className="ua-app">
      <header className="ua-bar">
        <a className="ua-brand" href="/" aria-label="Unspoken home">
          <Wordmark live={false} />
        </a>
        <nav className="ua-nav" aria-label="Views">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-current={view === v ? 'page' : undefined} onClick={() => (setView(v), setCheck(null))}>
              {label}
            </button>
          ))}
        </nav>
        <dl className="ua-status">
          {readouts.map((r) => (
            <div key={r.label}>
              <dt>{r.label}</dt>
              <dd>
                <Mark ok={r.ok} /> {r.value}
              </dd>
            </div>
          ))}
        </dl>
        <button type="button" className="btn btn-quiet btn-sm ua-settings" onClick={() => setSheet(true)}>
          Settings
        </button>
      </header>

      {lip === null && (
        <p className="notice">
          <b aria-hidden>✕</b> The lip reader is offline. Readings shown now are practice ones, not the patient's words.
        </p>
      )}
      {settings.speak && voiceServer === null && !banked && (
        <p className="notice">
          <b aria-hidden>✕</b> The voice is offline. Sentences are shown but not spoken.
        </p>
      )}

      <main className="ua-main">
        {view === 'bedside' && (
          <div className={`bedside is-${settings.side}`}>
            <Rail
              tab={railTab}
              onTab={showTab}
              stream={camera.stream}
              cameraBusy={camera.status === 'requesting'}
              cameraError={camera.error}
              onCamera={turnOn}
              reading={reading}
              active={active}
              onPause={() => setReading((r) => !r)}
              reader={reader}
              mirrored={settings.mirrored}
              online={online}
              phrases={shortList}
              onPhrase={pick}
              onAllPhrases={() => setGrid(true)}
              asking={!!check && !!guess}
              answerOff={!!check && !guess}
              onAnswer={answer}
            />
            <Board
              phase={phase}
              voice={voiceName}
              current={current}
              earlier={earlier}
              missedAt={talk.missedAt}
              onAgain={say}
              onWrong={wrong}
              onRoom={() => setRoom(true)}
              check={
                check && {
                  guess: guess ?? null,
                  at: check.at,
                  total: check.guesses.length,
                  onMouth: () => {
                    reject()
                    setCheck(null)
                    if (camera.stream) setReading(true)
                  },
                  onPhrase: () => {
                    reject()
                    setCheck(null)
                    setGrid(true)
                  },
                  onCancel: () => setCheck(null),
                }
              }
            />
          </div>
        )}
        {view === 'care' && <CareTeam entries={talk.entries} onReplay={say} onClear={talk.clear} onBack={() => setView('bedside')} />}
        {view === 'voice' && (
          <VoiceSetup
            online={bank.online}
            profiles={bank.profiles}
            refresh={bank.refresh}
            chosen={chosenVoice}
            onChoose={chooseVoice}
            signedIn={!!user}
          />
        )}
      </main>

      {grid && <PhraseGrid onPick={pick} onClose={() => setGrid(false)} />}
      {room && <RoomView entry={current} phase={phase} voice={voiceName} onClose={() => setRoom(false)} />}
      {sheet && (
        <SettingsSheet
          settings={settings}
          set={set}
          devices={camera.devices}
          deviceId={camera.deviceId}
          onDevice={(id) => void camera.start(id)}
          cameraOn={!!camera.stream}
          onCameraOff={cameraOff}
          readouts={readouts}
          user={user}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  )
}
