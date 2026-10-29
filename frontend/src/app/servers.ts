import { useEffect, useState } from 'react'
import { checkHealth, type Health } from '../lib/backend'
import { checkVoice, type VoiceHealth } from '../lib/voice'

type Check<T> = () => Promise<T | null>
const sameDevice = (a: { device?: string }, b: { device?: string }) => a.device === b.device

/** Polls a server's /health every 5 s: undefined until the first answer, null while it's down. */
function usePoll<T extends { ok: boolean; device?: string }>(check: Check<T>) {
  const [health, setHealth] = useState<T | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const poll = async () => {
      const h = await check()
      if (alive) setHealth((prev) => (h?.ok ? (prev && sameDevice(prev, h) ? prev : h) : null))
    }
    void poll()
    const id = setInterval(poll, 5000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [check])
  return health
}

/** The lip reader (../../lipread). While it's down the app falls back to practice readings. */
export const useLipServer = () => usePoll<Health>(checkHealth)

/** The standard voice (../../voice). Banked voices are served by the voicebank instead. */
export const useVoiceServer = () => usePoll<VoiceHealth>(checkVoice)
