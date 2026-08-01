# 2-minute video — screenplay skeleton (NEEDS A NAMED HUMAN OWNER)

Budget: **≤110s of content** (2:00 hard cap, rest is edit margin). Rules from DEMO.md:
live calls during recording, cuts may remove waiting but never fake an operation,
synthetic/test labels visible. End on the Medplum console — cheapest credibility shot
that exists. Record the app at a projector-friendly width; screen-record EVERY
rehearsal run — any clean run is submittable insurance.

| # | Beat | Sec | On screen | Voice/caption |
|---|---|---|---|---|
| 1 | Problem + patient | 0–12 | Table renders; patient banner (SYNTHETIC badge); chart chips | "Doctors get told to trust their gut. Guts miss things. This is Jane — 8 years of clues nobody connected." |
| 2 | Assemble + EMPTY seat | 12–30 | "Assemble council" click → seats fill w/ reasons; hematology chair EMPTY (brass, dashed) | Chair speaks the greeting incl. "that seat is empty — we flag gaps, we don't fake them" (live audio) |
| 3 | Presentation in | 30–42 | Prerecorded clinician audio plays through live pipeline; transcript streams | (the actual case audio — 12s of the 15s clip, cut waiting) |
| 4 | The board changes its mind | 42–62 | Differential lands ranked; evidence chips cited E-aliases; ONE claim visibly stamped CONJECTURE; click a chip → raw FHIR drawer | One heard specialist line (own voice) + caption: "every claim cites the record or gets demoted — enforced in code" |
| 5 | Doctor decides | 62–70 | Click "select as leading" on ATTR amyloidosis | "The council argues. The doctor decides." |
| 6 | Insurance reality | 70–90 | Workup renders; live Stedi facts attach: $15 copay, $0 deductible, $850 OOP, payer message "PCP TO SUBMIT A SPECIALIST REFERRAL"; consult visibly re-sequenced behind referral | Ms. Okafor's spoken facts (or caption): "the plan just changed because of coverage — labs now, consult behind the referral" |
| 7 | Finalize → chart | 90–104 | Click Finalize → created ClinicalImpression + draft ServiceRequests appear; click one → raw JSON incl. "Presenting this to the patient" section | "One click. The whole argument becomes chart documentation — including how to explain it to Jane." |
| 8 | Medplum console close | 104–110 | CUT to app.medplum.com: the freshly created resources, timestamped | "Real FHIR, real Medplum, live Stedi, Deepgram end to end. house_md." |

## Pre-record checklist (run at 3:30, again before the real take)
- [ ] Fresh session; full loop green ≤4 min wall clock
- [ ] Chair audio audible in the recording (system audio captured, not mic)
- [ ] Conjecture demotion occurred (if not: re-run — the skeptic usually earns one)
- [ ] Empty seat present + spoken
- [ ] Stedi facts match §4.2 exactly; no invented numbers anywhere on screen
- [ ] Finalize wrote to HOSTED Medplum (Noah's patient — not the dev chart)
- [ ] Two mp3 jingles in assets/audio — pick one for the outro if wanted

## Owner: ______ (NAME A HUMAN — the council review called this the #1 submission risk)
