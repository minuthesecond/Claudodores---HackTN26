# UNSPOKEN — frontend

Browser UI for the lip reader. It tracks the face with MediaPipe, cuts a clip each time
you mouth a phrase (same jawOpen/pause rules as `lipread/live.py`), and sends it to the
Auto-AVSR server in [`../avsr`](../avsr) to be transcribed and matched to an ICU phrase.

## Run

1. Start the backend: `avsr/setup.sh` once (≈1 GB model download), then `avsr/run.sh`.
   It listens on `:8000` and takes ~20 s to load the model.
2. Start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

3. Open http://localhost:5173, enable the camera, press **Start reading** (or Space).

The dev server proxies `/api/*` to `http://localhost:8000`, because the backend has no
CORS headers. To use a backend on another machine: `BACKEND_URL=http://host:8000 npm run dev`.

If the backend isn't reachable, the header shows **BACKEND OFFLINE** and the app falls
back to a mock reader. It retries every 5 s and switches over once the server is up.
Add `?simulate` to the URL to fake lip movement without a face (useful for demos).

## Where things are

- `src/lib/backend.ts`: phrase segmentation, clip recording and `/transcribe` calls
- `src/lib/reader.ts`: reader interface and the offline mock
- `src/components/Stage.tsx`: camera, face tracking, overlays
- `src/components/Transcript.tsx`: transcript panel
