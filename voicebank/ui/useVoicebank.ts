import { useCallback, useEffect, useState } from 'react'
import { checkVoicebank, listProfiles, type Profile } from './api'

/** Whether the voicebank server is up, and its saved voices. Polls every 5 s like the other servers. */
export function useVoicebank() {
  const [online, setOnline] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const refresh = useCallback(async () => {
    const up = await checkVoicebank()
    setOnline(up)
    if (!up) return setProfiles([])
    try {
      setProfiles(await listProfiles())
    } catch {
      // keep the last list
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  return { online, profiles, refresh }
}
