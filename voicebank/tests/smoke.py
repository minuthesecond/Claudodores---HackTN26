"""
End-to-end check of a running voicebank server (the per-step goals in .plans/voice-banking-spec.md).

    ./tests/smoke.sh            # every step, against http://localhost:8003
    ./tests/smoke.sh 2          # just step 2
    VOICEBANK_URL=http://host:8003 ./tests/smoke.sh

Uses the repo's own clips (talking.MOV is spoken; lip_talking.MOV is silent mouthing), creates throwaway voices and
deletes them at the end. Prints one PASS/FAIL line per goal; exits 1 if any fail.
"""

import http.client
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("VOICEBANK_URL", "http://localhost:8003").rstrip("/")
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPEECH = os.path.join(REPO, "talking.MOV")      # spoken out loud (~2.4 s of speech)
MOUTHED = os.path.join(REPO, "lip_talking.MOV")  # mouthed almost silently: no voice in it
DATA = os.environ.get("VOICEBANK_DATA", os.path.join(REPO, "voicebank", "data"))
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}{f'  ({detail})' if detail else ''}", flush=True)


def call(method, path, body=None, form=None):
    """(status, parsed JSON or raw bytes)"""
    headers, data = {}, None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if form is not None:
        boundary = uuid.uuid4().hex
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        parts = []
        for key, value in form.items():
            if isinstance(value, tuple):  # (filename, bytes)
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; '
                             f'filename="{value[0]}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
                             + value[1] + b"\r\n")
            else:
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw, status = res.read(), res.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, raw


def upload(pid, prompt, path, kind="recording"):
    form = {"kind": kind}
    if prompt is not None:
        form["prompt"] = prompt
    with open(path, "rb") as f:
        form["file"] = (os.path.basename(path), f.read())
    return call("POST", f"/profiles/{pid}/media", form=form)


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def stream_timing(pid, text):
    """(seconds to first audio byte, seconds of audio)"""
    q = urllib.parse.urlencode({"profile": pid, "text": text})
    t0 = time.time()
    with urllib.request.urlopen(f"{BASE}/speak/stream?{q}", timeout=120) as res:
        header = res.read(44)
        first = res.read(2048)
        t_first = time.time() - t0
        rest = res.read()
    assert header[:4] == b"RIFF"
    return t_first, (len(first) + len(rest)) / 2 / 24000


def step1():
    print("Step 1: record a voice and speak in it")
    status, body = call("POST", "/profiles", {"name": "Smoke test", "consent": False})
    check("create without consent is refused", status == 400, body.get("detail", ""))

    status, p = call("POST", "/profiles", {"name": "Smoke test", "consent": True})
    check("create with consent makes a draft", status == 200 and p["status"] == "draft")
    pid = p["id"]
    try:
        status, p = upload(pid, 0, SPEECH)
        take = [m for m in p["media"] if m["prompt"] == 0]
        check("recording is decoded and measured", status == 200 and take and take[0]["status"] == "ready"
              and take[0]["duration_s"] > 1, f"{take[0]['duration_s'] if take else '?'} s")

        status, p = upload(pid, 0, SPEECH)
        check("re-recording a prompt replaces it", len([m for m in p["media"] if m["prompt"] == 0]) == 1)

        status, body = call("POST", f"/profiles/{pid}/build")
        check("build below 6 s is refused clearly", status == 400 and "at least" in body.get("detail", ""),
              body.get("detail", ""))

        status, p = upload(pid, 1, MOUTHED)
        take = [m for m in p["media"] if m["prompt"] == 1][0]
        check("a silently mouthed take is rejected", take["status"] == "failed", take["error"] or "accepted")

        upload(pid, 1, SPEECH)
        status, p = upload(pid, 2, SPEECH)
        t0 = time.time()
        status, p = call("POST", f"/profiles/{pid}/build")
        check("build makes a preview voice", status == 200 and p["status"] == "preview",
              f"{p.get('speech_seconds')} s of speech, {time.time() - t0:.1f} s to build")

        t_first, secs = stream_timing(pid, "hello, this is a test of my banked voice.")
        check("streamed speech has audio", secs > 1, f"{secs:.1f} s of audio")
        check("first audio arrives in under 2 s", t_first < 2, f"{t_first:.2f} s")

        status, p = call("POST", f"/profiles/{pid}/approve")
        check("approve marks it in use", status == 200 and p["status"] == "approved")
        deadline = time.time() + 120
        while time.time() < deadline:
            _, p = call("GET", f"/profiles/{pid}")
            if p["phrases"]["done"] == p["phrases"]["total"] and not p["phrases"]["warming"]:
                break
            time.sleep(1)
        check("all ICU phrases are pre-spoken", p["phrases"]["done"] == p["phrases"]["total"],
              f"{p['phrases']['done']}/{p['phrases']['total']}")
        t_first, _ = stream_timing(pid, "i need water")
        check("a cached phrase starts instantly", t_first < 0.2, f"{t_first * 1000:.0f} ms")
    finally:
        status, _ = call("DELETE", f"/profiles/{pid}")
        gone, _ = call("GET", f"/profiles/{pid}")
        check("delete removes the voice", status == 200 and gone == 404)



def wait_processed(pid, timeout=300):
    """Polls until no upload is processing; returns (profile, stages seen)."""
    seen, deadline = set(), time.time() + timeout
    while time.time() < deadline:
        _, p = call("GET", f"/profiles/{pid}")
        seen |= {m["stage"] for m in p["media"] if m["stage"]}
        if not p["processing"]:
            return p, seen
        time.sleep(0.5)
    return p, seen


def step2():
    print("\nStep 2: upload old videos")
    tmp = tempfile.mkdtemp(prefix="vb-smoke-")
    _, p = call("POST", "/profiles", {"name": "Smoke test uploads", "consent": True})
    pid = p["id"]
    try:
        # A 501 MB upload is refused from its headers, before any body is sent
        conn = http.client.HTTPConnection(*BASE.split("//")[1].split(":"), timeout=30)
        conn.putrequest("POST", f"/profiles/{pid}/media")
        conn.putheader("Content-Type", "multipart/form-data; boundary=x")
        conn.putheader("Content-Length", str(501 * 1024 * 1024))
        conn.endheaders()
        res = conn.getresponse()
        check("501 MB upload refused before processing", res.status == 413, json.loads(res.read())["detail"])
        conn.close()

        long = os.path.join(tmp, "long.m4a")
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=200:duration=960", "-b:a", "16k", long)
        status, body = upload(pid, None, long, "upload")
        check("16 min file refused", status == 422, body.get("detail", ""))

        mute = os.path.join(tmp, "mute.mp4")
        ffmpeg("-f", "lavfi", "-i", "color=black:size=64x64:duration=2", mute)
        status, body = upload(pid, None, mute, "upload")
        check("video with no audio track refused clearly", status == 422 and "no audio" in body.get("detail", ""),
              body.get("detail", ""))

        # Three phone-style videos: two with music under the speech (talking.MOV looped 3x, ~9 s),
        # one plain. The music plays the whole time, so Demucs has to take it out.
        vids = []
        for i, freq in enumerate([220, 330]):
            music = f"aevalsrc='0.2*sin(2*PI*{freq}*t)*(1+sin(2*PI*2*t))/2+0.15*sin(2*PI*{freq * 1.5}*t)':s=44100:d=10"
            out = os.path.join(tmp, f"party{i}.mp4")
            ffmpeg("-stream_loop", "2", "-i", SPEECH, "-f", "lavfi", "-i", music, "-filter_complex",
                   "[0:a]volume=2[s];[s][1:a]amix=inputs=2:duration=first:normalize=0[a]",
                   "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", out)
            vids.append(out)
        vids.append(SPEECH)
        t0 = time.time()
        for v in vids:
            status, p = upload(pid, None, v, "upload")
        check("uploads are accepted and queued", status == 200 and p["processing"] >= 1, f"{p['processing']} processing")
        p, seen = wait_processed(pid)
        ups = [m for m in p["media"] if m["kind"] == "upload"]
        ready = [m for m in ups if m["status"] == "ready"]
        check("every upload finishes processing", len(ready) == 3,
              f"{len(ready)}/3 ready in {time.time() - t0:.1f} s, stages seen: {sorted(seen)}; "
              + "; ".join(f"{m['filename']}: {m['duration_s']} s" for m in ups))

        files = [os.path.relpath(os.path.join(d, f), os.path.join(DATA, "voices", pid))
                 for d, _, fs in os.walk(os.path.join(DATA, "voices", pid)) for f in fs]
        videos = [f for f in files if os.path.splitext(f)[1].lower() in (".mp4", ".mov", ".m4a", ".webm")]
        check("no video stays on disk, only cleaned audio", not videos and all(f.startswith("media/") and f.endswith(".wav")
              for f in files), ", ".join(sorted(files)))

        status, p = call("POST", f"/profiles/{pid}/build")
        check("a voice builds from uploads alone", status == 200 and p["status"] == "preview",
              p.get("detail") or f"{p['speech_seconds']} s of speech")
        if status == 200:
            _, secs = stream_timing(pid, "this voice came from old videos.")
            check("it speaks", secs > 1, f"{secs:.1f} s of audio")
    finally:
        call("DELETE", f"/profiles/{pid}")
        subprocess.run(["rm", "-rf", tmp])


STEPS = {"1": step1, "2": step2}


def main():
    status, health = call("GET", "/health")
    if status != 200:
        print(f"Voicebank isn't running at {BASE}: start it with ./run.sh")
        return 1
    print(f"voicebank at {BASE} on {health['device']} ({health['engine']})\n")
    for key in sys.argv[1:] or STEPS:
        STEPS[key]()
    print(f"\n{sum(results)}/{len(results)} passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
