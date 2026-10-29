import { useEffect, useRef, type ReactNode } from 'react'
import { logout, type User } from '@voicebank'
import type { Light, Settings } from './settings'

export type Readout = { label: string; ok: boolean | undefined; value: string }

type Props = {
  settings: Settings
  set: (patch: Partial<Settings>) => void
  devices: MediaDeviceInfo[]
  deviceId: string
  onDevice: (id: string) => void
  cameraOn: boolean
  onCameraOff: () => void
  readouts: Readout[]
  user: User | null
  onClose: () => void
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset className="choice">
      <legend className="eyebrow">{label}</legend>
      <div className="choice-row">
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Switch({ label, hint, on, onChange }: { label: string; hint?: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="switch-row">
      <div>
        <p className="switch-label">{label}</p>
        {hint && <p className="fine">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)}>
        <span>{on ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

export function Mark({ ok }: { ok: boolean | undefined }) {
  return (
    <span className={`mark ${ok === undefined ? 'is-wait' : ok ? 'is-ok' : 'is-down'}`} aria-hidden>
      {ok === undefined ? '○' : ok ? '●' : '✕'}
    </span>
  )
}

/** Staff settings, in a sheet over the bedside. */
export function SettingsSheet(p: Props) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => close.current?.focus(), [])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="sheet-head">
          <h2 id="settings-title">Settings</h2>
          <button ref={close} type="button" className="btn btn-quiet btn-sm" onClick={p.onClose}>
            Close
          </button>
        </header>

        <Choice<Light>
          label="Light"
          value={p.settings.light}
          options={[
            ['day', 'Day'],
            ['night', 'Night'],
            ['auto', 'Auto, 7 PM to 7 AM'],
          ]}
          onChange={(light) => p.set({ light })}
        />
        <Choice
          label="Patient controls"
          value={p.settings.side}
          options={[
            ['left', 'On the left'],
            ['right', 'On the right'],
          ]}
          onChange={(side) => p.set({ side })}
        />
        <Switch label="Speak each sentence aloud" on={p.settings.speak} onChange={(speak) => p.set({ speak })} />
        <Switch
          label="Match near misses to common phrases"
          hint="“I need some water” becomes “I need water”. Anything else is kept as read."
          on={p.settings.snap}
          onChange={(snap) => p.set({ snap })}
        />
        <Switch label="Mirror the camera" on={p.settings.mirrored} onChange={(mirrored) => p.set({ mirrored })} />

        {p.devices.length > 1 && (
          <label className="field">
            <span className="eyebrow">Camera</span>
            <select id="camera-device" value={p.deviceId} onChange={(e) => p.onDevice(e.target.value)}>
              {p.devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {p.cameraOn && (
          <button type="button" className="btn btn-line btn-sm" onClick={p.onCameraOff}>
            Turn the camera off
          </button>
        )}

        <div>
          <p className="eyebrow">Systems</p>
          <dl className="readout">
            {p.readouts.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>
                  <Mark ok={r.ok} /> {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <p className="eyebrow">Account</p>
          {p.user ? (
            <p className="account">
              Signed in as <b>{p.user.name}</b>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void logout()}>
                Log out
              </button>
            </p>
          ) : (
            <p className="account">
              Not signed in. <a href="/login">Log in</a>
            </p>
          )}
        </div>

        <p className="fine">Prototype. Not a medical device.</p>
      </aside>
    </div>
  )
}
