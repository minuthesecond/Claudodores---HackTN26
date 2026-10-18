# Unspoken

Lip reading for people who lose their voice. Mouth a sentence at the camera, pause, and
Unspoken reads it from your lips, writes it down, and says it out loud.

Built at HackTN 2026 by The Claudodores. Prototype, not a medical device.

## What runs

Three processes, each in its own terminal:

| What | Command | Port | First run |
|---|---|---|---|
| Lip reader (Auto-AVSR) | `./run.sh` | 8000 | `./setup.sh` once, ≈1.1 GB of models |
| Voice (XTTS-v2 text-to-speech) | `./voice.sh` | 8001 | sets itself up, ≈1.9 GB model download |
| Website (landing page + live demo) | `cd frontend && npm run dev` | 5173 | `npm install` once |

The website forwards `/api` to the lip reader and `/voice` to the voice server, so you
only ever open the website.

## Requirements

- macOS or Linux. Apple silicon runs the voice on its GPU; other machines use the CPU.
- Python 3.11. `setup.sh` and `voice.sh` fetch it with [uv](https://docs.astral.sh/uv/)
  if needed (`voice.sh` also works without uv if Python 3.11 is installed).
- Node 20 or newer.
- About 4 GB of free disk and 8 GB of free RAM for both models.

## Run it

From the repo root:

**1. Lip reader**

```sh
./setup.sh   # first time only
./run.sh
```

Ready when it prints `Uvicorn running on http://0.0.0.0:8000` (≈10 s).

**2. Voice**

```sh
./voice.sh
```

The first run creates `voice/.venv`, installs its dependencies and downloads the model.
After that it takes ≈30 s to start. Ready when it prints `Voice cache ready` and then
`Uvicorn running on http://0.0.0.0:8001`.

**3. Website**

```sh
cd frontend
npm install   # first time only
npm run dev
```

Then open:

- http://localhost:5173 for the landing page
- http://localhost:5173/app for the live demo

## Using the demo

1. Press **Enable camera** and allow camera access.
2. Face the camera in good light, with your mouth clearly visible.
3. Mouth a sentence silently, then hold still for a moment.
4. The sentence appears in the transcript and is spoken out loud.

Short, clear sentences work best. Hospital phrases like "i need water" or "call the nurse"
are pre-recorded by the voice server, so they play instantly.

The header shows whether each server is reachable:

- **Backend Online** means real lip reading. If it says **Offline**, the demo falls back
  to a fake reader that shows a random hospital phrase whatever you mouth.
- **Voice Online** means sentences are spoken. If it says **Offline**, they're only shown.

Controls: **Space** starts and stops reading, the **Voice** switch mutes speech, and the
speaker button on each transcript line says it again.

## Check it's working

```sh
curl localhost:8000/health   # {"ok":true,"device":"cpu",...}
curl localhost:8001/health   # {"ok":true,"device":"mps",...}  (cpu on non-Apple machines)
curl localhost:5173/api/health   # same as 8000, through the website
curl localhost:5173/voice/health # same as 8001, through the website
```

If the last two return HTML instead of JSON, restart `npm run dev`.

## Tuning

Set these when starting `./run.sh`, e.g. `PAUSE=0.9 ./run.sh`:

| Variable | Default | What it does |
|---|---|---|
| `PAUSE` | 0.7 | Seconds of stillness that end a sentence. Raise it if sentences get cut in half. |
| `FINAL_BEAM` | 10 | How many guesses the decoder compares. Higher is slower and sometimes more accurate (40 is ≈2× slower). |
| `PARTIALS` | 0 | Set to 1 to decode while you're still mouthing. The demo ignores these, and they slow the final result. |

For `./voice.sh`:

| Variable | Default | What it does |
|---|---|---|
| `VOICE_SPEAKER` | Claribel Dervla | Which built-in voice to use (`curl localhost:8001/voices` lists them). |
| `VOICE_SAMPLE` | none | Path to ≈20 s of someone's speech, to clone their voice instead. |
| `VOICE_DEVICE` | auto | Force `cpu`, `mps` or `cuda`. |

To run the website against servers on another machine:
`BACKEND_URL=http://host:8000 VOICE_URL=http://host:8001 npm run dev`.

## Troubleshooting

- **Everything got slow.** The Mac is probably out of memory and has pushed the models
  to disk. Close apps you don't need (simulators, browser tabs), then restart `./run.sh`
  and `./voice.sh`.
- **Transcripts are random hospital phrases.** The website can't reach the lip reader.
  Check `curl localhost:5173/api/health`, then restart `./run.sh` or `npm run dev`.
- **No sound.** Check the header says Voice Online, the Voice switch is on, and the
  browser tab isn't muted. The first new sentence after starting the voice server takes
  ≈1 s longer while it warms up.
- **`Address already in use`.** Something is already on that port: `lsof -i :8000`
  (or 8001, 5173) shows what, and you can stop it before starting again.
- **"no face found in clip".** Move closer, face the camera, and light your face.

## Deploy to a server

The live copy runs on Oracle Cloud at https://147-224-207-225.sslip.io (demo at `/app`):
an 8-core, 64 GB CPU machine running Ubuntu 22.04. To deploy or update it, from the repo root:

```sh
deploy/deploy.sh ubuntu@147.224.207.225
```

It copies the code and models, installs everything, builds the website, and runs the lip
reader and voice as systemd services behind [Caddy](https://caddyserver.com), which gets
the HTTPS certificate. Any Ubuntu 22.04 server with ports 22, 80 and 443 open works; the
`<ip-with-dashes>.sslip.io` address needs no DNS setup. Your SSH key must be able to log
in as `ubuntu`.

On the server:

```sh
systemctl status unspoken-lip unspoken-voice caddy   # are they running
journalctl -u unspoken-lip -f                          # each sentence, its fps and decode time
sudo systemctl restart unspoken-lip                    # after changing deploy/unspoken-lip.service
```

Without a GPU the voice can't generate as fast as it plays, so the site waits for each
whole sentence and plays it in one go (the hospital phrases are pre-recorded and instant).

## Where things are

- `lipread/`: lip-reading server (`server.py`) and the face-tracking and model code it uses
- `voice/`: text-to-speech server (`voice_server.py`, `voice.py`)
- `frontend/`: the website; `frontend/README.md` has frontend details
- `deploy/`: server deploy script, systemd services and Caddy config
- `talking.MOV`: the clip replayed on the landing page; test the lip reader on it with
  `curl -F file=@talking.MOV localhost:8000/transcribe`
