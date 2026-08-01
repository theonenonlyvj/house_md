# house_md — canonical build plan

Status: implementation blueprint for the August 1, 2026 hackathon build.

This is the single implementation source of truth. Strategic reasoning and product
direction live in [`PRINCIPLES.md`](./PRINCIPLES.md); the separate two-minute video
constraint lives in [`DEMO.md`](./DEMO.md). Provider-specific verified notes remain in
`docs/notes/`.

## 1. Target outcome

Build a clinician-facing application that turns a spoken case discussion into a
patient-specific differential and a feasible proposed workup.

The finished demo must show one uninterrupted loop:

1. Select a synthetic patient and load their longitudinal FHIR record from Medplum.
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

### 1.1 Functional truth requirements

The application must work from current inputs and provider responses:

- Medplum reads return the patient record used by the session.
- Moss searches the indexed facts derived from those Medplum resources.
- The reasoning output is generated from the clinician's words and retrieved evidence.
- Stedi is called in test mode using a documented synthetic subscriber request.
- Medplum write-back creates inspectable R4 resources after clinician confirmation.
- Changing the spoken presentation can change the differential and tool calls.
- Changing the patient record can change the retrieved evidence and citations.

Do not hardcode the visible transcript, differential, workup, benefits result, or FHIR
write-back. Provider fixtures are limited to automated tests and isolated component
development. Prerecorded audio is an input option, not a recorded-output replay.

### 1.2 Current implementation truth

Treat the following as the starting state for implementation. Documentation and an
agreed contract do not mean that an integration is complete.

| Subsystem | Current state | Required next proof |
|---|---|---|
| Stedi | Verified standalone POC in `stedi-poc/`, including test-mode requests, response parsing, saved test fixtures, and UI experiments | Move the adapter and canonical projection into the main application; make a fresh test-mode call from the golden path and render that response |
| Deepgram | API behavior, voice options, and intended subsystem boundary are documented; no main-application voice path exists | Process microphone or prerecorded audio through Deepgram, deliver its transcript and tool events to the session coordinator, and play the generated response |
| Medplum | FHIR R4 read/write design and SDK notes exist; no selected patient has been seeded and no main-application repository exists | Seed the selected synthetic record, read it through the application, resolve visible citations, and inspect clinician-confirmed write-back resources |
| Moss | Retrieval role and evidence-document contract are designed; no verified application integration exists | Verify the provider API, index normalized evidence for the selected patient, and return searches containing the original Medplum resource IDs |
| Reasoning runtime | Tool boundaries and expected state changes are designed; the voice workstream is still selecting its exact pipeline and prompts | Complete a text-first tool loop whose output changes with clinician input and returned patient evidence |
| Main application | Product states, domain contracts, and proposed layout are documented; there is no application scaffold yet | Implement the session coordinator and complete one end-to-end case through all real integrations |

Use these terms consistently:

- **Designed:** responsibility, boundary, and intended contract are documented.
- **Verified:** a standalone request has succeeded against the provider's test or
  sandbox environment.
- **Integrated:** the main application consumes the current provider response through
  its typed adapter.
- **Demo-ready:** the integration completes its visible golden-path beat and exposes a
  truthful loading, failure, and retry state.

An integration is only complete when it has an exact configuration, a reproducible
smoke request, a typed request/response adapter, an application-level proof, and a
visible failure path. Interactive mode must never silently replace a failed provider
operation with a fixture.

## 2. Locked demonstration case

Build the technical default around **Candidate C: hidden systemic amyloidosis with
possible cardiac involvement**, subject to final clinician review. Use the documented
synthetic UnitedHealthcare subscriber and Stedi scenario `uhc-jane` / `uhc`.

### 2.1 Identity and opening presentation

- Synthetic patient: Jane Doe, born 1971-01-01.
- Current presentation: progressive exertional dyspnea and bilateral leg swelling.
- Payer: synthetic UnitedHealthcare test profile.
- Clinical direction: systemic amyloidosis with possible cardiac involvement.
- Important unresolved branch: AL versus ATTR; never present either subtype as
  confirmed without appropriate evidence.

The spoken opening must fit within 15 seconds. Patient and payer identities must be
visibly labeled synthetic/test data.

### 2.2 Longitudinal record to seed

Create synthetic FHIR R4 resources for these scattered clues:

- bilateral carpal-tunnel history;
- progressive peripheral neuropathy or orthostatic symptoms;
- persistent proteinuria or renal dysfunction;
- an echocardiogram report describing increased ventricular wall thickness;
- an ECG report with clinically reviewed voltage or conduction findings;
- elevated cardiac biomarker observations across time;
- current dyspnea and edema observations;
- hypertension as a credible competing explanation.

No single resource may state the final assessment. The retrieval moment must connect
facts distributed across the longitudinal record. Exact clinical values require final
review. Use text-only FHIR `CodeableConcept` values flagged for review unless codes
have been validated.

### 2.3 Reference assertions for review and tests only

Reference differential:

1. systemic amyloidosis with possible cardiac involvement;
2. hypertensive heart disease;
3. hypertrophic cardiomyopathy or another infiltrative cardiomyopathy.

Reference workup:

- serum free light chains;
- serum and urine immunofixation;
- cardiology consultation, with hematology involvement if monoclonal-protein testing
  is abnormal;
- additional cardiac imaging or amyloid typing only when clinically appropriate.

The initial workup distinguishes a possible monoclonal light-chain process from ATTR.
The interface must not imply that one imaging result establishes the subtype.

These assertions exist for clinical review and automated evaluation. They must never
be supplied to the runtime agent as hidden answers or used to populate visible state.
Runtime output must derive from the current clinician input and provider responses.

### 2.4 Verified UHC benefit projection

The saved Stedi response supports only these statements:

- active plan coverage;
- payer message: the PCP must submit a specialist referral;
- $15 in-network specialist copay per visit;
- $0 remaining in-network individual deductible;
- $850 remaining in-network individual out-of-pocket amount.

Attach the referral message and specialist benefit only to the consultation option.
For laboratory or imaging options, display `No matching service-specific benefit
returned` unless the fresh Stedi response contains that service category. Never infer
a test price, coverage, authorization, or guarantee of payment.

### 2.5 Considered alternatives

The team also considered two synthetic case/profile pairings. They are not part of the
first implementation:

| Candidate | Clinical direction | Matching Stedi profile | Distinctive reveal |
|---|---|---|---|
| Multisystem vasculitis | EGPA or another multisystem vasculitis from asthma, sinus disease, eosinophilia, neuropathy, and renal evidence | `cigna-james` | Strong network contrast: $250 in-network deductible and 10% coinsurance versus $7,500 and 50% out of network |
| Recurrent neurovisceral attacks | Acute hepatic porphyria from episodic abdominal pain, negative imaging, hyponatremia, and neuropathy | `aetna-jane` | Concrete office, urgent, emergency, inpatient, and outpatient cost-sharing rows |

Additional verified Stedi fixtures include a CMS profile with explicit non-covered
preventive dental and long-term-care categories and an inactive UHC plan. Retain all
verified scenarios in `stedi-poc/`; do not create separate product flows for them.

## 3. Product experience

### 3.1 Application shell

The primary application is a single clinician workspace with four persistent regions:

1. **Patient header** — synthetic patient identity, encounter context, medications,
   active conditions, and payer badge.
2. **Conversation rail** — clinician and agent turns, listening state, tool activity,
   and voice controls.
3. **Living Differential Canvas** — ranked hypotheses, evidence bindings, information
   gaps, workup, benefits, and FHIR results on one constrained spatial surface.
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

### 3.3 Differential canvas content

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

### 3.6 Living Differential Canvas

The canvas is the visual center of the application. Conversation remains a compact
rail or caption strip; the evolving clinical artifact dominates the workspace. The
desired visible moment is Medplum-backed evidence changing the ranked differential,
followed by the clinician carrying the selected direction into workup, benefits, and
FHIR confirmation.

Locked implementation decisions:

- Use React, TypeScript, `konva`, and `react-konva`.
- Run the canvas locally in the browser; no hosted canvas provider or canvas API key.
- Use React Konva as a renderer and interaction surface, never as the clinical store.
- Do not build a general-purpose whiteboard or give an LLM arbitrary canvas mutation.
- Derive every shape from canonical `SessionState` through a pure projection.
- Keep buttons, transcript, detailed inspection, tooltips, dialogs, and voice controls
  in semantic HTML.
- Design for a 1440 x 900 logical stage that scales to a projector-friendly desktop.
- Use a restrained light palette: white base, cool neutral structure, muted teal-blue
  primary, brass for uncertainty, and green/red only for evidence direction or status.

Canvas terminology:

- **Clinical shapes:** patient, hypothesis, evidence, information gap, workup, benefit,
  and FHIR-result objects.
- **Evidence bindings:** `supports`, `contradicts`, or `context` relationships.
- **Canvas scenes:** differential, workup, and confirmation regions.
- **Canvas projection:** the pure transformation from `SessionState` to a derived
  `CanvasDocument`.

```ts
type CanvasDocument = {
  scene: "differential" | "workup" | "confirmation";
  shapes: ClinicalShape[];
  bindings: EvidenceBinding[];
  focusShapeId?: string;
  activity?: CanvasActivity;
};

type ClinicalShape =
  | PatientShape
  | HypothesisShape
  | EvidenceShape
  | InformationGapShape
  | WorkupShape
  | BenefitShape
  | FhirResultShape;

type EvidenceBinding = {
  id: string;
  evidenceShapeId: string;
  hypothesisShapeId: string;
  direction: "supports" | "contradicts" | "context";
};

function projectSessionToCanvas(state: SessionState): CanvasDocument;
```

`CanvasDocument` is derived and must not be persisted as an alternative clinical
model. The projection uses stable IDs, produces identical output for identical state,
accepts no provider payloads directly, performs no clinical interpretation inside UI
components, omits uncited patient-specific evidence, and reflects clinician selection
only after an explicit action.

Deterministic layout rules:

- hypotheses occupy stable horizontal lanes ordered by current rank;
- supporting and contradicting evidence appear on distinct sides of each lane;
- neutral context remains visually neutral;
- information gaps align with the hypotheses they discriminate;
- workup, benefit, and confirmation regions progress from left to right;
- benefit shapes bind to workup options, not globally to the patient;
- visible evidence is capped per hypothesis, with overflow available in the inspector;
- application phase controls the default camera; manual pan/zoom is optional.

Use separate Konva layers for background, evidence bindings, clinical shapes,
interaction state, and temporary activity. Keep projection separate from layout, and
layout separate from animation.

Animate only state changes: evidence arriving, ranks reordering, bindings appearing,
selection becoming pinned, benefits resolving, and FHIR writes completing. Use
150–450 ms ease-out transitions, no bounce or continuous decoration, and reduced-motion
snap/crossfade behavior.

Required interactions:

- inspect a hypothesis and its rationale;
- inspect a citation and open the exact Medplum resource;
- explicitly select a leading hypothesis;
- select proposed workup items;
- inspect the exact Stedi rows attached to an option;
- explicitly confirm FHIR write-back;
- inspect every created resource.

Maintain a semantic DOM mirror of every visible clinical object, keyboard equivalents
for selection, one restrained `aria-live` region, non-color direction cues, and
projector-readable WCAG AA text. The semantic experience must remain usable if the
canvas renderer is unavailable.

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
  cases/                  synthetic patient definitions and validation assertions
  domain/                 canonical types and state transitions
  canvas/                 pure projection, layout, shapes, bindings, transitions
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
type PatientCase = {
  id: string;
  patientReference: `Patient/${string}`;
  encounterReference?: `Encounter/${string}`;
  insuranceProfileKey: string;
};

type CaseAssertions = {
  caseId: string;
  expectedEvidenceResourceIds: string[];
  acceptableLeadingHypotheses: string[];
  expectedWorkupConcepts: string[];
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
- prerecorded audio passes through Deepgram and the same downstream application flow;
- a microphone failure can switch to prerecorded audio without reloading the case.

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
check_patient_benefits(insuranceProfileKey, careOptionIds)
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

Write-back must be idempotent within a session. Repeating the confirmation action must
not create duplicate resources.

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

- a known `insuranceProfileKey` mapped to a Stedi test-mode request;
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

The selected profile must be a documented Stedi test-mode request. The interactive
application calls Stedi's API and projects the returned response. Saved responses may
be used in adapter tests and local UI development only.

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
- records a sanitized session event log;
- switches the voice input between microphone and prerecorded audio.

The coordinator must not replace failed Medplum, Moss, Stedi, or reasoning operations
with hidden canned results. Integration failures remain visible and retryable.

## 7. Runtime modes

### 7.1 Interactive mode

Interactive mode uses microphone audio, the voice runtime, live Moss search, live
Medplum reads, and a live Stedi test-mode request. The clinician controls the
conversation naturally.

### 7.2 Prerecorded voice-input mode

Prerecorded voice-input mode replaces only microphone capture. It uses:

- a clinically reviewed audio recording;
- Deepgram transcription of that recording;
- the same reasoning and tool-call path as interactive mode;
- live Moss search;
- live Medplum reads and writes;
- a live Stedi test-mode request.

The application must not inject a stored transcript in place of Deepgram output during
the judged run.

### 7.3 Development fixture mode

Saved provider responses are allowed only for automated tests and isolated UI
development. Fixture mode must be explicitly enabled as a development setting and must
never activate automatically in the interactive application.

### 7.4 Runtime failures

Offer prerecorded voice-input mode when:

- microphone permission fails;
- the voice socket fails to become ready;
- live audio capture fails;
- live audio quality prevents usable transcription.

For reasoning, Moss, Stedi, and Medplum failures, preserve the current state and offer a
real retry. Do not substitute a fixture. The switch to prerecorded audio must preserve
the current patient and visible session state.

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
- retry or prerecorded voice input when applicable;
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
- prerecorded voice-input activation;
- created FHIR resource IDs.

Provide a compact presenter-only diagnostics view. Keep it hidden during the normal
demo unless a judge asks how the system works.

## 10. Acceptance criteria

The build is demo-ready only when all of the following pass on the presentation laptop:

### Case and data

- [ ] One complete synthetic `PatientCase` exists.
- [ ] The Medplum patient record contains every clinically reviewed evidence resource.
- [ ] Every returned citation resolves to an existing FHIR resource.
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

- [ ] Interactive mode completes the golden path using live provider calls.
- [ ] Prerecorded voice-input mode completes the same path through Deepgram and the
      live downstream integrations.
- [ ] Changing the clinician's words changes the reasoning output without a code or
      fixture change.
- [ ] Changing the Medplum evidence changes the citations returned through Moss.
- [ ] The Stedi panel renders the response returned by the current API request.
- [ ] No production UI path contains a hardcoded differential, workup, benefit result,
      transcript, or created FHIR resource.
- [ ] A failed external operation remains visible and offers a real retry.
- [ ] No secret appears in browser code, logs shown on screen, or committed files.

## 11. Implementation sequence

Build in this order:

1. Scaffold the React/TypeScript application and canonical session reducer.
2. Add the fixed logical Konva stage and semantic HTML shell.
3. Implement pure canvas projection, deterministic layout, and the differential scene
   against explicit development fixtures.
4. Add clinician hypothesis selection, workup, benefits, confirmation, and FHIR-result
   projections; verify canonical state before canvas output.
5. Seed and read the selected synthetic FHIR record from Medplum.
6. Normalize and index the patient evidence in Moss; connect live results to the
   differential.
7. Lift the Stedi adapter and response projection from `stedi-poc/`.
8. Implement clinician confirmation and idempotent FHIR write-back.
9. Complete the text-first reasoning tool loop.
10. Connect Deepgram through the same session coordinator, then add prerecorded voice
    input without replacing downstream live calls.
11. Prove that altered speech and altered patient evidence change the generated output.
12. Run the full acceptance checklist, then stop building and produce the separate
    two-minute demo artifact.

The integration dependency chain is:

```text
Deepgram input
    -> reasoning runtime
        -> Medplum patient context
        -> Moss evidence retrieval with Medplum citations
        -> Stedi test-mode eligibility
    -> clinician confirmation
        -> Medplum write-back
    -> Deepgram response
```

Build and verify the text-first reasoning and tool path before making voice its primary
input. Deepgram connects to the same session coordinator; it must not create a separate
voice-only implementation of the clinical workflow.

## 12. Workstream boundaries

### Case and clinical content

Owns the synthetic record, validation assertions, evidence direction, proposed workup,
and clinical-language review.

### Voice

Owns Deepgram configuration, prompts, managed LLM selection, audio capture/playback,
turn handling, tool-call transport, and voice fallback events.

### Agent and retrieval

Owns reasoning tool schemas, result validation, FHIR normalization, Moss indexing,
evidence search, and differential/workup state projections.

### Coverage

Owns the selected Stedi scenario, API adapter, parser, benefits projection, test
fixtures, and coverage-language review.

### Application

Owns the session coordinator, clinician workspace, prerecorded voice-input mode, error
states, FHIR confirmation flow, end card, and diagnostics.

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

Resolve these values in the case configuration before case-specific implementation
begins:

| Lock | Required value |
|---|---|
| Demo patient | Synthetic Jane Doe (1971-01-01) and her created Medplum `Patient` ID |
| Clinical case | Amyloidosis direction, exact opening complaint, and clinically reviewed seeded evidence |
| Stedi scenario | `uhc-jane` / `uhc` |
| Insurance reveal | Exact returned benefit rows used in the UI |
| Final workup | Two or three options and confirmed selection |
| FHIR evidence | Exact resource IDs available to the retrieval and citation path |
| Live voice contract | Event schema agreed with the voice workstream |
| Prerecorded input | Clinically reviewed audio file; transcript remains Deepgram output |

Do not expand the feature set while any required acceptance criterion remains incomplete.
