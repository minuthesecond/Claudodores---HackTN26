import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'off' | 'requesting' | 'live' | 'error'

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const streamRef = useRef<MediaStream | null>(null)

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = useCallback(async (id?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setError('This browser does not support camera access.')
      return false
    }
    setStatus('requesting')
    setError(null)
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: id ? { exact: id } : undefined,
          facingMode: id ? undefined : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }, // the model wants ~25 fps of real frames
        },
      })
      release()
      streamRef.current = next
      setStream(next)
      setDeviceId(next.getVideoTracks()[0]?.getSettings().deviceId ?? '')
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === 'videoinput'))
      setStatus('live')
      return true
    } catch (e) {
      const name = (e as DOMException)?.name
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access in your browser settings and try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'Could not start the camera.',
      )
      setStatus('error')
      return false
    }
  }, [])

  const stop = useCallback(() => {
    release()
    setStream(null)
    setStatus('off')
  }, [])

  useEffect(() => release, [])

  return { stream, status, error, devices, deviceId, start, stop }
}
