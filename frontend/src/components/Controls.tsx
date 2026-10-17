type Props = {
  reading: boolean
  busy: boolean
  onToggle: () => void
  devices: MediaDeviceInfo[]
  deviceId: string
  onDevice: (id: string) => void
  cameraOn: boolean
  onCameraOff: () => void
  toggles: { label: string; on: boolean; set: (v: boolean) => void }[]
}

export function Controls(p: Props) {
  return (
    <div className="controls">
      <button className={`record ${p.reading ? 'is-on' : ''}`} onClick={p.onToggle} disabled={p.busy}>
        <span className="record-icon" />
        <span className="record-label">{p.busy ? 'Starting' : p.reading ? 'Stop' : 'Start reading'}</span>
        <kbd>Space</kbd>
      </button>

      <label className="select">
        <span className="select-label">Cam</span>
        <select
          value={p.deviceId}
          onChange={(e) => p.onDevice(e.target.value)}
          disabled={!p.devices.length}
          aria-label="Camera"
        >
          {p.devices.length ? (
            p.devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))
          ) : (
            <option value="">None</option>
          )}
        </select>
      </label>

      {p.cameraOn && (
        <button className="btn" onClick={p.onCameraOff}>
          Cam off
        </button>
      )}

      <div className="toggles">
        {p.toggles.map((t) => (
          <button key={t.label} className="toggle" aria-pressed={t.on} onClick={() => t.set(!t.on)}>
            <span className="box" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
