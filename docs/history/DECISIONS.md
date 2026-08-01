# DECISIONS — merged experience rulings (Vijay, ~1:15pm)

Status: **rulings**. Where these conflict with `PLAN-V2.md` or `INFRA-PROPOSAL.md`,
these win. Everything in those docs not contradicted here stands — in particular
PLAN-V2's authenticity rules, clinical precision rules, whiteboard surface and
aesthetic, and the seeded amyloidosis case content; and INFRA-PROPOSAL's lift map.

## The product, one paragraph

Felix's stage, our cast, Vijay's stakes: the **Living Differential Whiteboard** is the
surface — calm, precise, provenance-first. On that stage, an **audible council**: seven-ish
specialist personas speak short lines in their own voices while their full arguments land
on the board. The managing clinician is the **arbiter** — converses with the chair, can
interrupt and redirect at any time. Coverage is the Act-3 plot turn: it **reshapes the
plan**, not footnotes it. The session ends as **documentation**.

## Rulings

1. **Audible council.** Specialists speak (short lines, own voices). The chair is the
   only entity the clinician *converses* with — one conversational thread, a plural room.
   PLAN-V2's "single conversational voice" stands; its "specialists do not speak" and
   "multiple speaking personas out of scope" are superseded.
2. **Roster.** Chair + skeptic + case-driven specialists (~7 seats, config-driven).
   PLAN-V2's minimum-4 is superseded. Chair keeps its challenge duty alongside the skeptic.
3. **The empty seat is real, not scripted.** A pure, deterministic seating function maps
   case features → required specialties vs the available roster. Whatever seat can't be
   filled gets flagged and the chair says so — whichever specialty that turns out to be.
   No hard-coded empty chair. (This is stricter than both prior plans and satisfies
   PLAN-V2's own changing-the-record-changes-the-output test.)
4. **Engine over screenplay.** The engine is case-agnostic; Felix's deeply-seeded Jane
   Doe amyloidosis record is the *default input*, not the program. Reference
   differential/workup remain test assertions only (PLAN-V2's own rule).
5. **Coverage shapes the plan.** Not-covered or referral-gated items get a covered
   alternative proposed; the patient's estimated out-of-pocket is computed from returned
   copay/coinsurance/deductible facts. PLAN-V2's facts-vs-interpretation discipline
   stands — reported facts labeled as reported, arithmetic labeled as estimate, never a
   guarantee.
6. **Conversation-paced.** The clinician's voice is the throttle; the session flows and
   is interruptible. Act transitions (select hypothesis, confirm plan) remain explicit
   clinician actions.
7. **Tone: spectacle that is credible.** Drama comes only from real events — a real
   disagreement, a real empty chair, a real coverage reversal. Aesthetics stay the calm
   clinical instrument (PLAN-V2 §6.2). No theater styling, no canned drama.
8. **Guardrails: enforced AND displayed.** Felix's constraint lists run in code;
   the UX shows the restraint working (conjecture visibly demoted, empty seat spoken,
   "the council argues, the clinician decides" as product copy).
9. **Ending = documentation, no patient-facing mode.** The final act writes the chart:
   what was discussed, what was considered (differential + evidence), the confirmed
   plan (ClinicalImpression + draft ServiceRequests per PLAN-V2), and — nice-to-have —
   a "presenting this to the patient" talking-points section *inside* the
   documentation. No separate patient screen.
10. **Authenticity stands wholesale.** Live provider calls, no canned substitution in
    the submitted experience; prerecorded clinician *audio* through the real pipeline
    is the only input fallback. Fixtures live in tests and isolated dev only.

## Next

Experience-level alignment is complete. Remaining decisions are implementation-level
and belong to the workstreams. Clock check at ruling time: 1:15pm.
