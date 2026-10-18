/**
 * Calls to the voicebank server (../server.py, :8003). Dev: Vite proxies /voicebank to it.
 */
export const VOICEBANK = (import.meta.env.VITE_VOICEBANK_URL as string | undefined) ?? '/voicebank'

export type Status = 'draft' | 'building' | 'preview' | 'approved' | 'failed'

export type Media = {
  id: string
  kind: 'recording' | 'upload'
  prompt: number | null
  filename: string | null
  duration_s: number
  status: 'processing' | 'ready' | 'failed'
  error: string | null
  stage: 'queued' | 'separating' | null
  progress: number | null
}

// Same limits as banking.py; checked here first so a too-big file never starts uploading
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024
export const MAX_UPLOADS = 10

export type Profile = {
  id: string
  name: string
  status: Status
  created_at: number
  speech_seconds: number
  error: string | null
  media: Media[]
  warnings: string[]
  can_build: boolean
  processing: number
  phrases: { done: number; total: number; warming: boolean }
}

export type Prompts = { prompts: string[]; preview: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${VOICEBANK}${path}`, init)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') msg = body.detail
    } catch {
      // not JSON
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export async function checkVoicebank(): Promise<boolean> {
  try {
    const res = await fetch(`${VOICEBANK}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export const getPrompts = () => call<Prompts>('/prompts')
export const listProfiles = () => call<Profile[]>('/profiles')
export const getProfile = (id: string) => call<Profile>(`/profiles/${id}`)
export const createProfile = (name: string, consent: boolean) => call<Profile>('/profiles', json({ name, consent }))
export const deleteProfile = (id: string) => call<{ ok: true }>(`/profiles/${id}`, { method: 'DELETE' })
export const buildProfile = (id: string) => call<Profile>(`/profiles/${id}/build`, { method: 'POST' })
export const redoProfile = (id: string) => call<Profile>(`/profiles/${id}/redo`, { method: 'POST' })
export const approveProfile = (id: string) => call<Profile>(`/profiles/${id}/approve`, { method: 'POST' })
export const deleteMedia = (id: string, mid: string) => call<Profile>(`/profiles/${id}/media/${mid}`, { method: 'DELETE' })

export function addRecording(id: string, prompt: number, audio: Blob) {
  const form = new FormData()
  form.append('file', audio, `prompt-${prompt}.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`)
  form.append('kind', 'recording')
  form.append('prompt', String(prompt))
  return call<Profile>(`/profiles/${id}/media`, { method: 'POST', body: form })
}

/** Uploads an old video or audio file. Uses XHR because fetch can't report upload progress. */
export function uploadMedia(id: string, file: File, onProgress: (frac: number) => void) {
  return new Promise<Profile>((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('kind', 'upload')
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${VOICEBANK}/profiles/${id}/media`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as Profile)
      const detail = (xhr.response as { detail?: unknown } | null)?.detail
      reject(new Error(typeof detail === 'string' ? detail : `${xhr.status} ${xhr.statusText}`))
    }
    xhr.onerror = () => reject(new Error('Upload failed (network)'))
    xhr.send(form)
  })
}

export const mediaUrl =(id: string, mid: string) => `${VOICEBANK}/profiles/${id}/media/${mid}/audio.wav`
export const speakUrl = (id: string, text: string) =>
  `${VOICEBANK}/speak?profile=${id}&text=${encodeURIComponent(text)}`
