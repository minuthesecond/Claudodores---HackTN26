import type { Profile } from './api'
import './voicebank.css'

type Props = {
  profiles: Profile[]
  value: string | null
  onChange: (id: string | null) => void
  onManage: () => void
}

/** "Speaks as" dropdown for the reader: the built-in voice or any approved banked voice. */
export function VoicePicker({ profiles, value, onChange, onManage }: Props) {
  const approved = profiles.filter((p) => p.status === 'approved')
  return (
    <div className="vb-picker">
      <label className="select">
        <span className="select-label">Speaks as</span>
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Voice">
          <option value="">Built-in voice</option>
          {approved.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" onClick={onManage}>
        Voices
      </button>
    </div>
  )
}
