# Unspoken — frontend

Browser UI for the lip reader. While reading, it streams camera frames over a WebSocket
to [`../lipread/server.py`](../lipread/server.py), which runs live.py's loop on them
(jawOpen phrase segmentation → Face Landmarker keypoints → Auto-AVSR LRS3_V_WER19.1 +
language model). It works one sentence at a time: once you pause for 0.7 s, the whole
sentence is decoded (same settings as live.py), added to the transcript, and spoken aloud
by the voice server ([`../voice/voice_server.py`](../voice/voice_server.py), XTTS-v2).

Frames are read straight off the camera track in a Web Worker (Chrome/Edge), so the model
gets the camera's full ~30 fps even when the page is busy; the HUD's **Model input** chip
shows the live rate and turns orange below 24 fps. Other browsers grab frames from the page.

Env vars for `./run.sh`: `PAUSE` (0.7 s), `FINAL_BEAM` (10; live.py's 40 reads the same
text on our clips but takes ~2x as long on CPU). `PARTIALS=1` brings back
in-progress decodes while a phrase is mouthed (`PARTIAL_BEAM` 4, `PARTIAL_EVERY` 0.5 s); the
frontend ignores them. The server prints each phrase's fps, resolution, face coverage and
result, which is the first place to look when accuracy drops.

## Run

1. Start the backend: `./setup.sh` once from the repo root (≈1.1 GB of models), then
   `./run.sh`. It listens on `:8000` and takes ~10 s to load the model.
2. Start the voice: `./voice.sh` from the repo root. The first run makes `voice/.venv`,
   installs its deps and downloads XTTS-v2 (≈1.9 GB); after that it starts in ~30 s,
   pre-speaks the ICU phrases (instant playback) and listens on `:8001`. On Apple silicon it
   runs on the GPU (`mps`) and starts speaking a new sentence in ~0.3 s; `VOICE_DEVICE=cpu`
   forces CPU (~1 s, and it can't keep up with playback).
3. Start the frontend:

   ```sh
   cd frontend
   npm install
   npm run dev
   ```

4. Open http://localhost:5173 for the landing page, or http://localhost:5173/app for the
   reader: enable the camera, mouth a sentence, pause.

The dev server proxies `/api/*` to `http://localhost:8000` and `/voice/*` to
`http://localhost:8001`. To use servers on another machine:
`BACKEND_URL=http://host:8000 VOICE_URL=http://host:8001 npm run dev`.

The voice is optional: when it's offline the header says so and sentences are only shown.
The **Voice** switch mutes it, and each transcript line has a button to say it again.

If the backend isn't reachable, the header shows **Backend: Offline** and the app falls
back to a mock reader that "reads" one ICU phrase per sentence. It retries every 5 s and switches over once the server is up.
Add `?simulate` to the URL to fake lip movement without a face (useful for demos).

## Where things are

- `src/landing/`: landing page (`/`). The hero replays real pipeline output for
  `talking.MOV` — mouth crops, jawOpen signal, partial and final decodes — from
  `public/landing/` (`mouth-sprite.png`, `replay.json`)

- `../lipread/server.py`: WebSocket/HTTP wrapper around live.py's pipeline
- `src/lib/backend.ts`: frame streaming and server messages
- `src/lib/reader.ts`: reader interface and the offline mock
- `src/lib/voice.ts`: speaks finished sentences, one at a time, via the voice server
- `../voice/voice_server.py`: XTTS-v2 text-to-speech (from `main`)
- `src/components/Stage.tsx`: camera, face tracking, overlays
- `src/components/Transcript.tsx`: transcript panel
