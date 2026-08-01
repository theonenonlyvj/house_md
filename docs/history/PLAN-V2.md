# house_md — canonical outcome plan

Status: locked product outcome for the August 1, 2026 hackathon submission.

This document defines what the finished application is and how it must behave. It does
not prescribe an implementation sequence. Product principles live in
[`PRINCIPLES.md`](./PRINCIPLES.md); the separate two-minute video brief lives in
[`DEMO.md`](./DEMO.md); verified provider notes live in `docs/notes/`.

## 1. Product outcome

Build a clinician-facing reasoning workspace that turns a spoken case discussion into
an evidence-grounded differential and a feasible proposed workup.

The product is a **Living Differential Whiteboard**. A clinician presents a case by
voice. A small council of specialist agents argues competing hypotheses using facts
from the patient's longitudinal FHIR record. Retrieved evidence visibly changes the
whiteboard. The clinician selects the leading direction, reviews a coverage-aware
workup, and explicitly confirms what is written back to the record.

The application is decision support, not diagnosis. The council argues; the clinician
decides.

### 1.1 Locked platform shape

The product is one Next.js application. The browser experience, application routes,
and provider-facing server logic belong to the same application and deployment. There
is no separate frontend/backend service architecture.

The interface is centered on one whiteboard canvas with only the supporting controls
needed to understand and operate it.

### 1.2 Complete product loop

The finished experience completes one coherent loop:

1. Load the locked synthetic patient from Medplum.
2. Hear the clinician's case presentation through Deepgram.
3. Seat the minimum specialist council and visibly flag missing expertise.
4. Retrieve longitudinal evidence through Moss with Medplum resource citations.
5. Show the council's competing arguments and one evidence-driven reranking.
6. Let the clinician select a leading hypothesis.
7. Present three clinically reviewed workup options.
8. Attach the current Stedi eligibility result to the relevant option.
9. Let the clinician confirm the proposed plan.
10. Write an inspectable `ClinicalImpression` and proposed `ServiceRequest` resources
    to Medplum.

## 2. Authenticity requirements

Every visible result must come from the current application session:

- Deepgram processes the actual microphone or prerecorded audio input.
- The managed conversational model responds to the resulting transcript.
- Medplum supplies the patient resources used in the session.
- Moss searches evidence derived from those resources.
- Every patient-specific claim retains its Medplum resource ID.
- Stedi is called in test mode and the current response is rendered.
- Medplum creates the final R4 resources after clinician confirmation.
- Changing the spoken presentation can change the council response.
- Changing the patient record can change retrieved evidence and citations.

Do not hardcode the visible transcript, debate, differential, workup result, benefits
result, or FHIR write-back. Fixtures are allowed for automated tests and isolated UI
development, never as a silent substitute for a failed provider call in the submitted
experience.

Prerecorded clinician audio is an authentic input mode when it passes through
Deepgram and the same live downstream path. It is not permission to inject a stored
transcript or replay a recorded result.

## 3. Locked synthetic case

### 3.1 Patient and presentation

- Synthetic patient: Jane Doe.
- Date of birth: 1971-01-01.
- Payer profile: documented synthetic UnitedHealthcare subscriber `uhc-jane` using
  the Stedi scenario `uhc`.
- Current presentation: progressive exertional dyspnea, bilateral leg swelling, and
  worsening exercise tolerance.
- Clinical direction: systemic amyloidosis with possible cardiac involvement.
- Important unresolved branch: AL versus ATTR amyloidosis.

Suggested opening utterance:

> Jane is a 55-year-old woman with progressive exertional dyspnea, bilateral leg
> edema, preserved ejection fraction, and increased ventricular wall thickness that
> seems disproportionate to her hypertension. What are we missing?

The reference utterance is clinical-review material and a prerecorded-input candidate.
It is not a stored transcript or a hidden runtime answer.

### 3.2 Longitudinal FHIR evidence manifest

Seed a scattered longitudinal record. No single resource may state the final
assessment.

| Approximate date | FHIR resource | Synthetic clinical fact | Whiteboard role |
|---|---|---|---|
| 2018 | `Procedure` | Left carpal-tunnel release | Early extracardiac clue |
| 2020 | `Procedure` | Right carpal-tunnel release | Bilateral pattern strengthens the clue |
| 2022 | `Condition` | Essential hypertension | Credible competing explanation for wall thickening |
| 2024 | `Observation` | Progressive distal sensory neuropathy with intermittent orthostatic dizziness | Multisystem neurologic clue |
| 2025 | `Observation` | Persistent proteinuria and mildly reduced renal function | Renal clue; raises need for nephrology input |
| 2026-05 | `DiagnosticReport` | Echocardiogram: increased LV wall thickness, preserved EF, and diastolic dysfunction | Cardiac infiltrative-disease clue |
| 2026-05 | `Observation` | ECG voltage/conduction finding reviewed as discordant with the echo | Supporting cardiac clue, not diagnostic alone |
| 2026-06 | `Observation` | Persistently elevated NT-proBNP and cardiac troponin trend | Cardiac stress/injury clue |
| Current encounter | `Observation` / `Encounter` | Dyspnea, edema, and declining exercise tolerance | Active presentation |

The exact synthetic measurements, reference ranges, dates, and clinical wording require
clinician review before seeding. Do not invent terminology codes. Use validated codes
or text-only `CodeableConcept` values explicitly marked for review.

This pattern is clinically coherent: the ACC identifies increased ventricular wall
thickness, heart-failure symptoms, biomarkers, bilateral carpal-tunnel history,
proteinuria, and peripheral or autonomic neuropathy as cardiac-amyloidosis clues. It
also cautions that low ECG voltage with hypertrophy is not present in most patients, so
the ECG finding must remain one clue rather than a diagnostic shortcut. See the
[2023 ACC Expert Consensus key points](https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2023/01/19/14/49/2023-acc-consensus-on-cardiac-amyloidosis)
and the [AHA AL Amyloidosis Clinician Pocket Guide](https://www.heart.org/en/-/media/Files/Professional/AL-Amyloidosis/ALAmyloidosis-Pocket-Card_v011_06132025.pdf?sc_lang=en).

### 3.3 Reference differential

The clinically reviewed reference set is:

1. systemic amyloidosis with possible cardiac involvement;
2. hypertensive heart disease;
3. hypertrophic cardiomyopathy or another infiltrative cardiomyopathy.

These are evaluation assertions, not prompt content. The runtime council must generate
its visible argument from the clinician's words and retrieved evidence.

### 3.4 Evidence-driven change

The initial presentation makes hypertensive heart disease plausible. Retrieval then
connects bilateral carpal-tunnel procedures, neuropathy or orthostasis, proteinuria,
cardiac biomarkers, and the echo/ECG discordance across several years. The visible
result is systemic amyloidosis moving above the competing explanations.

The whiteboard must show which evidence caused the movement. It must not simply replace
one static ranking with another.

### 3.5 Locked workup

Present exactly these three proposed next steps:

1. serum free light-chain assay;
2. serum and urine immunofixation;
3. cardiology consultation, with hematology involvement if the monoclonal-protein
   screen is abnormal.

The initial clinical question is whether a monoclonal light-chain process is present.
The ACC pathway identifies serum free light chains plus serum and urine
immunofixation as the first monoclonal-protein screen. If that screen is negative,
subsequent evaluation for ATTR may include bone-tracer scintigraphy; if it is positive,
appropriate tissue confirmation and hematology involvement are needed. The application
must not collapse AL and ATTR into one confirmed diagnosis or imply that a single scan
establishes every subtype.

### 3.6 Locked insurance reveal

The current saved UHC test response supports only these statements:

- active plan coverage;
- payer message that the PCP must submit a specialist referral;
- $15 in-network specialist copay per visit;
- $0 remaining in-network individual deductible;
- $850 remaining in-network individual out-of-pocket amount.

Attach the referral message and specialist benefit to the cardiology consultation.
For the two laboratory options, display `No matching service-specific benefit returned`
unless the current Stedi response contains an applicable service-specific row.

Do not infer a laboratory price, imaging price, authorization decision, guaranteed
coverage, or guaranteed payment.

## 4. Minimum council

The council contains the smallest set needed to make the product idea legible:

| Seat | Product role | Expected contribution |
|---|---|---|
| Chair — internal medicine | Spoken moderator who leads and challenges the discussion | Frames uncertainty, directs which specialist answers next, challenges weak or unsupported claims, forces each specialist to defend against the strongest competing argument, requests evidence, and summarizes the ranked differential |
| Cardiology | Seated specialist | Interprets heart-failure symptoms, wall thickness, ECG/echo relationship, and biomarkers |
| Hematology | Seated specialist | Protects the AL branch and explains the monoclonal-protein screen |
| Nephrology | Visible empty seat | Shows that proteinuria/renal dysfunction warrants expertise the current council cannot supply |

The empty nephrology seat is a positive guardrail demonstration. The chair explicitly
states that nephrology input is warranted and does not allow another persona to pretend
to fill that expertise.

Each seated specialist contributes:

- one leading interpretation;
- the strongest supporting evidence;
- the strongest contradiction or uncertainty;
- one discriminating question or next step.

The chair drives the exchange rather than reporting it. The chair decides which
specialist speaks to which question, and at least one specialist claim in the session
is visibly challenged by the chair before it is accepted, weakened, or withdrawn. The
chair does not challenge for theater: a challenge is warranted only when the claim
lacks a citation, conflicts with another specialist, or over-reaches the evidence.

The chair produces one short spoken synthesis. Detailed arguments remain visible on
the whiteboard rather than becoming a long voice exchange.

Every patient-specific statement is either linked to a Medplum resource or visibly
labeled `General clinical reasoning — not established in this patient`.

## 5. Deepgram-managed conversation

Use Deepgram's hosted Voice Agent API as the complete conversational layer. The desired
managed configuration is:

- **Listen:** Flux conversational STT, `flux-general-en` on v2, for integrated
  end-of-turn detection and interruption-aware conversation.
- **Think:** Deepgram-managed OpenAI `gpt-5.5` in the Advanced tier.
- **Speak:** Deepgram Flux TTS v2 using an English Flux voice, with `flux-alexis-en` as
  the current default pending a final listening test.
- **Act:** Deepgram Voice Agent function calling for patient context, evidence search,
  council consultation, benefits retrieval, and confirmation-gated write-back.

Deepgram describes the Voice Agent API as a single WebSocket pipeline covering
listening, thinking, and speaking. Flux provides conversational transcription and
model-integrated turn detection; managed OpenAI models require no separately hosted LLM
endpoint; function calls pause the conversational response while the application
returns current data. See Deepgram's [Voice Agent overview](https://developers.deepgram.com/docs/voice-agent),
[managed LLM list](https://developers.deepgram.com/docs/voice-agent-llm-models),
[Flux guide](https://developers.deepgram.com/docs/flux/quickstart),
[function-calling guide](https://developers.deepgram.com/docs/voice-agents-function-calling),
and [TTS model guide](https://developers.deepgram.com/docs/voice-agent-tts-models).

Flux TTS v2 is currently Early Access. It remains the preferred outcome because it is
Deepgram's streaming-first, voice-agent-first model with a turn lifecycle and cross-turn
voice consistency. The final voice choice may change after a short listening test
without changing the product behavior.

### 5.1 Voice behavior

- The chair is the single conversational voice.
- Specialist contributions appear on the whiteboard; they do not create overlapping
  voice sessions.
- Spoken answers are one or two sentences whenever possible.
- The chair acknowledges evidence retrieval and coverage checks without narrating raw
  payloads.
- The clinician can interrupt or redirect the chair.
- Assistant text remains visible even if audio playback is muted or interrupted.
- The chair never announces a diagnosis as established.

## 6. Whiteboard-first experience

The whiteboard occupies the clear majority of the viewport. Supporting interface is
restrained and contextual:

- **Top strip:** synthetic patient identity, payer badge, encounter context, and
  current session status.
- **Council edge:** compact seats showing the chair, seated specialists, why they were
  selected, and the empty nephrology seat.
- **Central whiteboard:** hypotheses, evidence, contradictions, information gaps,
  workup options, benefits, and final FHIR results.
- **Context inspector:** opens only for the selected evidence, hypothesis, workup item,
  benefit, or created resource.
- **Voice dock:** compact transcript caption, listening/speaking state, microphone,
  prerecorded-input control, and stop/mute controls.

There is no separate dashboard, benefits page, chat page, or FHIR page. Those states
unfold on and around the same whiteboard.

### 6.1 Whiteboard progression

The surface progresses through three connected regions:

1. **Differential:** competing hypothesis lanes with supporting and contradicting
   evidence.
2. **Workup:** selected hypothesis leads into three proposed next steps.
3. **Confirmation:** coverage facts attach to the relevant workup item and confirmed
   FHIR resources appear at the end of the chain.

The product should feel like one argument moving across a clinical whiteboard, not a
wizard switching between screens.

### 6.2 Visual language

- Calm, bright, precise clinical-instrument aesthetic.
- White base, cool neutral structure, muted teal-blue primary, and restrained brass
  for uncertainty.
- Green and red are reserved for evidence direction and status; text/icons carry the
  same meaning.
- Hypotheses remain spatially stable enough to follow when ranks change.
- Evidence arrival and reranking use purposeful motion, never decorative animation.
- Important text remains readable on a projected display.
- The experience must not resemble a legacy EHR, generic chatbot, or theatrical
  dark-mode AI demo.

### 6.3 Required interactions

- Inspect why each specialist was seated.
- Inspect a hypothesis and its arguments.
- Open any patient citation to its Medplum resource or raw JSON.
- Select the leading hypothesis.
- Select or deselect proposed workup items.
- Inspect the exact Stedi rows attached to the consultation.
- Explicitly confirm before write-back.
- Inspect every created FHIR resource.

## 7. Sponsor integrations as product outcomes

### Deepgram

Deepgram makes the experience conversational. It must visibly provide listening,
transcription, turn handling, managed reasoning, function calling, and the chair's
spoken response.

### Medplum

Medplum is the clinical source of truth at both ends. The session begins with current
FHIR R4 patient resources and ends with one clinician-confirmed `ClinicalImpression`
plus proposed `ServiceRequest` resources.

### Moss

Moss connects scattered longitudinal facts quickly enough to change the live
differential. Every result preserves its originating Medplum resource type and ID.

### Stedi

Stedi introduces administrative reality at the decision point. The application makes
one current test-mode eligibility call and reports only the facts supported by that
response.

Removing any one integration should make the demonstrated story materially weaker.

## 8. Clinician control and clinical truth

- The council may propose, challenge, retrieve, and summarize.
- Only the clinician selects the leading hypothesis.
- Only the clinician selects the proposed workup.
- Only explicit clinician confirmation authorizes FHIR write-back.
- Proposed requests remain draft/proposal state.
- Eligibility is not a guarantee of coverage, price, authorization, or payment.
- Missing evidence remains an information gap.
- Unsupported patient claims remain general reasoning or conjecture.
- No SNOMED, ICD, CPT, LOINC, or other terminology code is invented.
- Only synthetic data appears in the repository, application, logs, and video.

## 9. Visible product states

The whiteboard must make these moments unmistakable:

1. patient ready;
2. listening;
3. council seated;
4. searching longitudinal evidence;
5. differential ready;
6. evidence-driven reranking;
7. clinician selection;
8. workup proposed;
9. benefits checking and result;
10. awaiting clinician confirmation;
11. writing FHIR resources;
12. complete;
13. recoverable failure with the last valid state preserved.

Every provider operation has a visible activity state. Failures remain visible and
retryable; they never transform into a canned success.

## 10. Definition of the finished outcome

The application is ready for the submission video only when all of the following are
true on the presentation machine:

- The locked synthetic patient loads from Medplum.
- Deepgram processes clinician audio and returns the visible transcript.
- The chair, cardiology, hematology, and empty nephrology seats appear with reasons.
- The chair visibly challenges at least one specialist claim, and the whiteboard shows
  how that claim was resolved.
- Moss returns cited evidence that visibly changes the differential.
- Every patient-specific citation opens a real Medplum resource.
- The clinician can select systemic amyloidosis as the leading direction without the
  application claiming a confirmed subtype.
- The three locked workup options appear.
- A current Stedi response attaches the referral/copay facts to cardiology consultation
  and does not fabricate laboratory coverage.
- The clinician explicitly confirms the selected plan.
- Medplum creates one inspectable `ClinicalImpression` and the selected proposed
  `ServiceRequest` resources without duplicates.
- Prerecorded input, if used, still passes through Deepgram and all live downstream
  integrations.
- Changing the spoken presentation can change the council response.
- Changing the Medplum evidence can change Moss results and whiteboard citations.
- No secret, PHI, invented code, hidden answer, or video-only fixture appears.

## 11. Current integration truth

| Subsystem | Current status | Outcome still to prove |
|---|---|---|
| Stedi | Verified standalone POC in `stedi-poc/` | Current response appears on the whiteboard through the main application |
| Deepgram | Product configuration selected and provider behavior documented | Managed Voice Agent session completes the case interaction and function calls |
| Medplum | FHIR model and provider notes documented | Locked patient exists, citations resolve, and confirmed writes are inspectable |
| Moss | Evidence role and provenance requirement defined | Locked record is searchable with Medplum resource IDs preserved |
| Council | Seats, guardrail, and expected contributions locked | Current evidence produces a visible debate and synthesis |
| Next.js application | Product surface and states locked | One complete whiteboard experience exists |

Documentation is not proof of integration. A subsystem becomes demo-ready only when
its current response completes its visible moment in the product.

## 12. Remaining content locks

Only these content decisions remain open:

- clinician approval of the exact synthetic measurements and clinical wording;
- final Medplum resource IDs after the patient is created;
- final Flux English voice after a short listening comparison;
- final council prompts being developed by the voice/reasoning workstream;
- final two-minute screenplay, created only after the complete product loop works.

These choices may refine the content without changing the product outcome defined here.

## 13. Explicitly out of scope

- real patients or PHI;
- production security/compliance hardening;
- autonomous diagnosis or autonomous order placement;
- real payer transactions, claims, or prior-authorization submission;
- guaranteed cost estimates;
- multiple implemented patient cases;
- general-purpose clinical coding;
- a general-purpose whiteboard;
- multiple simultaneous speaking personas;
- mobile layouts;
- dashboards, analytics, collaboration, or multiplayer;
- production deployment architecture beyond one Next.js application;
- any feature that does not strengthen the single end-to-end case.
