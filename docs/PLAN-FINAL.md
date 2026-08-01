# house_md — FINAL PLAN (canonical, self-contained)

Status: **the** plan. Agreed by Vijay + Felix together at ~1:17pm, 2026-08-01.
Supersedes `PLAN.md`, `PLAN-V2.md`, `INFRA-PROPOSAL.md`, and `DECISIONS.md` (kept as
history — do not build from them). Provider cheatsheets in `docs/notes/` remain
authoritative for API details. Video constraint: `DEMO.md`. Submission 5:00pm PT.

## 1. Product

**Felix's stage, our cast, Vijay's stakes.** A clinician-facing reasoning workspace:
the **Living Differential Whiteboard** is the surface — calm, precise, provenance-first.
On that stage an **audible council** of specialist personas argues the differential:
specialists speak short lines in their own voices while their full arguments land on
the board. The managing clinician is the **arbiter** — converses with the chair,
interrupts and redirects at will. Coverage is the Act-3 plot turn: it **reshapes the
plan**. The session ends as **chart documentation**. Decision support, not diagnosis:
the council argues, the clinician decides.

One Next.js application (browser UI + provider-facing server routes in the same app,
keys server-side only). No separate frontend/backend deployments, no extra dashboards.

## 2. The experience — four acts, conversation-paced

The clinician's voice is the throttle; the session flows and is interruptible. Act
transitions are explicit clinician actions (select, confirm). Tone: **spectacle that
is credible** — drama only from real events (a real disagreement, a real empty chair,
a real coverage reversal); aesthetics stay a calm bright clinical instrument. Never a
legacy-EHR look, generic chatbot, or theatrical dark-mode AI demo.

1. **The room assembles.** Patient loads from Medplum; the clinician presents by
   voice; the seating decision renders — who is seated and WHY, and any required
   specialty that cannot be seated shows as an **empty seat the chair calls out loud**.
2. **The board changes its mind.** Specialists argue; Moss retrieval connects
   longitudinal clues; the differential visibly re-ranks and the board shows WHICH
   evidence moved it. Every patient-specific claim carries a Medplum resource ID or is
   visibly labeled general reasoning/conjecture. The clinician challenges, redirects,
   then selects the leading hypothesis.
3. **Reality checks the plan.** Proposed workup renders; one live Stedi test-mode
   eligibility call returns; benefits attach to the options they support. Items that
   are not covered or are referral-gated get a **covered alternative proposed**, and
   the patient's **estimated out-of-pocket** is computed from returned
   copay/coinsurance/deductible facts — reported facts labeled as reported, arithmetic
   labeled as estimate, never a guarantee.
4. **The chart remembers.** On explicit confirmation the session writes: what was
   discussed, what was considered (differential + evidence), the confirmed plan —
   one R4 `ClinicalImpression` + one draft/proposal `ServiceRequest` per selected
   item — plus (nice-to-have) a "presenting this to the patient" talking-points
   section inside the documentation. Every created resource is inspectable as raw
   JSON. **No patient-facing mode.** Write-back is idempotent within a session.

## 3. The council

- **Roster:** chair (internal medicine, moderator) + skeptic + case-driven specialist
  personas, ~7 seats total, all **config not code**. Each persona: id, name,
  specialty, argument style, system prompt, voice id.
- **Audible:** specialists speak their short lines in their own voices. The chair is
  the only entity the clinician *converses* with — one conversational thread, a plural
  room. No overlapping simultaneous speech.
- **Seating is real, not scripted (Guardrail #1).** A pure, deterministic, unit-tested
  function maps case features (chief complaint, organ systems, meds, age/sex) →
  required specialties, matched against the available roster. Whatever required seat
  can't be filled is flagged and the chair says so on the record — whichever specialty
  that turns out to be. No hard-coded empty chair. Seating output renders in the UI.
- **Cited-or-conjecture (Guardrail #2), enforced in code.** After every model turn,
  citations are validated against the actual record; unsupported patient-specific
  claims are demoted to visibly-labeled conjecture. The model cannot self-certify.
- **Chair duties:** directs which specialist answers, challenges weak/uncited/
  overreaching claims (at least one visible challenge per session, only when
  warranted), synthesizes the ranked differential in one short spoken summary.
- **Guardrails are enforced AND displayed:** the restraint is part of the show —
  conjecture demotion visible, empty seat spoken, "the council argues, the clinician
  decides" as product copy.
- Specialist contribution shape: one leading interpretation; strongest supporting
  evidence; strongest contradiction/uncertainty; one discriminating question or step.

## 4. The engine is case-agnostic; the case is the default input

The engine takes any case config (patient reference + features + roster). The demo
input is the deeply-seeded synthetic case below. Reference assertions are test
material only — never prompt content, never hidden runtime answers. Changing the
spoken presentation or the seeded record must be able to change seating, evidence,
and the debate.

### 4.1 Default case — Jane Doe (synthetic), systemic amyloidosis direction

- DOB 1971-01-01; payer: synthetic UnitedHealthcare subscriber `uhc-jane`, Stedi
  scenario `uhc`. Presentation: progressive exertional dyspnea, bilateral leg
  swelling, worsening exercise tolerance. Unresolved branch: AL vs ATTR — never
  present either subtype as confirmed.
- Candidate opening utterance (prerecorded-input candidate, not a stored transcript):
  "Jane is a 55-year-old woman with progressive exertional dyspnea, bilateral leg
  edema, preserved ejection fraction, and increased ventricular wall thickness that
  seems disproportionate to her hypertension. What are we missing?"

Seed a scattered longitudinal record — no single resource states the answer:

| ~Date | Resource | Synthetic fact | Role |
|---|---|---|---|
| 2018 | Procedure | Left carpal-tunnel release | Early extracardiac clue |
| 2020 | Procedure | Right carpal-tunnel release | Bilateral pattern |
| 2022 | Condition | Essential hypertension | Competing explanation |
| 2024 | Observation | Distal sensory neuropathy, orthostatic dizziness | Neuro clue |
| 2025 | Observation | Persistent proteinuria, mildly reduced renal fn | Renal clue |
| 2026-05 | DiagnosticReport | Echo: ↑LV wall thickness, preserved EF, diastolic dysfn | Cardiac clue |
| 2026-05 | Observation | ECG voltage/conduction discordant with echo | Supporting, not diagnostic |
| 2026-06 | Observation | Elevated NT-proBNP + troponin trend | Cardiac stress clue |
| now | Observation/Encounter | Dyspnea, edema, declining tolerance | Active presentation |

Exact values/wording need clinician review before seeding. Use validated codes or
text-only `CodeableConcept` marked for review — never invent SNOMED/ICD/CPT/LOINC.

Test-only reference assertions: differential ⊇ {systemic amyloidosis w/ possible
cardiac involvement; hypertensive heart disease; hypertrophic/other infiltrative
cardiomyopathy}; workup = serum free light chains; serum+urine immunofixation;
cardiology consult (hematology if monoclonal screen abnormal).

### 4.2 Verified UHC benefit facts (what the saved response supports)

Active plan · payer message: PCP must submit specialist referral · $15 in-network
specialist copay/visit · $0 remaining in-network deductible · $850 remaining
in-network OOP. Attach referral+copay facts to the consultation option. For lab
options display "No matching service-specific benefit returned" unless the current
response has an applicable row — then apply the Act-3 alternative/OOP logic on top.
Never fabricate lab/imaging coverage or prices.

## 5. Authenticity (non-negotiable)

Every visible result comes from the current session: real Deepgram processing of real
(mic or prerecorded) audio; managed model responding to the actual transcript; Medplum
supplying and receiving the actual resources; Moss searching evidence derived from
them; Stedi called live in test mode. **Never** hardcode the visible transcript,
debate, differential, workup, benefits, or write-back. **Never** silently substitute a
fixture for a failed provider call — failures stay visible with real retry, preserving
the last valid state. Prerecorded clinician audio through the live pipeline is the
only input fallback. Fixtures live in automated tests and isolated dev only.

## 6. Architecture

```
Clinician audio ⇄ Deepgram Voice Agent (managed listen/think/speak + function calling)
                        ⇅ function calls
              Session coordinator (Next.js server) — owns canonical SessionState
                 ├─ seating (pure fn)         ├─ Moss evidence search (Medplum ids kept)
                 ├─ council debate + citation validation
                 ├─ Medplum FHIR reads/writes (R4, typed @medplum/fhirtypes)
                 ├─ Stedi eligibility adapter (REST or MCP)
                 └─ Whiteboard UI state (validated domain state, not raw payloads)
```

- **Voice pipeline (voice workstream owns exact config):** Deepgram-managed Voice
  Agent is the conversational layer (chair). Specialist lines are TTS'd per-line in
  each persona's voice for the audible-council beat. Managed think model runs on
  Deepgram credits — no separate LLM key. Model choices (Flux vs nova-3 STT, Flux vs
  Aura TTS) belong to the voice workstream; note Flux TTS is Early Access — have the
  cheatsheet-verified nova-3 + Aura stack ready if EA misbehaves. Wait for
  SettingsApplied before streaming; declared audio format must match actual bytes.
- **Agent tools (function calling):** `get_patient_context`, `search_patient_evidence`,
  `consult_council`, `update_differential`, `propose_workup`, `check_patient_benefits`,
  `prepare_clinical_writeback` (confirmation-gated). JSON-validated before entering
  canonical state.
- **Whiteboard:** top strip (synthetic patient identity + payer badge + status) ·
  council edge (seats + reasons + empty seats) · central board (hypothesis lanes,
  supporting/contradicting evidence, gaps, workup, benefits, FHIR results) · context
  inspector (click any citation → Medplum resource / raw JSON) · voice dock
  (transcript caption, listening/speaking state, mic + prerecorded control). Every
  async operation shows a visible activity state. Reduced-motion respected;
  projector-readable.

### 6.1 Lift map (working code — do not rediscover)

| Need | Source | Note |
|---|---|---|
| Stedi REST call | `stedi-poc/server.mjs` `restCheck()` | `Authorization: Key <k>`; 20s timeout |
| Known-good requests | `stedi-poc/scenarios.mjs` | use `uhc`; errors arrive HTTP 200 w/ `aaaErrors[]` |
| 271→UI field mapping | `stedi-poc/README.md` bottom | benefitsInformation codes 1/6/I/B/A/C/G/F |
| 271→FHIR CoverageEligibilityResponse | `medplum_hackathon/oneshot2/src/domain/eligibility.ts` | tested mapper |
| TTS/STT/Moss server wiring | `voice-poc/server.mjs` (in-repo) | port into Next.js routes; keyterms wired |
| PCM mic capture | `voice-poc/worklet.js` | MediaRecorder can't produce linear16 |
| Moss SDK wrapper | `voice-poc/moss.mjs` + `medplum_hackathon/notes/moss-cheatsheet.md` | call `mossClose()` in one-off scripts |
| Race-safe advance | `medplum_hackathon/oneshot/src/domain/runGuard.ts` | for any async UI action |
| Raw-FHIR drawer pattern | `medplum_hackathon/oneshot/src/components/ResourceDrawer.tsx` | reference |

`.env` (root, gitignored) has: DEEPGRAM_API_KEY, MEDPLUM_CLIENT_ID/SECRET (hosted
project `vj_sandbox_plum`, verified), STEDI_TEST_API_KEY, MOSS_PROJECT_ID/KEY. No
Anthropic key — by design. Node ≥20 (Vijay's machine: prefix
`PATH="/opt/homebrew/opt/node/bin:$PATH"`).

## 7. Acceptance — ready for the video only when all true

- Locked patient loads from hosted Medplum; every citation opens a real resource.
- Deepgram processes clinician audio; transcript visible as it arrives.
- Seating renders seats + reasons from the real seating function; a required-but-
  unavailable specialty appears as an empty seat and the chair says so aloud.
- Specialists audibly argue (short lines, distinct voices); chair visibly challenges
  ≥1 claim; unsupported patient claims are visibly demoted to conjecture.
- Moss-retrieved evidence visibly re-ranks the differential and shows which evidence
  moved it.
- The clinician selects the leading hypothesis; no confirmed AL/ATTR subtype claimed.
- Workup options render; one current Stedi test-mode response attaches only supported
  facts; a not-covered/gated item yields a proposed covered alternative; patient OOP
  estimate shown as estimate.
- Explicit confirmation creates one `ClinicalImpression` + selected draft
  `ServiceRequest`s, idempotently, inspectable as raw JSON, incl. the considered-
  differential documentation (talking-points section if time).
- Changing the spoken words or the seeded record changes the output — no hidden
  answers anywhere.
- Prerecorded input (if used) passes through the live pipeline. No secret, PHI,
  invented code, or video-only fixture anywhere.

## 8. Build order and gates (clock-real, from 1:20pm)

1. **Now→2:00 — un-killable core:** Next.js scaffold; canonical SessionState;
   seating engine (pure + unit tests); seed Jane Doe to hosted Medplum; whiteboard
   renders chart + seats; **text-first council loop** producing a cited differential.
   *(2:00 gate: text debate end-to-end.)*
2. **2:00 gate — voice:** managed Voice Agent session in (chair converses, function
   calls fire) or prerecorded-audio-through-live-pipeline; decide and move on.
   Specialist per-line TTS voices ride behind this gate.
3. **→3:00 — coverage leg:** Stedi adapter lift; benefits attach; covered-alternative
   + OOP logic; Moss indexing + retrieval wired to the re-rank beat.
   *(3:00 gate: ONE live eligibility result rendered is enough.)*
4. **→4:00 — write-back + polish:** confirmation flow, idempotent FHIR writes, end
   state inspection, visual pass, error states.
5. **4:00 — pencils down.** Rehearse, record the 2-minute video (see `DEMO.md`),
   submit. Cut order if behind: specialist voices (chair narrates, board carries the
   council) → coverage alternative logic (facts still attach) → talking-points
   section. **Never cut:** real seating + empty-seat beat, cited-or-conjecture,
   the re-rank moment, one live Stedi call, clinician confirmation.

## 9. Workstreams

- **Case & clinical content** — seeded record wording/values, clinical review,
  reference assertions.
- **Voice/reasoning** — Deepgram config, prompts, persona voices, function-call
  transport, council prompt design.
- **Agent & retrieval** — seating, citation validation, debate orchestration, Moss
  indexing/search, FHIR normalization.
- **Coverage** — Stedi adapter, benefits projection, alternative/OOP logic, language
  review.
- **Application** — session coordinator, whiteboard, error/activity states,
  confirmation + write-back, diagnostics.

Shared discipline: pull --rebase before every block; small commits, push promptly;
never force-push; never overwrite teammate work — stop and flag. Secrets only in
`.env`. Public repo: synthetic data only.

## 10. Out of scope

Real patients/PHI · production security/compliance · autonomous diagnosis or ordering
· real payer transactions/claims/prior-auth submission · guaranteed cost estimates ·
patient-facing mode · multiple implemented cases · general-purpose whiteboard ·
overlapping simultaneous speech · mobile · dashboards/analytics/multiplayer ·
production deployment beyond the one Next.js app · anything that doesn't strengthen
the single end-to-end case.
