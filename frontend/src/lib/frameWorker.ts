/// <reference lib="webworker" />
/**
 * Owns the /stream WebSocket and does the JPEG encoding, off the main thread.
 * On the main thread, encoding competed with face tracking and drawing, and the
 * server ended up getting 3–6 fps; the model needs ~25.
 *
 * in:  connect {url} | frame {bitmap, t} | flush | close
 * out: open | closed | message {data}
 */

const SEND_SIDE = 960 // same size the server works at
const JPEG_QUALITY = 0.92
const MAX_BUFFERED = 8 * 1024 * 1024 // only skip frames if the link itself is stuck

type In =
  | { type: 'connect'; url: string }
  | { type: 'frame'; bitmap: ImageBitmap; t: number }
  | { type: 'flush' }
  | { type: 'close' }

let ws: WebSocket | null = null
let canvas: OffscreenCanvas | null = null
let lastT = -Infinity
let queue = Promise.resolve()

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data
  if (m.type === 'connect') connect(m.url)
  else if (m.type === 'frame') queue = queue.then(() => send(m.bitmap, m.t))
  else if (m.type === 'flush')
    queue = queue.then(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send('{"type":"flush"}')
    })
  else {
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

// Frames are encoded and sent strictly in capture order: the server's tracker needs
// increasing timestamps.
async function send(bitmap: ImageBitmap, t: number) {
  try {
    if (!ws || ws.readyState !== WebSocket.OPEN || t <= lastT || ws.bufferedAmount > MAX_BUFFERED) return
    lastT = t
    const scale = Math.min(1, SEND_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    if (!canvas || canvas.width !== w || canvas.height !== h) canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    const msg = new Uint8Array(8 + jpeg.size)
    new DataView(msg.buffer).setFloat64(0, t, true)
    msg.set(new Uint8Array(await jpeg.arrayBuffer()), 8)
    ws.send(msg)
  } finally {
    bitmap.close()
  }
}

function post(msg: { type: 'open' } | { type: 'closed' } | { type: 'message'; data: string }) {
  self.postMessage(msg)
}
