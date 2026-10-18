"""
Speaks Joey's lip-reading captions out loud as they appear.

Joey's lipread/live.py writes every caption it reads to lipread/captions.json. This script
watches that file and plays each new caption through your speakers in the cloned voice,
using the voice server (voice_server.py) so audio starts while it's still being generated.

Run (three terminals, or two if you skip the webcam):
  python voice/voice_server.py                 # the voice
  python lipread/live.py                       # Joey's lip reader (writes captions.json)
  python voice/speak_captions.py               # this: speaks each new caption

Options:
  --all        also speak captions already in the file (e.g. from a finished --video run)
  --captions   path to the captions file (default: ../lipread/captions.json)
  --server     voice server URL (default: http://127.0.0.1:8001)
"""

import argparse
import json
import os
import time
import urllib.parse
import urllib.request

import sounddevice as sd

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_RATE = 24000  # what the voice server sends: 16-bit mono WAV
WAV_HEADER = 44


def load(path):
    """The captions list, or None if the file is missing or mid-write."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)["captions"]
    except (OSError, ValueError, KeyError):
        return None


def speakable(text):
    """live.py writes "(nothing)" or "(error: ...)" when it couldn't read a phrase."""
    return text and not text.startswith("(")


def speak(server, text):
    """Stream `text` from the voice server and play it as the audio arrives."""
    url = f"{server}/speak/stream?text={urllib.parse.quote(text)}"
    with urllib.request.urlopen(url, timeout=120) as r, \
            sd.RawOutputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16") as out:
        r.read(WAV_HEADER)
        leftover = b""
        while chunk := r.read(4096):
            chunk = leftover + chunk
            cut = len(chunk) - len(chunk) % 2  # samples are 2 bytes; keep a split one for next time
            out.write(chunk[:cut])
            leftover = chunk[cut:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--captions", default=os.path.join(HERE, "..", "lipread", "captions.json"))
    ap.add_argument("--server", default="http://127.0.0.1:8001")
    ap.add_argument("--all", action="store_true", help="also speak captions already in the file")
    args = ap.parse_args()

    captions = load(args.captions) or []
    seen = 0 if args.all else len(captions)
    print(f"Watching {os.path.abspath(args.captions)} ({seen} old captions skipped). Ctrl+C to stop.")

    while True:
        captions = load(args.captions)
        if captions is None:
            time.sleep(0.2)
            continue
        if len(captions) < seen:  # live.py restarted with a fresh file
            seen = 0
        for cap in captions[seen:]:
            text = cap.get("text", "")
            if speakable(text):
                print(f"speaking: {text}")
                try:
                    speak(args.server, text)
                except Exception as e:
                    print(f"  could not speak it: {e} (is voice_server.py running?)")
            else:
                print(f"skipping: {text}")
        seen = len(captions)
        time.sleep(0.2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
