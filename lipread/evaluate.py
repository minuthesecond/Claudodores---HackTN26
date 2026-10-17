"""Score the lip reader on labelled clips. Run: python lipread/evaluate.py [--clips DIR] [--only spoken|silent]

Clips are named <id>_<spoken|silent|unspoken>[_<take>].MOV, where <id> is a line in sentences.txt.
Prints the guess for each clip and the word error rate (WER) for two settings:
  single = one recording window, as the live view does by default
  vote   = three windows with different padding; the answer closest to the others wins
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

from phrase import consensus, load_clip, read_variants, word_errors, words
from vsr import LipReader

ROOT = Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("--clips", default=str(ROOT / "clips"))
ap.add_argument("--only", choices=["spoken", "silent"])
args = ap.parse_args()

sentences = dict(
    line.split("|", 1) for line in (ROOT / "sentences.txt").read_text().splitlines() if "|" in line and not line.startswith("#")
)
name = re.compile(r"^([a-z0-9]+)_(spoken|unspoken|silent)(?:_(\d+))?\.(mov|mp4)$", re.I)
files = sorted(p for p in Path(args.clips).iterdir() if name.match(p.name))
assert files, f"no clips named <id>_<spoken|unspoken>.MOV in {args.clips}"

reader = LipReader()
errors, total = defaultdict(int), defaultdict(int)
for path in files:
    sid, mode, _, _ = name.match(path.name).groups()
    mode = "spoken" if mode.lower() == "spoken" else "silent"  # "unspoken" counts as silent
    if args.only and mode != args.only:
        continue
    ref = sentences[sid.lower()]
    hyps = read_variants(reader, load_clip(path))
    single, vote = (hyps[0] if hyps else ""), consensus(hyps)
    if not hyps:
        print(f"{path.name}: lips never detected as moving, counted as all words wrong")
    print(f"{path.name}\n  said:   {ref}\n  single: {single}\n  vote:   {vote}   (windows: {hyps})")
    for label, hyp in (("single", single), ("vote", vote)):
        errors[mode, label] += word_errors(ref, hyp)
        total[mode, label] += len(words(ref))

print("\nWord error rate (lower is better):")
for mode in ("spoken", "silent"):
    if total[mode, "single"]:
        n = total[mode, "single"]
        print(f"  {mode:<7} single {errors[mode, 'single'] / n:6.1%}   vote {errors[mode, 'vote'] / n:6.1%}   ({n} reference words)")
