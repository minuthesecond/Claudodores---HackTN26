# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Buyers (primary for the landing page):** cancer centers and hospitals: speech-language pathologists who run the pre-surgery voice visit, and the administrators who license tools for head-and-neck and ICU patients.
- **Patients:** adults about to lose their voice to a laryngectomy or tracheostomy, and the families and nurses who need to understand them afterwards.
- Built at HackTN 2026 by The Claudodores; demo-day judges also see the page.

## Product Purpose

Unspoken lets people who lose their voice speak again in their own voice. Before surgery the patient banks about fifteen minutes on camera; Unspoken trains a clone of their voice and a model of their lips. Afterwards they mouth a phrase silently, tap the right guess from the top three, and hear it spoken in their own voice (or send it to a nurse).

## Positioning

The only option that is both silent (no typing, no device held to the throat) and sounds like the patient. Business-plan competitive map: typing + banked voice sounds like you but is slow; whiteboards and letter boards are slow and voiceless; an electrolarynx is fast but robotic; generic lip-reading apps are silent but not personal.

## Operating Context

- Fits the speech therapy visit that already happens before surgery.
- Licensed to cancer centers and hospitals at $400 per patient; patients pay nothing.
- Working prototype: a browser lip reader (`/app`) that streams camera frames to an Auto-AVSR model, segments phrases on the MediaPipe jawOpen signal, shows fast partial decodes and a final decode after a 1 s pause.

## Capabilities and Constraints

- Real today: live lip reading in the browser (`/app`), with an offline mock when the backend is down.
- Planned, shown as concept: the phone app (Bank → Train → Speak), voice cloning, top-3 guess picking, send to nurse.
- It is a prototype, not a medical device; the page must say so.

## Brand Commitments

- Name: Unspoken.
- Mark: a solid block with a closed-mouth slit (two bars), and the "mouth" glyph that parts the two bars by the real jawOpen signal.
- Taglines in use: "Mouth it. Hear yourself." / "Speak again, in your own voice."
- Faces appear only in the real pipeline replay; decoration uses the mouth glyph, never faces.

## Evidence on Hand

- `frontend/public/landing/replay.json` + `mouth-sprite.png`: real pipeline output for `talking.MOV` (78 frames at 25 fps, 96×96 mouth crops, jawOpen signal, partial decodes, final "hi my name is justin").
- Sourced figures: 12,290 Americans diagnosed with laryngeal cancer each year (American Cancer Society, 2026 est.); 75–100K adults get a tracheostomy each year (from ASHA incidence rates); 3× preventable adverse events when patients can't communicate (Bartlett et al., CMAJ 2008).
- No customers, pilots, testimonials, accuracy benchmarks or clinical results exist; never invent them.

## Product Principles

1. The patient's own voice is the point; everything else is plumbing.
2. Prove with the real pipeline, label the plan as plan.
3. Fit existing clinical workflow rather than adding a new one.
4. Dignity first: no faces as decoration, no pity framing.

## Accessibility & Inclusion

Audience includes people with speech loss and older clinicians: high contrast, readable body sizes, reduced-motion support, nothing that depends on sound to be understood.
