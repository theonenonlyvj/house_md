# house_md — 2-minute video beat sheet

Constraint source: `docs/DEMO.md` (≤2:00 submitted; 100–110s planned content).
Golden path: `docs/PLAN-FINAL.md` §2. Only DEMO.md's seven beats appear. Two
specialist heard-lines maximum. Record with live Medplum, Moss, and Stedi calls;
clinician audio is the prerecorded WAV through the live pipeline (sanctioned input).

**Truth-table rule:** every beat below is labeled with its subsystem state
(designed / verified / integrated / demo-ready). Nothing may be recorded for a beat
whose state is below "integrated," and the 3:30 golden-path run is the gate that
flips beats to demo-ready. If a beat's gate fails, use its cut line, not a fixture.

## Beat sheet (target 110s)

| # | Time | Beat | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Problem + patient context | Council table UI, patient strip loads from hosted Medplum, "synthetic patient" badge visible | "One in five Americans lives where the specialists aren't. This is house_md: the doctor's council. Jane Doe, synthetic patient, real FHIR record." |
| 2 | 0:10–0:24 | One spoken clinician turn | Transcript renders live as the presentation audio plays; listening state visible | (No VO — the clinician's own words carry it: the Jane Doe presentation, verbatim from PLAN-FINAL §4.1) |
| 3 | 0:24–0:54 | Council seating + evidence-driven change | "Assemble council" click → seats render with WHY; empty chair called out if it fires; Moss query chip (show the real count the UI renders); differential visibly re-ranks; specialist heard-line #1; a conjecture demotion if one occurs naturally | "The room seats itself from the chart. The council argues; every claim cites a record resource or gets demoted to conjecture. Watch the differential change its mind: evidence from 2018 just moved it." |
| 4 | 0:54–1:08 | One selected workup | Clinician selects leading hypothesis; workup renders: light chains, immunofixation, cardiology consult, PYP sequenced after the screen | "The doctor picks the leading hypothesis. The council proposes the workup that discriminates." |
| 5 | 1:08–1:28 | One insurance reveal | Reimbursement seat speaks (heard-line #2): referral gate + $15 specialist copay; consult visibly re-sequences behind the PCP referral, labs proceed now; per-line OOP as estimate; "no benefit information returned" rows left honest | "Before options are discussed, the reimbursement seat has already run eligibility. Live. A referral gate just re-sequenced the plan." |
| 6 | 1:28–1:44 | Clinician confirmation + FHIR result | Finalize click → ClinicalImpression + draft ServiceRequests created; cut to hosted Medplum console; **hold 5 full seconds on the ClinicalImpression** | "The doctor confirms. The session becomes chart documentation: a ClinicalImpression and draft orders, in Medplum, inspectable." |
| 7 | 1:44–1:50 | Closing sentence | Title card: house_md · Diagnosis is a team sport | "Diagnosis is a team sport. house_md gives every doctor the team." |

## Truth-table map (state as of ~2:50pm — re-verify at record time)

| Beat | Subsystem(s) | State now | Gate to record |
|---|---|---|---|
| 1 | Medplum read | Integrated (app reads hosted project live) | Jane Doe seed landed + citations resolve |
| 2 | Deepgram + feeder | Integrated (feed-audio.mjs verified live in-app today) | None beyond a same-day smoke run |
| 3 | Seating | Integrated (pure fn, unit-tested incl. required-specialty assertion) | Final roster config from Vijay |
| 3 | Moss re-rank | Verified standalone (3–6ms warm); app wiring partial | **3:30 run — riskiest visible beat; never-cut, so it blocks recording** |
| 3 | Citation validation | Integrated (alias citations, validator demotes) | A natural demotion or challenge in the take; re-record rather than stage one |
| 4 | Session state / select | Integrated | 3:30 run |
| 5 | Stedi | Integrated (adapter + tests; 34/34 sweep verified standalone this morning) | Pre-flight the exact `uhc` call 5 minutes before recording |
| 6 | FHIR write-back | Integrated in shape (routes + tested mappers); live inspected write-back not yet proven | Create + inspect one real ClinicalImpression before the take |
| 7 | None | — | — |

## Production notes

- Run the Moss atomic reseed/reindex/sentinel script ~10 minutes before recording;
  keep the boot warmup so the on-camera query is warm.
- Pre-flight Stedi `uhc` 5 minutes before; branch on `aaaErrors[]` (they arrive HTTP 200).
- Never present AL vs ATTR as confirmed; the unresolved branch is correct medicine.
- Cuts may remove waiting, never imply an operation that didn't happen.
- Cut order if behind (from PLAN-FINAL §8): specialist heard-lines (chair narrates,
  board carries attribution) → PYP option → talking-points. Never cut: real seating +
  empty chair, cited-or-conjecture, the re-rank moment, one live Stedi call,
  clinician confirmation.
- Optional: jingle sting under beat 7 only; never over spoken beats.
