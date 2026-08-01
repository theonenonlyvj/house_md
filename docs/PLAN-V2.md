# house_md — target build plan v2

Status: implementation blueprint for the August 1, 2026 hackathon build.

This document describes the application to build. Strategic reasoning and design
rationale live in [`PRINCIPLES.md`](./PRINCIPLES.md).

## 1. Target outcome

Build a clinician-facing application that turns a spoken case discussion into a
patient-specific differential and a feasible proposed workup.

The finished demo must show one uninterrupted loop:

1. Load one synthetic patient and their longitudinal FHIR record from Medplum.
2. Accept a clinician's spoken case presentation through Deepgram.
3. Retrieve relevant patient evidence through Moss.
4. Display a ranked differential with supporting and contradicting evidence.
5. Let the clinician challenge, reorder, and select a leading hypothesis.
6. Generate proposed workup options.
7. Run one Stedi test-mode eligibility check and display the returned benefits.
8. Let the clinician confirm the proposed plan.
9. Write the clinical assessment and proposed requests to Medplum.
10. Show every created FHIR resource in a final, inspectable end state.

The application is decision support. It presents evidence and proposals. The
clinician makes the final selection and authorizes every write-back.

## 2. Demo definition

The demo consists of one preconfigured `DemoCase`. The same case drives the live
application, deterministic fallback, screenshots, video, and submission copy.

The complete judged flow should fit within three minutes unless the event announces a
different presentation limit.

### 2.1 Required case package

The selected case must provide:

- one synthetic patient identity;
- one synthetic payer identity matching a documented Stedi test-mode scenario;
- an opening complaint that can be presented in 15 seconds or less;
- three to five plausible differential items;
- at least five patient-record facts relevant to the differential;
- at least one fact that changes the ranking during the conversation;
- at least one contradicting fact;
- one selected leading hypothesis;
- two or three proposed workup items;
- one Stedi response with a useful coverage, cost-sharing, referral, limitation, or
  authorization signal;
- one confirmed final plan;
- expected FHIR resources after write-back.

The case package must contain only synthetic data. Its Medplum patient demographics
must match the selected Stedi mock subscriber where the Stedi request requires exact
values.

### 2.2 Required script package

Store the canonical demo script alongside the case fixture. It must define:

- the clinician's opening statement;
- the agent's first response;
- the first evidence search;
- the expected initial differential;
- the clinician's challenge or follow-up;
- the evidence that changes the ranking;
- the selected hypothesis;
- the proposed workup;
- the Stedi check and expected benefits summary;
- the clinician's confirmation;
- the expected Medplum write-back;
- presenter narration for each visible state;
- a prerecorded clinician audio track containing the same utterances.

## 3. Product experience

### 3.1 Application shell

The primary application is a single clinician workspace with four persistent regions:

1. **Patient header** — synthetic patient identity, encounter context, medications,
   active conditions, and payer badge.
2. **Conversation rail** — clinician and agent turns, listening state, tool activity,
   and the deterministic demo controls.
3. **Differential whiteboard** — ranked hypotheses, confidence direction, supporting
   evidence, contradicting evidence, and selectable leading hypothesis.
4. **Plan and benefits panel** — proposed workup, Stedi benefits, clinician confirmation,
   and write-back results.

The workspace must remain usable at a projector-friendly desktop width. The important
state change for the current demo beat must be visually dominant.

### 3.2 Application states

The application uses the following explicit state sequence:

1. `case-ready`
2. `listening`
3. `reasoning`
4. `retrieving-evidence`
5. `differential-ready`
6. `hypothesis-selected`
7. `workup-ready`
8. `checking-benefits`
9. `benefits-ready`
10. `awaiting-clinician-confirmation`
11. `writing-fhir`
12. `complete`
13. `recoverable-error`

Every asynchronous operation must set a visible state. The interface must never appear
frozen while a voice, retrieval, payer, or FHIR operation is running.

### 3.3 Differential whiteboard

Each differential item displays:

- display name;
- current rank;
- one-sentence assessment;
- supporting evidence citations;
- contradicting evidence citations;
- outstanding question or discriminating test;
- status: `candidate`, `leading`, `deprioritized`, or `removed`;
- the last conversation turn that changed it.

Every clinical evidence claim must link to a real resource in the synthetic Medplum
record. A citation includes resource type, resource ID, display label, effective date,
and the exact normalized fact used by the reasoning layer.

### 3.4 Workup and benefits

Each proposed workup item displays:

- plain-language service name;
- clinical purpose;
- hypothesis it evaluates;
- priority;
- current selection state;
- coding status: `verified`, `placeholder-needs-review`, or `text-only`;
- relevant Stedi benefit rows, if returned;
- coverage status exactly as reported by the payer response;
- patient-responsibility fields exactly as reported;
- network indicator exactly as reported;
- referral, limitation, or authorization messages exactly as reported;
- missing or inconclusive benefit information;
- recommended administrative next step.

The UI must not convert general eligibility into a guarantee of payment. It must not
label a service covered or denied unless the returned benefit row supports that exact
statement.

### 3.5 Confirmation and end state

FHIR write-back remains disabled until the clinician selects at least one workup item
and presses an explicit confirmation control.

The final state displays:

- the confirmed leading hypothesis;
- the confirmed proposed workup;
- the relevant Stedi summary;
- the created `ClinicalImpression`;
- the created `ServiceRequest` resources;
- a link or expandable view for the raw JSON of each created resource;
- a visible synthetic-data label;
- a visible “decision support; clinician confirmed” label.

## 4. System architecture

```text
Clinician audio
    |
    v
Voice runtime (Deepgram)
    |  transcript events / tool requests / assistant speech
    v
Session coordinator <----------------------------+
    |                                             |
    +--> Reasoning agent                          |
    |       |                                     |
    |       +--> Moss evidence search ------------+
    |       +--> Medplum FHIR reads --------------+
    |       +--> Differential/workup state -------+
    |       +--> Stedi eligibility check ---------+
    |                                             |
    +--> Clinician workspace UI                   |
    |                                             |
    +--> Confirmed Medplum FHIR writes -----------+
```

The session coordinator owns canonical application state. Integrations return typed
results and do not mutate UI state directly.

### 4.1 Suggested source layout

```text
src/
  app/                    application shell, routes, providers
  demo/                   case fixture, script, prerecorded events
  domain/                 canonical types and state transitions
  agent/                  tool registry and reasoning-session adapter
  integrations/
    deepgram/             voice runtime adapter
    medplum/              FHIR repository and write-back
    moss/                 indexing and evidence retrieval
    stedi/                eligibility request and response projection
  features/
    conversation/
    differential/
    workup/
    benefits/
    completion/
  tests/
```

The coding agent may adapt this layout to the selected framework while preserving the
module responsibilities and typed contracts below.

## 5. Canonical domain model

Implement equivalent TypeScript types for the following objects.

```ts
type DemoCase = {
  id: string;
  patientReference: `Patient/${string}`;
  encounterReference?: `Encounter/${string}`;
  stediScenarioKey: string;
  openingStatement: string;
  expectedDifferential: DifferentialItem[];
  expectedWorkup: CareOption[];
  script: DemoScriptStep[];
};

type EvidenceRef = {
  resourceType: string;
  resourceId: string;
  display: string;
  effectiveDate?: string;
  fact: string;
  direction: "supports" | "contradicts" | "context";
};

type DifferentialItem = {
  id: string;
  display: string;
  rank: number;
  assessment: string;
  status: "candidate" | "leading" | "deprioritized" | "removed";
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  discriminatingQuestion?: string;
  discriminatingTest?: string;
  lastUpdatedByTurn?: string;
};

type CareOption = {
  id: string;
  display: string;
  purpose: string;
  hypothesisIds: string[];
  priority: "now" | "next" | "later";
  selected: boolean;
  codingStatus: "verified" | "placeholder-needs-review" | "text-only";
  code?: { system: string; code: string; display?: string };
  benefits?: BenefitSummary;
};

type BenefitSummary = {
  payer: string;
  planStatus: "active" | "inactive" | "investigate" | "unknown";
  matchedServiceTypes: string[];
  benefitRows: BenefitRow[];
  deductible?: MoneyValue[];
  copay?: MoneyValue[];
  coinsurance?: PercentValue[];
  outOfPocket?: MoneyValue[];
  network?: "in" | "out" | "both" | "not-set";
  messages: string[];
  limitations: string[];
  authorizationSignals: string[];
  interpretation: string;
  rawCheckId?: string;
};

type SessionState = {
  phase: SessionPhase;
  caseId: string;
  transcript: ConversationTurn[];
  differential: DifferentialItem[];
  workup: CareOption[];
  selectedHypothesisId?: string;
  createdResources: FhirResourceLink[];
  activeOperation?: ToolActivity;
  error?: RecoverableError;
};
```

No UI component or external integration may introduce an alternative differential,
evidence, care-option, or benefits representation.

## 6. Subsystem contracts

### 6.1 Voice runtime

The voice implementation is owned by the voice workstream. The main application
depends only on this contract.

Inputs:

- start/stop session;
- microphone or prerecorded audio;
- session context;
- tool definitions;
- tool results;
- cancellation and fallback commands.

Outputs:

- runtime ready;
- listening started/stopped;
- interim clinician transcript;
- final clinician transcript;
- assistant text;
- assistant audio state;
- tool request;
- turn interruption;
- latency report;
- recoverable error;
- fatal error.

The main plan does not prescribe the voice prompt, managed LLM, audio encoding,
turn-detection thresholds, or provider-specific connection code.

Acceptance contract:

- the transcript is visible as events arrive;
- tool requests can be fulfilled by the session coordinator;
- tool results return to the active conversation;
- assistant text is available independently of audio playback;
- the session can be replaced by prerecorded events without changing downstream state;
- a failed live session can switch to fallback mode without reloading the case.

### 6.2 Reasoning agent

The reasoning agent receives:

- the clinician's finalized turn;
- the current differential and workup state;
- compact patient context;
- available tool schemas;
- previous tool results relevant to the active turn.

It may only make patient-specific evidence claims using returned `EvidenceRef` values.
It may propose state changes but may not write FHIR resources without explicit clinician
confirmation.

Required tools:

```text
get_patient_context(patientReference)
search_patient_evidence(patientReference, query, hypothesisIds?)
update_differential(items, explanation)
propose_workup(options, explanation)
check_patient_benefits(stediScenarioKey, careOptionIds)
prepare_clinical_writeback(selectedHypothesisId, careOptionIds)
```

Tool responses must be JSON-serializable and validated before entering canonical state.

### 6.3 Medplum repository

Read these FHIR R4 resources for the demo patient when available:

- `Patient`;
- `Encounter`;
- `Condition`;
- `Observation`;
- `MedicationRequest` and `MedicationStatement`;
- `AllergyIntolerance`;
- existing `DiagnosticReport` resources;
- existing `ServiceRequest` resources;
- `Procedure`;
- `DocumentReference`, if the case uses a source document.

Normalize relevant resources into `EvidenceRef` records and Moss index documents. Keep
the original resource type and ID on every normalized record.

Create these resources only after clinician confirmation:

1. One R4 `ClinicalImpression` containing the narrative differential, selected leading
   hypothesis, assessment summary, and supporting resource references.
2. One draft/proposed R4 `ServiceRequest` for each selected workup item.

Use `ServiceRequest.status = "draft"` and `ServiceRequest.intent = "proposal"` unless
the case owner explicitly approves a different R4 state. Use verified codes only. A
text-only `CodeableConcept` or clearly flagged placeholder is required when a code has
not been validated.

Write-back must be idempotent within a demo session. Replaying the final step must not
create duplicate resources.

### 6.4 Moss evidence index

Index one document per normalized clinical fact. Each indexed document contains:

```ts
type MossEvidenceDocument = {
  patientReference: string;
  resourceType: string;
  resourceId: string;
  effectiveDate?: string;
  display: string;
  fact: string;
  searchableText: string;
  tags: string[];
};
```

The demo patient must be fully indexed before the presentation begins. Search results
must preserve the original Medplum resource ID and return enough text to render the
evidence citation without another blocking FHIR request.

The UI must allow a citation to open the original Medplum resource or its raw JSON.

### 6.5 Stedi eligibility adapter

Reuse the verified request fixtures and parsing behavior in `stedi-poc/`.

The adapter accepts:

- a known `stediScenarioKey`;
- the selected care-option service labels;
- an optional transport selection of REST or Stedi MCP.

It returns a canonical `BenefitSummary` plus the raw response.

The adapter must parse:

- `planStatus`;
- `benefitsInformation`;
- active, inactive, and non-covered benefit codes;
- service type names and codes;
- deductible, copayment, coinsurance, out-of-pocket, and limitation rows;
- network indicators;
- payer messages;
- prior-authorization or referral messages;
- subscriber AAA errors;
- top-level errors.

The default demo scenario must be a documented Stedi test fixture. The application must
also support an offline fixture containing the saved response for that same scenario.

### 6.6 Session coordinator

The session coordinator:

- loads the case;
- initializes Medplum patient context;
- confirms Moss indexing readiness;
- receives voice events;
- executes agent tools;
- validates tool results;
- owns phase transitions;
- updates canonical state;
- controls Stedi and Medplum mutations;
- records a replayable event log;
- switches between live and fallback modes.

All demo-visible behavior must be reproducible by replaying the event log against the
same case fixture.

## 7. Live mode and deterministic mode

### 7.1 Live mode

Live mode uses the voice runtime, real Moss search, real Medplum reads, and one real
Stedi test-mode call. The clinician controls the conversation naturally.

### 7.2 Deterministic mode

Deterministic mode uses:

- the canonical prerecorded audio or transcript;
- a fixed sequence of validated voice/tool events;
- the same reducers and UI state as live mode;
- real integrations when healthy;
- saved Moss, Medplum, or Stedi fixtures when an external call is unavailable.

The presenter advances deterministic beats manually. There is no autoplay requirement.

### 7.3 Fallback triggers

Offer an immediate switch to deterministic mode when:

- microphone permission fails;
- the voice socket fails to become ready;
- no final transcript arrives within the configured timeout;
- the reasoning turn fails twice;
- Moss search fails or exceeds its timeout;
- the Stedi request fails or exceeds its timeout;
- a Medplum write fails after one retry.

The switch must preserve the current patient and visible session state.

## 8. Error states

Provide specific recoverable states for:

- voice unavailable;
- transcript unavailable;
- evidence search unavailable;
- no patient evidence found;
- invalid reasoning payload;
- eligibility check rejected;
- eligibility response inconclusive;
- FHIR read unavailable;
- FHIR write unavailable;
- duplicate write detected.

Each error state shows:

- the failed operation;
- a plain-language explanation;
- retry when safe;
- deterministic fallback when available;
- the last valid application state.

Do not expose secrets, tokens, request authorization headers, or stack traces in the UI.

## 9. Observability

Capture a local session event log containing:

- timestamps;
- phase transitions;
- finalized transcript turns;
- tool requests and sanitized results;
- Moss result counts and latency;
- Medplum read/write resource types and IDs;
- Stedi scenario, result category, and latency;
- voice latency reports;
- fallback activation;
- created FHIR resource IDs.

Provide a compact presenter-only diagnostics view. Keep it hidden during the normal
demo unless a judge asks how the system works.

## 10. Acceptance criteria

The build is demo-ready only when all of the following pass on the presentation laptop:

### Case and data

- [ ] One complete synthetic `DemoCase` exists.
- [ ] The Medplum patient record contains every scripted evidence resource.
- [ ] Every scripted citation resolves to an existing FHIR resource.
- [ ] Moss contains the normalized evidence documents for the patient.
- [ ] The selected Stedi scenario succeeds in test mode.
- [ ] The saved Stedi response matches the selected scenario.

### Conversation and reasoning

- [ ] A clinician utterance appears in the transcript.
- [ ] The reasoning layer requests patient evidence.
- [ ] Moss results update the differential.
- [ ] Supporting and contradicting citations render correctly.
- [ ] The clinician can select the leading hypothesis.
- [ ] The agent proposes two or three workup options.

### Benefits and write-back

- [ ] The application runs one Stedi check from the workup state.
- [ ] The benefits panel distinguishes reported facts from interpretation.
- [ ] The clinician can confirm selected workup items.
- [ ] Confirmation creates one `ClinicalImpression`.
- [ ] Confirmation creates the expected draft/proposed `ServiceRequest` resources.
- [ ] Repeating confirmation does not create duplicates.
- [ ] Created resources are inspectable as raw JSON.

### Demo resilience

- [ ] Live mode completes the golden path once.
- [ ] Deterministic mode completes the same path without a microphone.
- [ ] Stedi offline-fixture mode renders the same summary shape.
- [ ] A failed external operation presents a usable fallback.
- [ ] No secret appears in browser code, logs shown on screen, or committed files.
- [ ] The complete scripted demo fits the allotted presentation time.

## 11. Implementation sequence

Build in this order:

1. Lock the `DemoCase`, Stedi fixture, and canonical demo script.
2. Scaffold the application shell and canonical state model.
3. Render the entire golden path from static fixtures.
4. Seed and read the synthetic FHIR record from Medplum.
5. Normalize and index the patient evidence in Moss.
6. Connect live Moss search to differential updates.
7. Lift the Stedi adapter and response projection from `stedi-poc/`.
8. Implement clinician confirmation and idempotent FHIR write-back.
9. Connect the voice runtime through its subsystem contract.
10. Add deterministic replay and integration fallbacks.
11. Run the full acceptance checklist.
12. Record the video, submit, and rehearse the live presentation.

## 12. Workstream boundaries

### Case and clinical content

Owns the synthetic record, expected differential, evidence direction, proposed workup,
script, and clinical-language review.

### Voice

Owns Deepgram configuration, prompts, managed LLM selection, audio capture/playback,
turn handling, tool-call transport, and voice fallback events.

### Agent and retrieval

Owns reasoning tool schemas, result validation, FHIR normalization, Moss indexing,
evidence search, and differential/workup state projections.

### Coverage

Owns the selected Stedi scenario, API adapter, parser, benefits projection, offline
fixture, and coverage-language review.

### Application and demo

Owns the session coordinator, clinician workspace, deterministic replay, error states,
FHIR confirmation flow, end card, diagnostics, video, and rehearsal build.

## 13. Explicitly out of scope

- real patient data or PHI;
- production authentication and access-control design;
- production HIPAA, SOC 2, or security hardening;
- autonomous diagnosis;
- autonomous order placement;
- real payer transactions;
- claims submission or adjudication;
- guaranteed cost estimates;
- prior-authorization submission;
- insurance discovery;
- coordination-of-benefits checks;
- multiple patient cases;
- generalized clinical coding;
- invented SNOMED, ICD, CPT, LOINC, or other terminology codes;
- mobile layouts;
- production deployment architecture;
- background jobs, subscriptions, or Medplum Bots unless already available and required
  by the golden path;
- analytics beyond the presenter diagnostics view.

## 14. Configuration locks

Resolve these values in the case fixture before case-specific implementation begins:

| Lock | Required value |
|---|---|
| Demo patient | Synthetic name and Medplum `Patient` ID |
| Clinical case | Opening complaint, expected differential, decisive evidence |
| Stedi scenario | One key from `stedi-poc/scenarios.mjs` |
| Insurance reveal | Exact returned benefit rows used in the UI |
| Final workup | Two or three options and confirmed selection |
| FHIR evidence | Exact resource IDs cited by the script |
| Demo duration | Official limit or three-minute default |
| Live voice contract | Event schema agreed with the voice workstream |
| Fallback audio | Final prerecorded file and transcript |
| Presenter | Person responsible for each spoken and clicked beat |

Do not expand the feature set while any required acceptance criterion remains incomplete.
