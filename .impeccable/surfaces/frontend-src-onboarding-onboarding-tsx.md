---
version: 1
slug: "frontend-src-onboarding-onboarding-tsx"
primary_target: "frontend/src/onboarding/Onboarding.tsx"
related_targets: ["frontend/src/onboarding/onboarding.css"]
---

# Onboarding (/start, /login)

Mode: Operate (first-run flow). Audience: a patient (or a judge) who clicked "Try the live demo"; on a laptop, often an older adult, maybe anxious about losing their voice. Job: give a name, bank about a minute of voice, make an account that keeps it, land in the reader using that voice. Constraint: inherits the Unspoken world (DESIGN.md); the reader's quiet register, not the landing page's theatre. Skip is always visible; "try without an account" on the first screen.

## Direction contract

THESIS: Onboarding is one question per screen, minimal. A single centred column on card stock: the ask in big type, one control, quiet Back/Skip at the foot. Making the voice is its own step with real progress, so no screen ever waits on a spinner label. Refuses the multi-panel wizard (rail + form + side panel) the first two versions had.

OWN-WORLD: Card-stock page, paper wells for inputs and the sample, ink primary buttons (cobalt on hover), a thin three-segment progress line (done ink, current cobalt), orange only for the live recording. Atkinson Hyperlegible 800 for the ask, mono for seconds and timers. The small two-ink mouth is the only mark. Sentence case.

STORY: The visitor understands they are giving Unspoken their voice, sees it grow second by second, hears it speak as them, and leaves with an account that keeps it.

FIRST VIEWPORT: 64px top bar (wordmark, Log in) with no border; the three-segment progress line under it at the column width (560px); then a 600px column: the ask in 46px 800, a one-line lede, the single input or control, the primary ink button. Back and Skip sit at the bottom of the screen.

FORM: One sentence, voice meter. Dealt lead, #4 on the ordered list. seed:00a07ba273e5b2ea. Signature move: the mouth above the sentence opens with the live microphone level while recording; while the voice is being made it replays the real jaw trace. Revised on the user's ask for a minimal version: one column replaced the rail + panel layout.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
