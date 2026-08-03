# docs/pitch/ — handoff notes (written Mon 2026-08-03 by the pitch-council agent)

## What this directory is

Six deliverables drafted Sat 2026-08-01 ~2:50–3:00pm PT by the CEO/CRO/CCO pitch
agent per `docs/PITCH-BRIEF.md`, from Vijay's four answers: keep the name "house_md"
everywhere · the pitch is the pre-recorded 2-min video, Q&A live only if advancing ·
bold company framing · wedge = **augmentation tool for rural healthcare providers**
(Vijay's own framing, mid-session). Tagline adopted from the jingle brief:
"Diagnosis is a team sport. Most doctors don't have the team."

Committed at `b8b9913`. Round 1 of the planned 2 iteration rounds; no redlines came
back in-session, so these are round-1 drafts.

## Staleness warning — read before reusing

Hours after these were written, the demo was **swapped** (`6b46e61`, "The Medicine Is
the Poison"): Tuan Pham case (33 seeded resources), 5-agent panel
(HOUSE/PULMO/GASTRO/I.D./ADVOCATE) with ALL specialists audible in turn order, a
Medplum-styled "Rural Care Clinic" EHR opening frame, and a separate
`docs/VIDEO-SCREENPLAY.md`. Consequences:

- `video-script.md` here is **superseded** by `docs/VIDEO-SCREENPLAY.md` (it was
  built for the Jane Doe amyloidosis golden path and the two-heard-lines constraint,
  both since replaced).
- `pitch-60s.md` truth-gate footnotes and the "eight years of chart" line reference
  the Jane Doe case; the spine (contrast line, rural stakes, close) is case-agnostic
  and still good.
- `positioning.md` proof point 3 cites the Jane Doe `uhc` 271 facts ($15 copay,
  referral gate) — verify against whatever eligibility beat the Pham demo actually
  shows before quoting.
- `qa-prep.md`, `form-blurb.md` (Jane-Doe-free except "referral gate" in the blurb),
  and `naming.md` remain broadly valid; the rural framing even shipped into the
  product UI ("Rural Care Clinic" frame).

## Still-true spine (safe to reuse anywhere)

- Contrast open: "Everyone built the patient an agent. We built the doctor a council."
- Rural wedge: one in five Americans lives where the specialists aren't; buyer =
  rural health systems / ~1,350 critical-access hospitals / FQHCs, per-clinician seats.
- Honesty-as-flex: the four-level truth table (designed / verified / integrated /
  demo-ready) answered proudly; "we'd rather show you the truth table than a magic
  trick."
- Guardrails as the moat: computed seating + empty chair, cited-or-conjecture in code.

## Open items for the next agent

1. Learn the outcome (submission made? advanced to Q&A? placement?) from Vijay before
   touching anything — it decides whether these docs become archive or company seed.
2. If the project continues as a company: `naming.md` says rename before
   incorporation; alternates (Curbside / Consilium / The Differential) are unsearched.
3. If any pitch text is reused, re-run the truth-gate pass against the CURRENT build
   (post-swap) — this directory's claims were gated against the 2:50pm Sat state.
4. Local repo had uncommitted work not belonging to the pitch lane
   (`builds/vj/src/server-lib/council.ts` modified, `builds/vj/app/api/session/demo/`
   untracked) — left untouched, per lane rules.
