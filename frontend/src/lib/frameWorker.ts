/// <reference lib="webworker" />
/**
 * Owns the /stream WebSocket and does the JPEG encoding, off the main thread.
 * On the main thread, encoding competed with face tracking and drawing, and the
 * server ended up getting 3–6 fps; the model needs ~25.
 *
 * Frames come either straight from the camera track (`track`: a
 * MediaStreamTrackProcessor stream, Chrome/Edge — every camera frame, whatever
 * the page is doing) or as bitmaps grabbed by the page (`frame`, elsewhere).
 *
 * in:  connect {url} | track {readable} | active {on} | frame {bitmap, t} | flush | close
 * out: open | closed | message {data}
 */

const SEND_SIDE = 960 // same size the server works at
const JPEG_QUALITY = 0.92
const MAX_BUFFERED = 8 * 1024 * 1024 // only skip frames if the link itself is stuck
const MAX_PENDING = 4 // camera frames waiting to be encoded before we start dropping

type In =
  | { type: 'connect'; url: string }
  | { type: 'track'; readable: ReadableStream<VideoFrame> }
  | { type: 'active'; on: boolean }
  | { type: 'frame'; bitmap: ImageBitmap; t: number }
  | { type: 'flush' }
  | { type: 'close' }

let ws: WebSocket | null = null
let canvas: OffscreenCanvas | null = null
let lastT = -Infinity
let queue = Promise.resolve()
let pending = 0
let active = false
let trackReader: ReadableStreamDefaultReader<VideoFrame> | null = null

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data
  switch (m.type) {
    case 'connect':
      return connect(m.url)
    case 'track':
      return void readTrack(m.readable)
    case 'active':
      active = m.on
      return
    case 'frame':
      return enqueue(m.bitmap, m.t)
    case 'flush':
      active = false
      queue = queue.then(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send('{"type":"flush"}')
      })
      return
    case 'close':
      active = false
      ws?.close()
      ws = null
  }
}

function connect(url: string) {
  ws?.close()
  const sock = new WebSocket(url)
  sock.onopen = () => sock === ws && post({ type: 'open' })
  sock.onmessage = (e) => post({ type: 'message', data: e.data })
  sock.onclose = () => {
    if (sock !== ws) return
    ws = null
    post({ type: 'closed' })
  }
  ws = sock
  lastT = -Infinity
}

async function readTrack(readable: ReadableStream<VideoFrame>) {
  void trackReader?.cancel()
  const reader = readable.getReader()
  trackReader = reader
  for (;;) {
    const { value: frame, done } = await reader.read()
    if (done || trackReader !== reader) {
      frame?.close()
      return
    }
    if (active) enqueue(frame, frame.timestamp / 1000) // µs → ms, capture clock
    else frame.close()
  }
}

type Source = ImageBitmap | VideoFrame

function enqueue(src: Source, t: number) {
  if (pending >= MAX_PENDING) return src.close()
  pending++
  queue = queue.then(() => send(src, t)).finally(() => pending--)
}

// Frames are encoded and sent strictly in capture order: the server's tracker needs
// increasing timestamps.
async function send(src: Source, t: number) {
  try {
    if (!ws || ws.readyState !== WebSocket.OPEN || t <= lastT || ws.bufferedAmount > MAX_BUFFERED) return
    lastT = t
    const [sw, sh] = 'displayWidth' in src ? [src.displayWidth, src.displayHeight] : [src.width, src.height]
    const scale = Math.min(1, SEND_SIDE / Math.max(sw, sh))
    const w = Math.round(sw * scale)
    const h = Math.round(sh * scale)
    if (!canvas || canvas.width !== w || canvas.height !== h) canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d')!.drawImage(src, 0, 0, w, h)
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    const msg = new Uint8Array(8 + jpeg.size)
    new DataView(msg.buffer).setFloat64(0, t, true)
    msg.set(new Uint8Array(await jpeg.arrayBuffer()), 8)
    ws.send(msg)
  } finally {
    src.close()
  }
}

function post(msg: { type: 'open' } | { type: 'closed' } | { type: 'message'; data: string }) {
  self.postMessage(msg)
}
