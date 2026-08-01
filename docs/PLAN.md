# house_md — build plan (locked ~11:45am)

**The pitch:** the House whiteboard scene, as an agent. A clinician presents a case; the
agent argues the differential with them — citing the patient's actual record — then
checks what the patient's coverage really pays for and turns the leading dx into a
*feasible* care plan. A council of peers at your fingertips.

**Why it wins:** hits two legs of the judges' own vision verbatim ("any health issue you
describe is deep researched" + "how much will it cost, will insurance cover it"). The
**coverage half is the differentiator** — symptom-checker DDx will appear 5× today; DDx →
Stedi eligibility → coverage-aware workup is the fresh intersection, and makes this one
of the only teams with three sponsors load-bearing (four if Moss retrieval lands).

## Demo loop

1. Medplum patient with a rich record (sample data import) — conditions, meds, labs.
2. Clinician presents the case BY VOICE (Deepgram) — agent asks House-style clarifying
   questions, pulls record context itself.
3. **Whiteboard UI:** ranked differential, each item with supporting/contradicting
   evidence CITED to actual FHIR resources (Observation/Condition ids — no free-floating
   claims).
4. Pick the leading dx → agent proposes workup/care options → **Stedi test-mode
   eligibility** (mock Aetna/Cigna/UHC/Medicare) → options annotated covered/not-covered.
5. Write-back: DiagnosticReport (differential as impression) + proposed ServiceRequests.
6. End card: what the conversation became, as FHIR — rows clickable to raw JSON.

Demo mode = click-advanced stepper, zero autoplay, presenter script visible. Live-mic
beat only if the voice upgrade is solid by 4pm.

## Work split

Team divides lanes in the room. Suggested lanes to cover: agent core + FHIR wiring ·
case selection + whiteboard UX + demo script · coverage/Stedi leg · voice pipeline.

## Judge-proofing

- "Is this AI diagnosing patients?" → No: clinician-facing decision support; the agent
  argues, the doctor decides — that's the House framing itself.
- "Aren't 5 teams doing DDx?" → "This is the one where the differential knows what your
  insurance will pay for. Diagnosis without a feasible plan is a term paper."
- Never show an invented clinical code; cite the record for every evidence claim.

## Scope gates

- **1:00pm** — DDx conversation works text-first against the record.
- **2:00pm** — voice gate: live in, or one canned exchange + text drive.
- **3:00pm** — Stedi: ONE eligibility call rendered in the options UI. Not an engine.
- **4:00pm** — pencils down; rehearse; submit form:
  https://docs.google.com/forms/d/e/1FAIpQLSdqhh466ADsUm-44CSkjC0xkOcm431wkJx_n_r7W4qT8FCRgA/viewform

## Stack pointers

Medplum hosted project `vj_sandbox_plum` (client creds in .env, verified working) or
`@medplum/mock` for offline dev · `@medplum/react` gives SearchControl/ResourceTable/
PatientTimeline free · Deepgram + Stedi + Moss keys in .env · cheatsheets in
`docs/notes/`.
