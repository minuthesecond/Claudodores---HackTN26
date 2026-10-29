"""
ICU phrases, and snapping noisy lip-read text to the closest one.

Lip reading gets about one word in five wrong, worse on silent mouthing, so "i say water"
often means "i need water". snap() picks the ICU phrase that looks most like the text and
returns it only when the match is close; anything else is passed through unchanged, so the
patient can still say things that aren't on the list. A nurse confirms anything clinical.

Test:  python phrases.py "i say water"
"""

import difflib
import sys

# Pre-spoken at voice-server startup so these play instantly during the demo
PHRASES = [
    "i am in pain", "i can't breathe", "i need water", "call the nurse",
    "call my family", "i am cold", "i am hot", "yes", "no", "thank you",
    "i need to use the bathroom", "where am i", "i am scared", "i need suction",
]

THRESHOLD = 0.75  # 0..1; below this the text is left as it was read
NEGATIONS = {"not", "no", "never", "cannot", "can't", "cant", "don't", "dont", "won't", "wont", "isn't", "isnt"}
SPELLED_OUT = {"i'm": "i am", "im": "i am", "cant": "can't"}  # match the phrase list's wording


def similarity(a, b):
    """Average of word-level and letter-level likeness, so both a swapped word
    ("i need some water") and a misspelled one ("i am in paint") still score high."""
    words = difflib.SequenceMatcher(None, a.split(), b.split()).ratio()
    letters = difflib.SequenceMatcher(None, a, b).ratio()
    return (words + letters) / 2


def allowed(text, phrase):
    """A snap must not change what the patient meant: never flip a negation
    ("i can breathe" is not "i can't breathe") and never add words they didn't say
    ("i am" is not "i am hot")."""
    t, p = set(text.split()), set(phrase.split())
    return bool(t & NEGATIONS) == bool(p & NEGATIONS) and not t < p


def snap(text, threshold=THRESHOLD):
    """Returns (text to speak, matched ICU phrase or None, score)."""
    text = " ".join(SPELLED_OUT.get(w, w) for w in text.lower().split())
    candidates = [p for p in PHRASES if allowed(text, p)]
    if not text or not candidates:
        return text, None, 0.0
    best = max(candidates, key=lambda p: similarity(text, p))
    score = similarity(text, best)
    return (best, best, score) if score >= threshold else (text, None, score)


if __name__ == "__main__":
    for t in sys.argv[1:] or ["i say water", "i need some water", "call the nurses", "my name is john"]:
        out, phrase, score = snap(t)
        print(f"{t!r:28} -> {out!r:24} ({score:.2f}{', ICU phrase' if phrase else ''})")
