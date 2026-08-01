# house_md — FINAL PLAN (canonical, self-contained)

Status: **the** plan. Agreed by Vijay + Felix together at ~1:17pm, 2026-08-01; amended
~1:40pm from the 5-lens plan-check council (reasoning mechanism pinned, coverage beat
recast to sequencing, roster enumerated, gates re-clocked — see git diff for deltas).
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

1. **The room assembles.** Patient loads from Medplum; the managing clinician (their
   own specialty is config — the human fills that seat) presents by voice, then clicks
   **"Assemble council"** — the explicit entry action that runs the real seating
   function over chart-derived + presentation-derived features. The table renders —
   who is seated and WHY, and any required specialty that cannot be seated shows as an
   **empty seat the chair calls out loud**.
2. **The board changes its mind.** Specialists argue; Moss retrieval connects
   longitudinal clues; the differential visibly re-ranks and the board shows WHICH
   evidence moved it. Every patient-specific claim carries a Medplum resource ID or is
   visibly labeled general reasoning/conjecture. The clinician challenges, redirects,
   then selects the leading hypothesis.
3. **Reality checks the plan.** Proposed workup renders; one live Stedi test-mode
   eligibility call returns; **the reimbursement seat speaks it**: a standing patient
   services / reimbursement persona at the table has "already run" the eligibility
   check (the live Stedi call powers it) and speaks to what's possible during plan
   discussion — asserting only facts the current 271 returned. Coverage
   reshapes the plan by **sequencing and flagging**: a referral-gated item visibly
   re-sequences (labs proceed now; the consult is scheduled behind the required PCP
   referral, with its $15 copay fact attached). A covered **alternative** is proposed
   only when the *current* 271 actually contains a row supporting it — never fabricated
   (the verified `uhc` response has no such row, so for the default case the reversal
   IS the re-sequencing). Out-of-pocket renders **per line item only** (no workup
   total); items without returned rows say "no benefit information returned" — reported
   facts labeled as reported, arithmetic labeled as estimate, never a guarantee.
4. **The chart remembers.** The clinician clicks **Finalize**: the session writes
   what was discussed, what was considered (differential + evidence), the confirmed
   plan — one R4 `ClinicalImpression` + one draft/proposal `ServiceRequest` per
   selected item — plus a **patient plan-text version** (plain-language "presenting
   this to the patient" section inside the documentation — REQUIRED, not
   nice-to-have). Every created resource is inspectable as raw JSON. **No
   patient-facing mode.** Write-back is idempotent within a session.

## 3. The council

- **Roster:** VIJAY PROVIDES THE FINAL PERSONA LIST BEFORE BUILD. Chair = **House,
  M.D.** (moderator; name per Vijay — note once: literal TV-character naming in a
  public judged repo is an IP wink, softening is his call). Standing seats regardless
  of list: the chair, the skeptic (argument style designed to probe/overreach so a
  *warranted* chair challenge emerges without scripting), and the **patient services /
  reimbursement specialist** (speaks the Stedi facts at plan time). Case-driven
  specialist seats fill from the list. **Duplicate specialties are allowed** — two
  seats of the same specialty is fine (e.g. the human clinician plus an AI persona of
  the same specialty; honest disagreement between them is good drama). The empty seat
  emerges honestly from list-vs-case: if the final list covers everything this case
  requires, the beat simply doesn't fire for this case — accepted. (Placeholder
  default until Vijay's list lands: no hematology, unit-test-asserted required for
  Jane Doe's features.) All config not code. Each persona: id, name, specialty,
  argument style, system prompt, voice id. The managing clinician's own specialty is
  config and its seat is filled by the human at the table.
- **Audible:** specialists speak in their own voices, scoped for the video — up to
  **two specialist lines heard aloud per session**; the rest land on the board with
  distinct visual attribution while the chair narrates. The chair is the only entity
  the clinician *converses* with — one conversational thread, a plural room. No
  overlapping simultaneous speech: client owns a FIFO playback queue; specialist clips
  play only after the chair's `AgentAudioDone`; mic capture is suspended (push-to-talk)
  while clips play; clinician barge-in flushes the queue.
- **Seating is real, not scripted (Guardrail #1).** A pure, deterministic, unit-tested
  function maps case features (chief complaint, organ systems, meds, age/sex) →
  required specialties, matched against the available roster. Whatever required seat
  can't be filled is flagged and the chair says so on the record — whichever specialty
  that turns out to be. No hard-coded empty chair. Seating output renders in the UI.
- **Cited-or-conjecture (Guardrail #2), enforced in code.** After every model turn,
  citations are validated against the actual record; unsupported patient-specific
  claims are demoted to visibly-labeled conjecture. The model cannot self-certify.
- **Chair duties:** directs which specialist answers, challenges weak/uncited/
  overreaching claims — standing rule: probe the *lowest-cited* claim each round, only
  when the validator or a conflict warrants it (no challenge quota; re-record the take
  if a run yields none) — and synthesizes the ranked differential in one short spoken
  summary. UI/narration copy for Guardrail #2 claims exactly what ships: "every
  citation resolves to a real record resource you can open" (ID resolution, not
  semantic verification).
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
| 2026-05 | Observation | ECG: low/normal QRS voltage in limb leads (raw finding ONLY — the echo-discordance inference belongs to the council, never the record) | Supporting, not diagnostic |
| 2026-06 | Observation | Elevated NT-proBNP + troponin trend | Cardiac stress clue |
| now | Observation/Encounter | Dyspnea, edema, declining tolerance | Active presentation |

Values rule (no clinician reviewer exists on this team): **qualitative text-only**
("elevated NT-proBNP with rising trend") unless a number was checked against a
reference range today. Validated codes or text-only `CodeableConcept` marked for
review — never invent SNOMED/ICD/CPT/LOINC. Additionally seed **15–25 distractor
resources** (routine labs, unrelated visits) so Moss retrieval is doing visible real
work, and render the Moss query on the board ("searched 30 records → 3 hits").

Test-only reference assertions: differential ⊇ {systemic amyloidosis w/ possible
cardiac involvement; hypertensive heart disease; hypertrophic/other infiltrative
cardiomyopathy}; workup = serum free light chains; serum+urine immunofixation;
cardiology consult (hematology if monoclonal screen abnormal); **Tc-99m-PYP
scintigraphy sequenced after the light-chain screen** (the ATTR arm — its absence
reads as not knowing the guideline).

### 4.2 Facts the live `uhc` test scenario returns (verified via stedi-poc — always call live, never wire the saved fixture into the UI)

Active plan · payer message: PCP must submit specialist referral · $15 in-network
specialist copay/visit · $0 remaining in-network deductible · $850 remaining
in-network OOP. Attach referral+copay facts to the consultation option. For lab
options display "No matching service-specific benefit returned" unless the current
response has an applicable row. The Act-3 reshaping for this case = the referral gate
re-sequencing the plan (§2 Act 3). Never fabricate lab/imaging coverage or prices;
never render a workup OOP total.

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

- **THE reasoning mechanism (pinned — three council lenses independently flagged this
  as the build-killer):** the chair's managed think model inside the Voice Agent
  session is the ONLY LLM in the system. It generates **every** specialist
  contribution as structured JSON inside its tool-call arguments
  (`consult_council(specialty_ids)` returns persona configs + retrieved evidence; the
  model returns the §3 contribution shape per specialist via `update_differential`).
  The coordinator **validates and renders — it never generates**. Text-first mode =
  a **headless agent WS session driven by `InjectUserMessage`** (this exact pattern
  was live-verified today in `voice-poc/test-agent.mjs`) — same Settings payload later
  serves voice mode, so nothing is rebuilt at the voice gate. The recorded take uses
  real audio input per §5; InjectUserMessage is for dev/gates and clinician UI-action
  nudges (steering the live model is authentic; scripting its output is not).
- **Citations are aliases, never raw IDs:** `search_patient_evidence` returns short
  aliases (E1, E2…) mapped server-side to Medplum IDs; the model cites aliases in
  tool-call JSON; the coordinator resolves them. (A small model echoing UUIDs WILL
  mangle them and the validator would demote real evidence to conjecture.)
- **Server topology:** Next.js behind a ~30-line custom `server.js` (node http →
  next handler + a `ws` upgrade path for the browser⇄Deepgram relay lifted verbatim
  from voice-poc). Next.js route handlers **cannot** accept WebSocket upgrades — do
  not attempt to port the relay into a route. Still one application (§1 stands).
- **Model stack:** managed `gpt-5-mini` think (OpenAI via Deepgram, no separate
  key) + `nova-3` listen + Aura-2 voices (all live-verified today). Flux (STT/TTS,
  Early Access) only if acceptance is green with time to spare. Wait for
  SettingsApplied before streaming; declared audio format must match actual bytes.
- **Prerecorded-input feeder (build in step 1, ~20 lines):** read WAV → strip header →
  stream 40ms linear16 chunks at real-time pace → trailing 1–2s silence, reusing the
  test-agent harness. This is the only sanctioned input fallback AND the deterministic
  rehearsal input all afternoon — a burst-dumped file never endpoints and the agent
  sits silent.
- **Moss freshness is atomic:** one script does seed/update Medplum → rebuild Moss
  index from freshly-read resources (IDs embedded) → sentinel query ("carpal tunnel")
  asserting the expected ID returns. Run after every record edit and ~10 min before
  recording; keep boot-time warmup so the first on-camera query isn't cold.
- **Stedi adapter:** branch explicitly on `aaaErrors[]`/top-level errors (they arrive
  as HTTP 200) → the designed visible-failure state with retry; pre-flight the exact
  `uhc` call 5 minutes before recording.
- **The table (UI):** a virtual round **council table**. Personas sit around it —
  chair, specialists, the reimbursement seat, the EMPTY seat (visibly vacant chair +
  why), and the managing clinician's own seat (the human). Speaking state lights the
  active seat. The **table surface carries the shared data**: evidence cards, the
  ranked differential, workup items with benefit facts, and finally the created FHIR
  resources — click anything to inspect (Medplum resource / raw JSON). Top strip:
  synthetic patient identity + payer badge + session status. Voice dock: transcript
  caption, listening/speaking state, **push-to-talk** + prerecorded control. Every
  async operation shows a visible activity state. Calm clinical instrument, not
  casino felt. Reduced-motion respected; projector-readable.

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
- Specialists audibly argue (up to two heard lines, distinct voices) *(waivable per
  §8 cut order — chair-narrated council with board attribution is the accepted
  degraded form)*; chair visibly challenges ≥1 claim (re-record if a run yields no
  warranted challenge); unsupported patient claims are visibly demoted to conjecture.
- Moss-retrieved evidence visibly re-ranks the differential and shows which evidence
  moved it.
- The clinician selects the leading hypothesis; no confirmed AL/ATTR subtype claimed.
- Workup options render; one current Stedi test-mode response attaches only supported
  facts; the referral-gated item visibly re-sequences the plan and is flagged (a
  covered alternative renders only if the current 271 supports one); per-line OOP
  shown as estimate, no workup total.
- Explicit confirmation creates one `ClinicalImpression` + selected draft
  `ServiceRequest`s, idempotently, inspectable as raw JSON, incl. the considered-
  differential documentation (talking-points section if time).
- Changing the spoken words or the seeded record changes the output — no hidden
  answers anywhere.
- Prerecorded input (if used) passes through the live pipeline. No secret, PHI,
  invented code, or video-only fixture anywhere.

## 8. Build order and gates (re-clocked from 1:40pm per council review)

**UI scope, decided now not at 3:30:** ONE screen — the council table. Seats
positioned around a table (plain DOM/CSS, no canvas), center surface = stacked
regions: evidence cards → ranked differential → workup w/ benefit chips → created
resources; one raw-JSON drawer (lift ResourceDrawer.tsx). One owner from minute one;
"polish" is not a schedule line. First 10 minutes: broadcast `.env` +
one npm-install commit + declare lane→directory ownership (voice-poc's friction log
records concurrent agents wiping each other's installs).

1. **Now→2:15 — un-killable core:** scaffold (custom server.js + Next) · typed
   SessionState · seating engine (pure + unit tests incl. required-hematology
   assertion) · Jane Doe seed script executing (qualitative values + distractors) ·
   prerecorded-input feeder · board renders chart + seats.
   *(2:15 gate: infra + seating + seed, NOT the debate.)*
2. **→2:45 — cited text debate e2e:** headless agent session (InjectUserMessage) →
   consult_council/update_differential structured JSON → alias-citation validation →
   differential renders with cited/conjecture. *(2:45 checkpoint — this is the old
   "text-first" gate at its honest time.)*
3. **→3:15 — voice + coverage in parallel lanes:** mic/prerecorded audio through the
   same session (voice lane) · Stedi adapter + referral re-sequencing + per-line OOP +
   Moss atomic index wired to the re-rank beat (coverage lane). *(3:00 spirit-gate:
   ONE live eligibility result rendered is enough.)*
4. **3:30 HARD CHECKPOINT — full golden-path run, screen-recorded however ugly. This
   is the insurance take.** If a never-cut beat can't run at 3:30, THAT is when the
   cut order fires — not 4:00. Then →4:00: write-back confirmation flow, idempotent
   FHIR writes, end-state inspection, error states.
5. **4:00 — pencils down; production hour.** Video owner (name a human NOW — the
   council found nobody owns it) runs the per-beat second-budgeted screenplay (≤110s;
   only two specialist lines heard; end on a 5-second shot of the created
   ClinicalImpression inside the hosted Medplum console — the cheapest sponsor-
   credibility shot that exists). Record, edit, submit the form.
   Cut order if behind: specialist heard-lines (chair narrates, board carries
   attribution) → PYP/imaging option (labs+consult still re-sequence) →
   talking-points section. **Never cut:** real seating + empty-seat beat,
   cited-or-conjecture, the re-rank moment, one live Stedi call, clinician
   confirmation.

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
