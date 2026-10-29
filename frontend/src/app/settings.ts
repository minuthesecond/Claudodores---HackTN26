import { useCallback, useEffect, useState } from 'react'

export type Light = 'day' | 'night' | 'auto'

export type Settings = {
  /** night is the dim palette for dark rooms; auto follows the clock */
  light: Light
  /** which side the patient's controls sit on, for the hand they use */
  side: 'left' | 'right'
  /** speak each sentence aloud */
  speak: boolean
  /** match near misses to the ICU phrases */
  snap: boolean
  mirrored: boolean
}

const KEY = 'unspoken.bedside'
const VOICE_KEY = 'unspoken.voice' // also set by onboarding when a voice is made
const DEFAULTS: Settings = { light: 'day', side: 'left', speak: true, snap: true, mirrored: true }

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // private mode: settings last for this page only
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, ...read<Partial<Settings>>(KEY, {}) }))
  const set = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      write(KEY, next)
      return next
    })
  }, [])
  return [settings, set] as const
}

/** The banked voice chosen for the bedside, or null for the standard voice. */
export function useChosenVoice() {
  // onboarding saves the id as a bare string, not JSON
  const [voice, setVoice] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VOICE_KEY)
    } catch {
      return null
    }
  })
  const choose = useCallback((id: string | null) => {
    setVoice(id)
    try {
      if (id) localStorage.setItem(VOICE_KEY, id)
      else localStorage.removeItem(VOICE_KEY)
    } catch {
      // private mode: just not remembered
    }
  }, [])
  return [voice, choose] as const
}

const isNightHour = () => {
  const h = new Date().getHours()
  return h >= 19 || h < 7
}

/** Whether the night palette is on; "auto" means 7 PM to 7 AM. */
export function useNight(light: Light) {
  const [night, setNight] = useState(() => light === 'night' || (light === 'auto' && isNightHour()))
  useEffect(() => {
    const check = () => setNight(light === 'night' || (light === 'auto' && isNightHour()))
    check()
    if (light !== 'auto') return
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  }, [light])
  return night
}
