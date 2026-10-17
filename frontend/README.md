# UNSPOKEN — frontend

Browser UI for the lip reader. While reading, it streams camera frames over a WebSocket
to [`../lipread/server.py`](../lipread/server.py), which runs live.py's loop on them
(jawOpen phrase segmentation → Face Landmarker keypoints → Auto-AVSR LRS3_V_WER19.1 +
language model). Text updates about twice a second while you mouth a phrase, and the
full decode finalizes the line ~1.7 s after you pause.

Latency knobs (env vars for `./run.sh`): `PAUSE` (0.7 s; live.py uses 1.0),
`FINAL_BEAM` (10; live.py uses 40), `PARTIAL_BEAM` (4), `PARTIAL_EVERY` (0.5 s).

## Run

1. Start the backend: `./setup.sh` once from the repo root (≈1.1 GB of models), then
   `./run.sh`. It listens on `:8000` and takes ~10 s to load the model.
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

- `../lipread/server.py`: WebSocket/HTTP wrapper around live.py's pipeline
- `src/lib/backend.ts`: frame streaming and server messages
- `src/lib/reader.ts`: reader interface and the offline mock
- `src/components/Stage.tsx`: camera, face tracking, overlays
- `src/components/Transcript.tsx`: transcript panel
