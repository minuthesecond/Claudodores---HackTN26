# Voicebank

Banks a patient's voice before they lose it, then speaks every lip-read sentence in that voice.
Spec and per-step goals: [`../.plans/voice-banking-spec.md`](../.plans/voice-banking-spec.md).

Everything for the feature is in this folder: its own server (:8003), venv, data and UI source.
`voice/` and `lipread/` are untouched.

## Run

```sh
./voicebank/run.sh            # first run makes voicebank/.venv; reuses voice/'s XTTS-v2 download
./voicebank/run.sh --test     # unit tests
./voicebank/tests/smoke.sh    # end-to-end goals against the running server
```

Then open http://localhost:5173/app. **Speaks as** and **Voices** appear in the header once the
server is up. Voices → New voice → record the 8 prompts → Build → listen → Use this voice.

Env vars: `PORT` (8003), `VOICE_DEVICE` (`mps`/`cuda`/`cpu`), `VOICEBANK_DATA` (default
`voicebank/data`), `VOICEBANK_ENGINE` (`xtts`). In the frontend, `VOICEBANK_URL` points the dev
proxy elsewhere.

## Files

- `server.py`: routes (profiles, recordings, build/approve, `/speak/stream`)
- `banking.py`: ffmpeg cleanup, upload limits, reference-clip selection
- `engines/`: `VoiceEngine` interface plus the XTTS-v2 implementation (swap it for a commercially licensed engine)
- `store.py`: SQLite index plus a folder per voice (`data/`, gitignored)
- `prompts.py`: what the patient reads, and the ICU phrases pre-spoken in each voice
- `ui/`: the reader's voice picker and the Voices slide-over, imported as `@voicebank`

## Hooks outside this folder

`frontend/vite.config.ts` (proxy, alias), `frontend/tsconfig.json` (include, paths),
`frontend/src/lib/voice.ts` (`Speaker.setVoice`), `frontend/src/App.tsx` (picker + panel).
To remove the feature, delete this folder and revert those four files.
