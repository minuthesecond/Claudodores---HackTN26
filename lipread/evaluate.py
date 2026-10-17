"""Score the lip reader on labelled clips.
Run: python lipread/evaluate.py [--clips DIR] [--only spoken|silent] [--decoys] [--vote]

Clips are named <id>_<spoken|silent|unspoken>[_<take>].MOV, where <id> is a line in sentences.txt.
For each clip it prints the free-form guess and its word error rate (WER), plus how it picks a sentence
from the phrase list (sentences.txt, and decoys.txt too with --decoys):
  nearest = the listed sentence whose words are closest to the free-form guess
  scored  = the listed sentence the model itself finds most likely for the video
  final   = the sentence both agree on, "unsure" when they disagree, or "no match" when the guess isn't
            close to any sentence (what live.py --phrases shows)
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

from phrase import SINGLE, consensus, load_clip, load_phrases, pick_phrase, read_variants, window, word_errors, words
from vsr import LipReader

ROOT = Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("--clips", default=str(ROOT / "clips"))
ap.add_argument("--only", choices=["spoken", "silent"])
ap.add_argument("--decoys", action="store_true", help="add the look-alike sentences in decoys.txt to the phrase list")
ap.add_argument("--vote", action="store_true", help="also report WER for 3-window voting (3x slower)")
args = ap.parse_args()

sentences = dict(
    line.split("|", 1) for line in (ROOT / "sentences.txt").read_text().splitlines() if "|" in line and not line.startswith("#")
)
phrases = list(sentences.values()) + (load_phrases(ROOT / "decoys.txt") if args.decoys else [])
name = re.compile(r"^([a-z0-9]+)_(spoken|unspoken|silent)(?:_(\d+))?\.(mov|mp4)$", re.I)
files = sorted(p for p in Path(args.clips).iterdir() if name.match(p.name))
assert files, f"no clips named <id>_<spoken|unspoken>.MOV in {args.clips}"

reader = LipReader()
errors, total, vote_errors = defaultdict(int), defaultdict(int), defaultdict(int)
count = defaultdict(lambda: defaultdict(int))  # count[mode][outcome]
print(f"phrase list: {len(phrases)} sentences\n")
for path in files:
    sid, mode, _, _ = name.match(path.name).groups()
    mode = "spoken" if mode.lower() == "spoken" else "silent"  # "unspoken" counts as silent
    if args.only and mode != args.only:
        continue
    said = sentences[sid.lower()]
    clip = load_clip(path)
    win = window(clip, *SINGLE)
    if win is None:
        print(f"{path.name}: lips never detected as moving, counted as all words wrong\n")
        text, match, scored, near = "", None, None, None
    else:
        text, ranked = reader.read(*win, phrases=phrases)
        text = text.strip().lower()
        match, scored, near = pick_phrase(text, ranked, phrases)
    final = "right" if match == said else "wrong" if match else "unsure" if near else "no match"
    count[mode]["clips"] += 1
    count[mode]["nearest"] += near == said
    count[mode]["scored"] += scored == said
    count[mode][final] += 1
    errors[mode] += word_errors(said, text)
    total[mode] += len(words(said))
    mark = lambda picked: "ok   " if picked == said else "WRONG"
    print(f"{path.name}\n  said:    {said}\n  guess:   {text}")
    print(f"  nearest: {mark(near)} {near}\n  scored:  {mark(scored)} {scored}\n  final:   {final}")
    if args.vote:
        vote = consensus(read_variants(reader, clip))
        vote_errors[mode] += word_errors(said, vote)
        print(f"  vote:    {vote}")
    print()

print("Results:")
for mode in ("spoken", "silent"):
    c = count[mode]
    if not c["clips"]:
        continue
    wer = f"WER {errors[mode] / total[mode]:6.1%}" + (f" (vote {vote_errors[mode] / total[mode]:6.1%})" if args.vote else "")
    print(f"  {mode:<7} {wer}   right sentence: nearest {c['nearest']}/{c['clips']}, scored {c['scored']}/{c['clips']}")
    print(f"          final: {c['right']} right, {c['wrong']} wrong, {c['unsure']} unsure, "
          f"{c['no match']} no match (guess shown)")
