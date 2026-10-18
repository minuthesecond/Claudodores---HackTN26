---
name: Unspoken
description: Speak again, in your own voice. The landing page drawn as a speech-therapy articulation deck.
colors:
  cobalt: "#1f3fbf"
  cobalt-deep: "#17319a"
  signal-orange: "#ff4a1c"
  ink: "#15161a"
  ink-2: "#464852"
  ink-3: "#5c5e68"
  card: "#fbfaf7"
  paper: "#f0f0ed"
  rule: "#d4d5d2"
  on-cobalt: "#fbfaf7"
  on-cobalt-2: "#c9d1f3"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(52px, 7.4vw, 104px)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(34px, 4.4vw, 64px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  claim:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(24px, 2.4vw, 34px)"
    fontWeight: 500
    lineHeight: 1.32
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  lede:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
  measure:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  measure-large:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, Menlo, monospace"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  tile: "8px"
  inset: "12px"
  button: "14px"
  card: "22px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  card-pad: "22px"
  stack: "24px"
  section: "clamp(96px, 14vh, 160px)"
  container: "1360px"
components:
  button-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 22px 0 24px"
    height: "54px"
  button-card-hover:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.ink}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.button}"
    padding: "0 22px 0 24px"
    height: "54px"
  button-ink-hover:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.card}"
  button-line:
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 22px 0 24px"
    height: "54px"
  button-line-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
  nav:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-cobalt}"
    height: "72px"
  articulation-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  card-band-bank:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.card}"
  card-band-train:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
  card-band-speak:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.ink}"
  state-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "30px"
    padding: "0 12px"
  state-pill-live:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.ink}"
  state-pill-final:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.card}"
  guess:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.inset}"
    padding: "13px 14px"
  guess-picked:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
---

# Design System: Unspoken

## Overview

**Creative North Star: "The Articulation Deck"**

Scope: this system governs both routes: the public landing page (`/`, `frontend/src/landing/`) and the `/app` lip reader (`frontend/src/App.tsx`, `frontend/src/components/`). Shared tokens, the fonts and the mouth drawing's styles live in `frontend/src/styles.css`; the landing page adds its own layer in `landing.css`. The reader is an Operate surface and deliberately quieter than the landing page: same palette and type, but flat card-stock panels on 1px hairlines (16px corners, 12px controls), a card-stock top bar instead of the cobalt band, no ring holes, no fanned cards, no table shadows. Cobalt marks on-states (switches, status dots, hover on primary buttons) and orange marks reading and speech (the live chip, the lip overlay, new words). The camera stage is an ink card; before the camera is on it is a plain card with a static mouth drawing and one ink button. Motion is limited to state feedback: words landing, caret blink, switches. No load choreography. The page never rubber-band scrolls. Onboarding (`/start`, `/login`, `frontend/src/onboarding/`) is quieter still: one centred 600px column on card stock, one question per screen in 800 type, paper input wells, ink buttons, a thin three-segment progress line, and the small mouth as the only mark (it moves with the microphone while recording). Slow server work (building a voice, generating speech) always shows a determinate-looking progress bar with named stages, never a bare loading label.

The landing page is a speech-language pathologist's deck of articulation cards laid on a cobalt table. Each card is die-cut from coated card stock with round corners and a punched ring hole; on it, a two-ink drawing of a mouth (upper lip in ink, lower lip in signal orange) becomes words in the patient's own voice. Proof sits on the top card: the real pipeline replay, the 96×96 model input clipped on as a small card of its own, and the real jawOpen trace. Concept screens of the planned phone app are drawn as articulation cards, never as phone frames.

The register is clinical-grade, not childlike: three inks only, Atkinson Hyperlegible for every word, its mono for every measurement, sentence case throughout, large confident 800-weight headlines with tight negative tracking. Density is low and sections breathe; the cobalt field and the orange field are the only full-bleed colour, with card stock and paper between them. Motion is the deck dealing: cards arrive fanned, and in the story section the top card slides off as you scroll.

**Key Characteristics:**
- Three inks (cobalt, signal orange, ink) on card stock and paper; every tint is an alpha of one of those inks.
- Die-cut cards (22px corners) with a punched ring hole, lifted off the table by a soft layered shadow.
- The brand's two-bar mouth: ink above, orange below. Orange is the lower lip wherever it appears.
- Words in Atkinson Hyperlegible Next; counts, clocks, values and footnote markers in Atkinson Hyperlegible Mono with tabular figures.
- Sentence case, no tracking on labels; negative tracking only on 800-weight display.
- The real jawOpen signal drives the mouth drawings and the replay graph; the motion is real speech without a face.

## Colors

Three printing inks on two white stocks: a cobalt table, a signal-orange accent that always plays the lower lip, and a near-black ink for words.

### Primary
- **Table Cobalt** (cobalt): the table the deck lies on. Fills the sticky nav, the hero field down to the deck, and the whole story section; also the line and value colour of the jawOpen graph, the "final" state pill, the "Ready" chip, the Bank card's band, and the hover of the ink button.
- **Deep Cobalt** (cobalt-deep): only the punched hole in a cobalt band, where the hole has to read as darker than the band around it.

### Secondary
- **Signal Orange** (signal-orange): the lower lip. The underline beneath the key phrase of a headline, the lower lip stroke of every mouth drawing and the lower bar of the glyph, the active step rule, the "reading lips" live pill, the replay caret, progress fills, the "starts a phrase" threshold, footnote markers, focus rings and text selection. As a field it fills the back card of the hero fan, the Speak card's band, and the hospitals section; on orange, text is ink.

### Neutral
- **Ink** (ink): headlines and body on light stock, the upper lip stroke and mouth cavity, the Train card's band, the picked guess, the ink button and the footer.
- **Graphite** (ink-2): secondary text on stock: claims, captions, legends, axis labels, option descriptions.
- **Pencil** (ink-3): tertiary text and quiet marks: clocks, sources, unpicked guesses, card labels, the "pause" threshold.
- **Card Stock** (card): the face of every card and button-card; also the type colour on cobalt and ink.
- **Table Paper** (paper): the page below the cobalt table, the inset wells inside cards (mouth views, tiles, guesses, meter tracks), and the idle state pill.
- **Score Line** (rule): hairline dividers on stock: the dashed score line above the replay's signal row, source and option dividers, the chip's 1px edge.
- **On Cobalt** (on-cobalt) and **Cobalt Mist** (on-cobalt-2): primary and secondary text on the cobalt field (ledes, nav links, step copy).

### Named Rules
**The Three Inks Rule.** Cobalt, signal orange and ink, on card stock and paper. No fourth hue. A tint is an alpha of an ink (the graph area is cobalt at 14%, the clip window cobalt at 8%, the map's winning quadrant orange at 10%), never a new colour.

**The Lower Lip Rule.** Orange marks what is spoken, live or chosen: the lower lip, the underline, the active rule, the live state. Ink is the upper lip. When the two appear together, ink is on top and orange below.

**The Ink-On-Orange Rule.** Small text never sits in orange on stock (3.2:1), and text set on orange is ink (5.4:1). Card stock on orange is allowed only at display size.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with Helvetica Neue, Arial)
**Body Font:** Atkinson Hyperlegible Next Variable
**Label/Mono Font:** Atkinson Hyperlegible Mono Variable (with ui-monospace, Menlo), self-hosted via @fontsource-variable

**Character:** a low-vision legibility face pushed to 800 for headlines, so the page reads like clinical materials that are also confident. The mono sibling carries every measured value and keeps figures tabular.

### Hierarchy
- **Display** (800, clamp(52px, 7.4vw, 104px), 0.94, -0.04em): the hero line, one per page. The price statement in the orange field uses the same voice a step smaller (clamp(44px, 6.4vw, 96px), 0.98).
- **Headline** (800, clamp(34px, 4.4vw, 64px), 1.02, -0.03em, balanced wrap): section headings. The replay's decoded sentence uses the same voice (clamp(34px, 4.2vw, 60px), 1.05).
- **Claim** (500, clamp(24px, 2.4vw, 34px), 1.32): one large argued paragraph with figures in 800 ink and mono superscript markers in orange.
- **Title** (800, 25–28px, 1.1, -0.02em): step names, card band titles, card prompts.
- **Lede** (400, 19px, 1.45): the paragraph beside a headline.
- **Body** (400, 18px, 1.5; 17px under 600px): running text and options. Source lists hold to 62ch.
- **Label** (600–700, 13–15px, letter-spacing 0, sentence case): pills, captions, card labels, legends, nav links (600, 16px), buttons (700, 17px).
- **Measure** (mono 400, 13–15px, tabular): frame counters, clocks, dimensions, percentages. **Measure large** (mono 500, 28px, tabular, cobalt) for the live signal value.

### Named Rules
**The Two Voices Rule.** Words are set in Atkinson Hyperlegible Next; anything measured (a count, a time, a value, a size, a footnote number) is set in Atkinson Hyperlegible Mono with tabular figures.

**The Sentence Case Rule.** No uppercase and no added letter-spacing on labels. Tracking only tightens, and only on 800-weight type at 25px and up.

## Layout

A single centred container (max 1360px) with fluid gutters (clamp(16px, 4vw, 56px)); the sticky nav aligns its padding to the same container edge. Sections alternate fields: cobalt table (hero, story), paper (problem, competitive map), orange (hospitals), ink (footer). Section padding is clamp(96px, 14vh, 160px). The hero's cobalt runs behind the top of the deck and stops 180px above the section's end, so the top card sits across the table edge.

Two-column splits are asymmetric: hero headline with a 280–400px aside aligned to its baseline; problem in two equal columns; map and hospitals at 7fr / 4fr; story copy with a 360–440px pinned deck. The story section is 280vh tall with a sticky stage under the nav; scroll progress deals each card off toward the bottom right.

Breakpoints: at 1100px nav links hide and every split collapses to one column; at 900px the pinned deck is removed and each step carries its own card inline (the replay stacks face above text); at 600px body drops to 17px, nav to 64px, the hero card's ring hole is hidden and padding tightens to 14px.

## Elevation & Depth

Depth is physical: cards lie on a table, and only cards cast shadows. Sections and fields are flat. A card's shadow is layered (a light top edge, a tight contact shadow and a long cobalt-tinted drop), and fanned cards behind the top card are offset by small rotations (-1.6deg, 1.1deg) rather than extra shadow. The punched ring hole is an inset shadow, the one place depth goes inward.

### Shadow Vocabulary
- **Card on the table** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.6) inset, 0 2px 4px rgb(10 20 60 / 0.12), 0 24px 48px -20px rgb(10 20 60 / 0.45)`): every die-cut card: the hero stack, the deck cards, the competitive map.
- **Clipped-on card** (`box-shadow: 0 0 0 1px #d4d5d2, 0 10px 22px -12px rgb(10 20 60 / 0.5)`): a small card clipped onto a bigger one (the model-input chip).
- **Struck forward** (`box-shadow: 0 10px 20px -10px rgb(10 20 60 / 0.6)` with scale 1.03): the picked guess.
- **Punched hole** (`box-shadow: inset 0 2px 3px rgb(0 0 0 / 0.35), 0 1px 0 rgb(255 255 255 / 0.7)`): the ring hole.

### Named Rules
**The Card Stock Rule.** Only cards cast shadows, and card stock stays opaque: a card leaving the stage moves out of frame before it fades.

## Shapes

Die-cut and round-cornered. Cards take 22px corners, buttons 14px, inset wells and the model-input chip 12px, tiles 8px, small overlays 6px, pills fully round. Every card carries a punched 16px ring hole (centred at the top of the hero card, top-left in a deck card's band or the map card), filled with the colour of whatever lies beneath it. Rules are 1.5–2px; dashed rules mean a threshold or a score line. Small cards sit slightly rotated (the chip at -2.5deg) as if clipped on by hand.

### Named Rules
**The Ring Hole Rule.** A card is a card because it has a punched hole. The hole shows the surface underneath (cobalt on the table, paper on the page, a deeper band tone inside a coloured band).

## Components

### Buttons
Tactile card-stock tabs, 54px tall (44px in the nav, 40px on small screens), 700 17px, with an arrow that nudges 4px right on hover.
- **Shape:** gently rounded (14px).
- **Card (on cobalt):** card stock with ink text; hover fills signal orange.
- **Ink (on orange):** ink with card text; hover turns cobalt.
- **Line (on orange):** transparent with a 2px inset ink stroke; hover fills ink.
- **Focus / Active:** a 3px signal-orange outline at 3px offset; pressing drops the button 1px.
- One "Try the live demo" is visible at a time: the nav's copy appears only once the hero's has scrolled away.

### Chips and state pills
- **State pill:** 30px, fully round, 700 14px with an 8px dot. Idle is paper with graphite text; live is orange with ink text and a blinking ink dot; final is cobalt with card text.
- **Ready chip:** cobalt, card text, 700 13px.

### Cards / Containers
- **Corner Style:** 22px die-cut corners.
- **Background:** card stock; inner wells in paper with 12px corners.
- **Shadow Strategy:** "card on the table" (see Elevation & Depth).
- **Border:** none; a ring hole instead.
- **Internal Padding:** 22px (the hero card opens with 40px at the top to clear the hole).

### Navigation
Sticky cobalt bar, 72px (64px under 600px), three columns: the block-and-slit logo with the wordmark in 800 22px, centred section links in 600 16px cobalt mist turning card stock on hover, and the card-button demo action on the right. Links hide under 1100px.

### Articulation Card (signature)
A tall die-cut card with a coloured band naming the step (Bank in cobalt, Train in ink, Speak in orange; 800 26px title, 600 14px "when" on the right, ring hole at left) over a card-stock body: paper wells with two-ink mouth drawings, a cue line in 800 25px, level bars, a progress meter in orange, and for Speak the three guesses all present with the chosen one struck forward in ink. In the story it is pinned and dealt off on scroll (translate toward the bottom right with up to 18deg rotation, cards waiting behind step back 14px, 2.2deg and 4% each).

### Mouth Drawing and Mouth Glyph (signature)
The two-bar glyph (ink bar above, orange bar below, parted by jaw opening) and its articulation-card drawing (card-filled lips with a 3.2px ink upper stroke, orange lower stroke, ink cavity). Animated versions replay the real jawOpen trace at 25 fps and hold a fixed frame under reduced motion. This is the page's only decoration.

### Replay Card (signature)
The top card of the hero fan: the real clip with the mouth region boxed (card-white, orange while reading), a state pill and mono clock, the decoded text building with an orange caret, then a dashed score line over the clipped-on model-input chip and the jawOpen graph (cobalt line at 2.5px over a 14% cobalt area, orange start threshold, dashed pencil pause threshold, ink playhead).

## Do's and Don'ts

### Do:
- **Do** build every surface from cobalt, signal orange and ink on card stock (#fbfaf7) and paper (#f0f0ed); make tints as alphas of those inks.
- **Do** put the orange under things: the lower lip, a 0.12em underline beneath the key phrase, the active rule, the live state.
- **Do** give every card 22px corners, a punched ring hole and the layered card shadow, and keep card stock opaque while it moves.
- **Do** set measurements in Atkinson Hyperlegible Mono with tabular figures, and words in Atkinson Hyperlegible Next.
- **Do** drive mouth motion from the real jawOpen trace, and hold a still frame under prefers-reduced-motion (the deal-in animation and smooth scrolling are also off).
- **Do** draw concept screens of the phone app as articulation cards.

### Don't:
- **Don't** use faces as decoration; the only face on the page is the real clip inside the pipeline replay. Decoration is the mouth glyph or the mouth drawing.
- **Don't** add a fourth hue, or set small text in orange on light stock.
- **Don't** uppercase labels or add letter-spacing to them.
- **Don't** draw the app inside a phone frame or beside the headline as a mockup.
- **Don't** bring back IBM Plex, uppercase labels or #ff3d00 anywhere; both routes use this system.
