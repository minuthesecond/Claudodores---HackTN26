import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_BASE = '/mediapipe'
const LOCAL_MODEL = '/models/face_landmarker.task'
const REMOTE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let loading: Promise<FaceLandmarker> | null = null

async function create(modelAssetPath: string, delegate: 'GPU' | 'CPU') {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO',
    outputFaceBlendshapes: true,
    numFaces: 1,
  })
}

export function loadFaceLandmarker() {
  loading ??= (async () => {
    for (const model of [LOCAL_MODEL, REMOTE_MODEL]) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          return await create(model, delegate)
        } catch {
          /* try next */
        }
      }
    }
    throw new Error('Face tracking unavailable')
  })()
  loading.catch(() => (loading = null))
  return loading
}

export const LIP_EDGES = FaceLandmarker.FACE_LANDMARKS_LIPS
export const OVAL_EDGES = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL
const LIP_POINTS = [...new Set(LIP_EDGES.flatMap((c) => [c.start, c.end]))]

export type MouthMetrics = {
  /** inner-lip gap divided by mouth width */
  openness: number
  /** mouth bounding box in normalized video coords */
  box: { x: number; y: number; w: number; h: number }
}

export function measureMouth(lm: NormalizedLandmark[], aspect: number): MouthMetrics {
  const d = (a: number, b: number) => Math.hypot((lm[a].x - lm[b].x) * aspect, lm[a].y - lm[b].y)
  const openness = d(13, 14) / Math.max(d(61, 291), 1e-6)

  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const i of LIP_POINTS) {
    const p = lm[i]
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { openness, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } }
}

/** Same signal lipread/live.py segments phrases on. */
export function jawOpen(res: FaceLandmarkerResult) {
  return res.faceBlendshapes?.[0]?.categories.find((c) => c.categoryName === 'jawOpen')?.score ?? 0
}
