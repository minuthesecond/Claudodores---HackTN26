# UNSPOKEN — frontend

Browser UI for the lip reader. While reading, it streams camera frames over a WebSocket
to [`../lipread/server.py`](../lipread/server.py), which runs live.py's loop on them
(jawOpen phrase segmentation → Face Landmarker keypoints → Auto-AVSR LRS3_V_WER19.1 +
language model). Fast partial decodes update the text while you mouth a phrase; once you
pause for 1 s, the full decode (same settings as live.py) finalizes the line.

Frames are read straight off the camera track in a Web Worker (Chrome/Edge), so the model
gets the camera's full ~30 fps even when the page is busy; the HUD's **Model input** chip
shows the live rate and turns orange below 24 fps. Other browsers grab frames from the page.

Env vars for `./run.sh`: `PAUSE` (1.0 s), `FINAL_BEAM` (40), `PARTIAL_BEAM` (4),
`PARTIAL_EVERY` (0.5 s). The server prints each phrase's fps, resolution, face coverage
and result, which is the first place to look when accuracy drops.

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
