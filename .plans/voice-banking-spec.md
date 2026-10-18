# Voice banking spec

Speak every lip-read sentence in the patient's own voice, learned from a short recording made
before surgery or from old family videos.

**Target:** demo day, on one laptop (M3 Pro, `mps`). Design so it can move to AWS or Oracle Cloud
later without a rewrite.

**Containment rule:** the whole feature lives in **one folder, `voicebank/`**. It has its own
server, venv, requirements, launcher, data and UI source. `voice/` and `lipread/` are not modified
at all. Outside the folder there are exactly four small hook edits in `frontend/` (listed under
"Integration"). Removing the feature means deleting `voicebank/` and reverting those four edits.

## What exists today

- `voice/voice.py` already clones zero-shot with XTTS-v2 (`get_conditioning_latents`), but only
  from one global file (`VOICE_SAMPLE` env var). Voicebank reuses the same technique in its own
  code and does not change this file.
- The voice server (:8001) speaks built-in voices. That stays exactly as it is.
- The frontend's `Speaker` (`frontend/src/lib/voice.ts`) streams from `/voice/speak/stream`.

## Decisions

| Topic | Decision |
|---|---|
| Containment | Its own service in `voicebank/` on **:8003**, with its own `.venv`. It does the banking **and** speaks the banked voices. The voice server keeps speaking the built-in voices. |
| Clone method | Zero-shot XTTS-v2 from several reference clips (latents are averaged). No fine-tuning. |
| Sources | (a) Live recording in the reader, from guided prompts. (b) Uploaded old videos (main path: families). |
| Video | Extract the audio and delete the video right away. Lip personalization is a separate future spec. |
| Isolating the patient | Automatic (pyannote diarization + Demucs vocal isolation) **and** manual trim in the UI. |
| Choosing the speaker | Diarize, then play a ~3 s sample of each speaker. The user taps "this is them", and that speaker is matched by voice embedding across all uploaded media. |
| Profiles | Many saved voices. The reader has a picker. |
| Where | Everything in the reader (`/app`), in a slide-over panel. Done at the bedside only, no share links yet. |
| Approval | Play a preview sentence, then **Use** or **Redo**, with quality warnings. |
| Too little speech | Warn (e.g. "14 s found, 30 s+ recommended") but allow approval. |
| Processing | Inside the voicebank server, in a background thread. Only the short XTTS steps take voicebank's own lock. |
| Storage | `voicebank/data/`: one folder per voice plus a SQLite index. |
| Phrase cache | The 13 ICU phrases are pre-spoken in the new voice when it is approved. |
| Consent | A required checkbox when creating a voice. **Delete** removes everything for that voice. |
| License | Keep XTTS-v2 for the demo, behind a small `VoiceEngine` interface so a commercially licensed engine can replace it. |

## How much audio (sets the upload caps)

From the installed coqui-tts 0.27.5 source (`Xtts.get_conditioning_latents`): a speaker embedding
is computed from each reference (up to `max_ref_length`, default 30 s) and the embeddings are
averaged; the GPT/prosody latent reads only the first `gpt_cond_len` seconds of all references
joined (default **6 s**, which is lower than the docs' 12 s). Voicebank passes `max_ref_length=15`,
`gpt_cond_len=30`, `gpt_cond_chunk_len=6` and puts the best clips first. One small study found the gains level off after about 10–20 s
of clean speech. More audio helps only by giving more varied clean clips to average.

| Limit | Value | Why |
|---|---|---|
| Upload size per file | **500 MB** | Covers a ~5 min 1080p phone clip. Checked in the browser (`file.size`) and enforced by the server while streaming (reject after 500 MB, `413`). |
| Media length per file | **15 min** | Longer clips add diarization time, not quality. ffprobe rejects them before any processing. |
| Files per voice | **10** | Enough variety. Limits disk use and processing time. |
| Kept reference audio | **Up to 8 clips × 6–15 s, ≤ 90 s total** | Matches the XTTS conditioning windows. Clips are ranked by cleanness and speaker-match score. |
| Target clean speech | **30–60 s**. Warning below 30 s. Hard floor 6 s (cannot build below that). | |

Storage per approved voice: ~90 s × 48 KB/s ≈ 4.3 MB of references, plus latents (KBs), plus 13
cached phrases (~1.5 MB). After processing, intermediate audio (extracted tracks and Demucs output)
is deleted and only the selected reference clips are kept.

## User flow (reader slide-over)

1. **Voices panel**: a list of saved voices (name, created, seconds of speech, status), plus
   **New voice**.
2. **New voice**: patient name, consent checkbox ("I am the patient, or authorized by them or their
   family, to create this voice"), then choose **Record** or **Upload videos** (both can be added to
   the same voice).
3. **Record**: 6–8 on-screen prompts, about 45 s in total. Includes ICU phrases ("I need water",
   "call the nurse") plus phonetically rich lines (Rainbow Passage). A level meter warns about
   clipping or a too-quiet signal. Prompts can be re-recorded one at a time. Uses MediaRecorder,
   audio only.
4. **Upload**: drag in up to 10 files (video or audio). Each one shows progress through *uploading →
   extracting → removing background → finding speakers*.
5. **Who is the patient?** For each new upload with more than one speaker, show speaker cards with a
   ▶ 3 s sample each. The user picks one. Every other file is then auto-matched to that voice, and
   low-confidence matches are flagged for review. A single-speaker file or a live recording skips
   this step.
6. **Review segments**: a waveform per file with the auto-selected patient segments highlighted.
   The user can drag to adjust, delete, or add segments (manual trim). A running total shows, e.g.
   "42 s of clean speech".
7. **Build & preview**: compute latents, then play a fixed preview sentence plus a custom text box.
   Warnings appear here: too little speech, low speaker-match confidence, or clipping.
8. **Use this voice**: the voice is marked approved, the ICU phrases are pre-spoken in the
   background ("Preparing common phrases… 6/13"), and it is selected in the reader. **Redo** returns
   to step 6.
9. **Reader header**: a compact voice dropdown listing "Default (built-in)" plus the approved
   voices. The selected voice is saved in `localStorage`. **Delete** (with confirm) is in the Voices
   panel.

## Processing pipeline (voicebank server, background thread per job)

```
upload (streamed to disk, size-capped)
 → ffprobe: check duration ≤ 15 min, has an audio stream
 → ffmpeg: extract mono 16 kHz WAV and delete the original video
 → Demucs htdemucs --two-stems vocals: keep vocals.wav, drop the accompaniment
 → pyannote speaker-diarization-3.1 on vocals: speaker turns + an embedding per speaker
 → speaker samples: the 3 s with the most speech per speaker, for the picker
 → (after the patient is picked) cosine match of speaker embeddings across all media
    (threshold ~0.5, tuned on teammates' videos; between 0.4 and 0.5 = "review")
 → segment selection: patient-only turns, no overlap with other speakers,
    split/trim to 6–15 s, rank by SNR + match score, keep ≤ 8 clips / ≤ 90 s
 → resample selected clips to 24 kHz and loudness-normalize, write refs/*.wav
 → [lock] engine.clone(refs) → latents.pt          (~1 s)
 → preview: [lock] stream the preview sentence
 → on approve: pre-speak the 13 phrases, taking the lock per phrase,
    so live sentences in that voice can run between them
```

Live recordings skip Demucs and diarization: they are trimmed for silence, normalized and then
selected. Only one banking job runs at a time, in a simple in-process queue.

Because voicebank is a separate process, banking never blocks the voice server. Both still share
the laptop GPU, so the first-audio latency during a Demucs run needs to be measured.

## Folder layout (everything new is here)

```
voicebank/
  README.md          what it is, how to run it, how to remove it
  run.sh             makes voicebank/.venv on first run (Python 3.11 via uv), installs deps, starts :8003
  requirements.txt   torch, torchaudio, coqui-tts[codec], pyannote.audio>=3.1,<4, demucs,
                     fastapi, uvicorn[standard], python-multipart
  .gitignore         .venv/, data/
  server.py          FastAPI app: /profiles routes + /speak/stream for banked voices + /health
  engines/
    base.py          VoiceEngine: clone(ref_wavs) -> bytes; speak_stream(text, voice_state, lang) -> Iterator[bytes]
    xtts.py          XTTS-v2 implementation (own model instance, own lock)
  banking.py         the pipeline above (ffmpeg, Demucs, pyannote, selection)
  store.py           SQLite + per-voice folders; the only file that knows paths (swap for S3/OCI later)
  prompts.py         guided recording script + ICU phrase list
  ui/                frontend source, imported by the reader through one alias
    VoicebankPanel.tsx   slide-over: list, new voice, record, upload, speaker pick, trim, preview
    VoicePicker.tsx      compact dropdown for the reader header
    api.ts               fetch helpers for /voicebank/*
    voicebank.css
  tests/
    test_selection.py, test_limits.py, test_store.py
  data/              (gitignored) voicebank.db, voices/<id>/{refs/*.wav, latents.pt, phrases/*.wav, media/<mid>/… temp}
```

SQLite tables (`data/voicebank.db`):
- `profiles(id, name, status, consent_at, created_at, speech_seconds, approved_at)`. Status is one
  of `draft | processing | needs_speaker | review | preview | approved | failed`.
- `media(id, profile_id, kind[recording|upload], filename, duration_s, status, error)`
- `speakers(id, media_id, label, embedding BLOB, sample_path, match_score, is_patient)`
- `segments(id, media_id, start_s, end_s, source[auto|manual], selected)`

## API (voicebank server, :8003, proxied as `/voicebank`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ok, device, auto_isolation: bool}` (false without `HF_TOKEN`) |
| GET | `/profiles` | list |
| POST | `/profiles` `{name, consent: true}` | create a draft (400 without consent) |
| GET | `/profiles/{id}` | status, media, speakers, segments, speech seconds, warnings (the UI polls every 1 s while processing) |
| POST | `/profiles/{id}/media` multipart `file`, `kind` | upload or recording. 413 above 500 MB, 422 above 15 min or with no audio |
| GET | `/profiles/{id}/speakers/{sid}/sample.wav` | 3 s sample for the picker |
| GET | `/profiles/{id}/media/{mid}/audio.wav` | vocals track for the waveform and manual trim |
| POST | `/profiles/{id}/patient` `{speaker_id}` | mark the patient, auto-match across media |
| PUT | `/profiles/{id}/segments` `[{media_id, start_s, end_s}]` | manual trim result |
| POST | `/profiles/{id}/build` | select refs + compute latents, then status → preview |
| POST | `/profiles/{id}/approve` | status → approved, start pre-speaking the phrases |
| DELETE | `/profiles/{id}` | remove the folder, rows and cached phrases |
| GET | `/speak/stream?profile={id}&text=…` | same WAV-header + PCM stream format as the voice server, so `Speaker` plays it unchanged |

## Integration: the only edits outside `voicebank/`

(`frontend/tsconfig.json` is a fourth: it includes `../voicebank/ui` and maps `@voicebank` and
`react` there, because that folder has no `node_modules` of its own.)

1. `frontend/vite.config.ts`: add one proxy entry `'/voicebank' → http://localhost:8003` (with the
   `VOICEBANK_URL` env var, like the existing two), plus a `@voicebank` alias pointing at
   `../voicebank/ui`.
2. `frontend/src/lib/voice.ts`: `Speaker` gets a `setVoice(profileId | null)`. When a profile is set,
   it streams from `/voicebank/speak/stream?profile=…`; otherwise it uses `/voice/speak/stream` as
   it does today. About 10 lines.
3. `frontend/src/App.tsx` (or `Controls.tsx`): render `<VoicePicker>` in the header and
   `<VoicebankPanel>` as the slide-over, both imported from `@voicebank`.

If the voicebank server is offline, the picker hides itself and speech falls back to the built-in
voice, the same way the existing voice-offline handling works.

## Dependencies and setup

- Voicebank has its own `.venv`, so pyannote and Demucs can never break the lip reader's or the
  voice server's torch. ffmpeg is already required by the repo.
- pyannote models are gated: you need a free Hugging Face token (`HF_TOKEN`), and must accept the
  terms for `pyannote/speaker-diarization-3.1` and `pyannote/segmentation-3.0` once. Without the
  token, `run.sh` prints a clear message and auto-isolation is turned off (manual trim still
  works).
- A second XTTS-v2 copy is loaded in this process (~2 GB of GPU/unified memory). That's fine on
  the M3 Pro. Merging with the voice server is a later step, once the feature is proven.
- Download everything before demo day; on stage, nothing should need the internet.

## Build order

1. **Service skeleton + recording.** `run.sh`, `store.py`, `VoiceEngine`/`XTTSEngine`, `/profiles`
   routes, guided recording, build/preview/approve, `/speak/stream`, then the four frontend hooks
   and the picker. This is enough to demo a cloned voice.
2. **Uploads.** Size and length caps, ffmpeg extraction, deleting the video, Demucs.
3. **Auto-isolation.** pyannote, the speaker picker, cross-media matching, segment ranking.
4. **Manual trim.** Waveform editor, warnings, and phrase pre-speak progress.

## Goals per step (test as we go)

Each step is done only when every box passes. **Auto** = a command anyone can run
(`voicebank/run.sh --test` for unit tests, `voicebank/tests/smoke.sh` against a running server).
**Hands-on** = needs a person, a mic and ears, at http://localhost:5173/app.

### Step 1: record a voice and speak in it
- [x] Auto: unit tests pass (selection caps, decode/limits, store delete).
- [x] Auto: `frontend` typechecks (`npx tsc -b`), and `git diff --stat` shows changes only in `voicebank/`, `.plans/` and the 4 frontend hook files.
- [x] Auto (smoke): create without consent → 400; create with consent → draft.
- [x] Auto (smoke): upload a speech clip as a recording → `ready`, with a duration; re-uploading the same prompt replaces it (still one take).
- [x] Auto (smoke): build below 6 s → 400 with a clear message; build at ≥ 6 s → `preview` and `latents.pt` exists.
- [x] Auto (smoke): `/speak/stream?profile=…` returns a WAV with > 1 s of audio; first byte < 2 s on `mps`.
- [x] Auto (smoke): approve → `approved`; all 13 phrases cached within ~60 s; a cached phrase streams instantly (< 200 ms).
- [x] Auto (smoke): delete → 404 afterwards, and the voice's folder is gone.
- [ ] Hands-on: open Voices, create a voice, record all 8 prompts; the level meter moves; ▶ plays each take back.
- [ ] Hands-on: build, preview: a teammate can tell whose voice it is.
- [ ] Hands-on: Use this voice → the header picker shows it; mouthing a sentence in the reader speaks it in that voice.
- [ ] Hands-on: stop the voicebank server → the picker disappears and speech falls back to the built-in voice; nothing else in the reader breaks.

### Step 2: upload old videos
- [x] Auto: a 501 MB file → 413 before processing; a 16 min file → 422; a video with no audio track → a clear error.
- [x] Auto: after an upload, no video file remains on disk (only `media/<mid>.wav`).
- [x] Auto: a music-over-speech clip comes out of Demucs with the music clearly lower (vocals RMS ≫ accompaniment RMS).
- [ ] Hands-on: drag in 3 phone videos; per-file progress shows each stage; the voice builds from them alone.

### Step 3: automatic speaker isolation
- [ ] Auto: a 2-speaker test clip is diarized into 2 speakers with samples.
- [ ] Auto: picking the patient in one file auto-marks the same speaker in a second file (match ≥ threshold); a different person stays unmarked.
- [ ] Auto: without `HF_TOKEN`, `/health` reports `auto_isolation: false`, and uploads still work with manual trim.
- [ ] Hands-on: a group birthday video → pick the patient from the 3 s samples → the preview sounds like them, not like anyone else in the clip.

### Step 4: manual trim and polish
- [ ] Auto: `PUT /segments` replaces the auto selection; a build uses only those ranges.
- [ ] Hands-on: drag a segment edge on the waveform; the speech total updates; a rebuild changes the preview.
- [ ] Hands-on: while a long Demucs job runs, a live sentence in the reader still starts speaking within ~1 s.

## Testing (all under `voicebank/tests/`)

- Unit: segment selection (caps, overlap removal, ranking) on fixed diarization output; upload
  limits; store delete removes every file.
- Integration: `talking.MOV` → profile → preview WAV is produced and `/speak/stream?profile=…`
  returns audio.
- Manual: each teammate makes a voice from (a) a guided recording and (b) a noisy group video, and
  the others judge by ear whether it sounds like them. Also measure the first-audio latency of live
  speech while a Demucs job runs.

## Risks and open items

- **License:** XTTS-v2 (Coqui Public Model License) is non-commercial. A paid subscription needs a
  different engine, which the `VoiceEngine` interface is there to allow. pyannote and Demucs are
  MIT-licensed, but check pyannote's model card terms.
- **Old-video quality:** phone audio from noisy rooms may clone poorly even after Demucs, and the
  clone can copy Demucs artifacts. The preview step is the safeguard.
- **Wrong speaker:** diarization or matching can pick a sibling with a similar voice. Flagged
  matches and the preview are the guards.
- **Consent:** the checkbox is enough for the demo, not legally. A pilot needs a documented
  consent record, retention rules and PHI handling.
- **Cloud move:** microphone capture needs HTTPS. `store.py` maps to S3 or OCI Object Storage. A
  GPU instance is needed for XTTS latency. Banking can move to a worker queue once one server's
  lock becomes the bottleneck.
- **Misuse:** a cloned voice is a deepfake risk. Keep voices on-device or in the hospital, never
  export them, and log every use.
