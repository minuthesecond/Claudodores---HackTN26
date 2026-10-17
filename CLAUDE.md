# CLAUDE.md

Context for Claude Code working in this repo. Read this first.

## The project

We are building a **lip-to-voice tool for patients who can move their lips but cannot speak**, such as intubated ICU patients, people after a laryngectomy or throat surgery, and people with ALS, stroke, or vocal cord damage. A camera watches the patient mouth words, the system reads their lips, and it speaks the words out loud in the patient's own voice so they can tell nurses and family what they need.

The real-world version of this is "voice banking," where a patient records their voice before surgery and the app speaks for them in that voice afterward.

## Hackathon context

- Event: Oracle x Vanderbilt x Hackathons International hackathon (Nashville, October 2026).
- Track: **#2 Health Access, Equity & Experience**, which asks how technology can remove friction from the health journey so people can access, understand, coordinate, and act on the support they need.
- Judging criteria for this track:
  1. A compelling health or well-being problem with clear social value
  2. A usable prototype with a credible path to scale
  3. Improved access, understanding, coordination, or experience
  4. Thoughtful, responsible use of AI
  5. **Meaningful application of Oracle and OCI capabilities**
- Responsible-AI rules from the organizers, which we must follow:
  - Use synthetic, public, or appropriately de-identified data only (we use our own recorded clips).
  - The system must **never make autonomous diagnostic or treatment decisions**. It only relays what the patient is saying, and a nurse confirms anything clinical.
  - Consider privacy, transparency, accessibility, bias mitigation, and human oversight from the start.
- We have **$500 of OCI credits**.

## Team and ownership

Three people, each owning one part. Stay inside your own folder unless asked, and tell the owner before changing their files.

| Person | Owns | What it does |
|---|---|---|
| Joey | `lipread/` (lip reading) | MediaPipe Face Landmarker finds the face and mouth; `jawOpen` decides when a phrase starts and stops; Auto-AVSR turns the clip into **text** |
| Clark | `frontend/` + `lipread/server.py` (web app) | "UNSPOKEN" React app: camera, live transcript, streams frames to the lip-reading server over a WebSocket |
| Justin | `voice/` (voice output) | Takes that **text** and speaks it out loud with an XTTS-v2 voice |

## Pipeline

```
browser camera (frontend) → WS /stream → lipread/server.py                       [Clark + Joey]
   Face Landmarker → jawOpen phrase detection → mouth crop → Auto-AVSR → text
→ frontend shows the text → GET /speak/stream on voice_server.py → speaker        [Justin]
→ nurse confirms on screen
```

## Repo layout

```
<repo root>/
  CLAUDE.md
  setup.sh, run.sh           # (Clark) one-time setup + start for the lip-reading server (Linux/Mac)
  frontend/                  # (Clark) React + Vite web app
  lipread/                   # (Joey) lip reading
    mouth.py                 # MouthTracker: Face Landmarker per frame, jawOpen + mouth shape
    vsr.py                   # LipReader: Auto-AVSR LRS3_V_WER19.1 + language model
    live.py                  # desktop webcam loop (python lipread/live.py)
    server.py, decoder.py    # (Clark) the live.py loop as a server for the frontend, port 8000
    face_landmarker.task     # MediaPipe Face Landmarker model
  voice/                     # (Justin) text to voice
    voice_server.py          # FastAPI server on port 8001: /speak, /speak/stream, /health
    voice.py                 # XTTS-v2 voice cloning, phrase cache, streaming
    speak_captions.py        # watches lipread/captions.json (written by live.py) and speaks each new caption
    requirements.txt
    voice_cache/             # (gitignored) pre-generated phrase audio
  third_party/auto_avsr/     # (gitignored) clone of mpc001/Visual_Speech_Recognition_for_Multiple_Languages + models
```

Large files (model weights, third_party/, voice recordings, video clips) must **never be committed**. Each teammate downloads their own copy.

## The interfaces between the parts

Do not change these without telling the other owners.

**Lip-reading server (`lipread/server.py`, port 8000):**
- `WS /stream`: browser sends binary messages (8-byte little-endian float64 capture time in ms + JPEG frame); server sends `{"type": "status" | "partial" | "final", ...}`. A `final` has `{"text": str, "seconds": float, "error"?: str}`.
- `POST /transcribe` with a video file → `{"raw": str, "seconds": float}` (testing).
- `GET /health` → `{"ok": true, "device": str, "model": "LRS3_V_WER19.1", "stream": true}`

**Voice server (`voice/voice_server.py`, port 8001, CORS open):**
- `GET /speak?text=...&language=en&voice=<optional>` → `audio/wav` of the text
- `POST /speak` with JSON `{"text": str, "language": "en", "voice": str | null}` → same wav
- `GET /speak/stream?text=...&language=en&voice=<optional>` → `audio/wav` sent while it is generated. In the browser: `new Audio(url).play()`
- `GET /voices` → `{"default": str, "voices": [str, ...]}` (XTTS built-in voices)
- `GET /health` → `{"ok": true, "device": "cpu" | "cuda", "voice": str}`

**Text from lip reading** is a plain lowercase string, for example `"i need some water"`. It is noisy (the model has about 19 percent word error rate on clean, spoken benchmark video, worse on silent mouthing), so expect wrong or missing words.

**ICU phrase list** (pre-spoken at voice-server startup):
```
"i am in pain", "i can't breathe", "i need water", "call the nurse",
"call my family", "i am cold", "i am hot", "yes", "no", "thank you",
"i need to use the bathroom", "where am i", "i am scared"
```
Nothing snaps lip-read text to this list yet. That cleanup step belongs to the voice half (see next steps).

## Voice half (Justin)

- **Model:** Coqui XTTS-v2 via the maintained `coqui-tts` package (model id `tts_models/multilingual/multi-dataset/xtts_v2`). Clones a voice from a short sample with no training. Supports many languages, which we use for translation.
- **License:** XTTS-v2 is non-commercial (CPML). Fine for the hackathon. `voice.py` sets `COQUI_TOS_AGREED=1`.
- **Voice:** one of XTTS-v2's 58 built-in voices, default `Claribel Dervla`. Change the default with the `VOICE_SPEAKER` env var, or per request with `&voice=<name>` (list them at `GET /voices`). To clone a real person instead (the "voice banking" story), set `VOICE_SAMPLE` to about 20 seconds of their clear speech.
- **Speed (CPU laptop):** cached phrase 0.01 s; new sentence starts streaming after about 2.5 s but generates about 3x slower than real time, so it stutters. On an OCI A10 GPU it should start in well under a second and run faster than real time.
- **Caching:** every ICU phrase, and every streamed sentence once finished, is saved in `voice_cache/` keyed by md5 of language + text. Startup also warms up streaming (otherwise the first streamed sentence takes about 30 s on CPU).
- **Test:** `python voice/voice.py "I need water"` writes `voice/out.wav`.

## Setup

Lip reading + frontend (Linux/Mac, also OCI): `./setup.sh` once, then `./run.sh`, then `cd frontend && npm install && npm run dev`. See `frontend/README.md`.

Voice:
```
cd voice
pip install -r requirements.txt
python voice_server.py                     # http://0.0.0.0:8001
```

Known gotchas:
- **FFmpeg is required** for the voice server (torchcodec loads audio through it). Windows: `winget install --id Gyan.FFmpeg.Shared -e`, then open a new terminal. Ubuntu: `sudo apt install ffmpeg`.
- `coqui-tts` needs `transformers<5` (it imports a function removed in 5.x).
- `lipread/requirements.txt` pins `mediapipe==0.10.14`, which needs `protobuf<5`. Joey's Face Landmarker code was tested on `mediapipe==1.1.1` (same version family as the frontend's `@mediapipe/tasks-vision` 1.1.1) and works, so the pin can be raised; then drop `protobuf<5` from `voice/requirements.txt`.
- On Windows, the lip reader needs `PYTHONUTF8=1` (third-party code opens a file without an encoding). Linux and Mac are fine.
- `lipread/decoder.py` and `lipread/vsr.py` hardcode `device="cpu"`, so the lip reader won't use an OCI GPU until that changes.
- The frontend proxies `/api/*` to port 8000 only. The voice server has CORS enabled, so the frontend can call it directly at its own URL.

## Oracle Cloud Infrastructure plan

OCI usage is a judging criterion, so every piece should have an Oracle home.

| OCI service | Role |
|---|---|
| **OCI Compute (GPU instance, e.g. VM.GPU.A10.1)** | Hosts the lip-reading server and the voice server. About $2/hour, so stop it when not in use. New tenancies usually have a GPU limit of 0: request a limit increase early. Open ports in both the VCN security list and the instance firewall. |
| **OCI Generative AI** | Cleans up noisy lip-read text: pick the closest ICU phrase or rewrite as a short clear sentence, then translate it into the target language. This is the strongest "meaningful OCI use" point. |
| **OCI Speech (TTS)** | Fallback voice if voice cloning is too slow or fails. It does not clone a specific person's voice, so XTTS stays primary. |
| **OCI Vault** | Stores OCI API keys. Never hardcode credentials in the repo. |
| Autonomous Database (optional) | Log each phrase, timestamp, and whether the nurse confirmed it, for a "messages understood per shift" metric. Do **not** store patient video. |

The browser needs HTTPS to use the camera when the frontend is not on localhost, so the deployed frontend needs a domain and certificate (for example Caddy).

## Next steps for the voice half

1. Pick the demo voice from `GET /voices`.
2. Add an OCI Generative AI cleanup function (raw lip-read text → clean sentence or closest ICU phrase, plus optional translation). Call it before speaking.
3. Add translation output by passing the target `language` into XTTS so the patient's own voice speaks the translated sentence.
4. Deploy the voice server to the OCI GPU instance next to the lip-reading server.
5. With Clark: play `/speak/stream` in the frontend when a `final` arrives, and add the nurse confirmation step.

## Conventions

- Python, FastAPI, keep things simple and demo-focused. This is a hackathon, so working end to end beats perfect.
- Do not change the endpoint shapes or the phrase list without telling the other owners.
- Keep large binaries and voice recordings out of git. A voice clone of a real person is sensitive data.
- Work on your own branch (`voice` for the voice code), push, and merge when the parts talk to each other.
- In any written copy for the pitch or README, avoid em dashes.
