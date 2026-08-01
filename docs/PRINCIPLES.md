# house_md — guiding principles

This document explains the decisions that shape [`PLAN-V2.md`](./PLAN-V2.md). It is
the reference for resolving ambiguity during implementation.

## 1. Build the judged moment

The project is a one-day hackathon submission. Its quality is measured by a short,
observable experience, not by production completeness. Work should increase the
clarity, credibility, or reliability of the golden-path demo.

The application only needs one excellent case. A second case, generalized framework,
or production abstraction is lower priority than making the first case coherent from
voice input through FHIR write-back.

## 2. One story, not a collection of integrations

Every sponsor technology should remove a distinct obstacle in the same clinical
workflow:

- Deepgram removes the keyboard and makes the interaction conversational.
- Moss finds the relevant facts inside a longitudinal record quickly enough for that
  conversation.
- Medplum supplies the standards-based patient record and receives the clinician's
  confirmed work.
- Stedi introduces the financial and administrative reality of the proposed workup.

Sponsor logos are not features. An integration counts only when removing it would make
the demonstrated workflow materially weaker.

## 3. The clinician remains the decision-maker

The agent is an argumentative peer, not an autonomous diagnostician. It proposes,
challenges, retrieves, summarizes, and explains. The clinician chooses the leading
hypothesis, selects the proposed workup, and explicitly confirms write-back.

This principle governs UI language, tool permissions, FHIR status values, and demo
narration. Proposed work remains draft or proposal state.

## 4. Ground claims in the patient's record

The product's central credibility signal is provenance. A differential item is only
patient-specific when its evidence can be traced to the underlying record.

Every supporting or contradicting claim therefore carries a Medplum resource ID. Moss
improves retrieval speed but does not replace Medplum as the source of truth. Generated
summaries may help search, but the visible evidence must retain its original source.

If the agent cannot find a supporting resource, it should describe the statement as a
general hypothesis or an information gap, not as a fact about the patient.

## 5. Make reasoning visible

A hidden chatbot response is less convincing than an evolving clinical artifact. The
whiteboard should reveal the work:

- what the agent is considering;
- what evidence raised or lowered an item;
- what remains uncertain;
- what question or test would discriminate between alternatives;
- what the clinician selected.

Spoken responses should stay short. Detailed reasoning belongs in the persistent visual
state where judges can inspect it.

## 6. Treat coverage data precisely

Eligibility data is not a guarantee of payment, a binding price, or a completed prior
authorization. The application must distinguish:

- active plan coverage;
- service-specific benefits;
- patient cost-sharing;
- network information;
- payer messages and limitations;
- authorization or referral signals;
- missing or inconclusive information.

The product should demonstrate that clinical quality and administrative feasibility can
be considered together without pretending that payer data is more definitive than it
is.

## 7. Prefer real boundaries and deterministic interiors

The demo should touch each sponsor product through a genuine integration. The system
around those calls should be deterministic enough to rehearse and recover.

Real Medplum resources, a real Moss search, a real Stedi test-mode request, and a real
Deepgram interaction are valuable. Random model output, uncontrolled UI transitions,
and unrecoverable stage dependencies are not.

Use validated fixtures for development and fallback. Keep their shapes identical to the
live integration results.

## 8. A fallback is part of the product

Voice, network, and model calls can fail during a presentation. The fallback should
preserve the same patient, transcript, differential, benefits, and FHIR output instead
of opening a separate mock application.

Live and deterministic modes should drive the same state transitions. Switching modes
should look like a recovery action, not a change of product.

## 9. Optimize perceived latency

Fast systems acknowledge work immediately. Every external call should produce a visible
activity state before its result arrives.

Keep the critical path short:

- return source metadata directly from Moss;
- avoid duplicate Medplum reads during a spoken turn;
- keep agent prompts and tool payloads compact;
- use the Stedi check once, at the decisive point;
- stream assistant text and speech when possible;
- keep spoken answers concise.

An evidence-grounded response may take longer than an ungrounded response. The UI should
show the evidence-gathering process so that the delay communicates useful work.

## 10. Use FHIR as the application model, not decoration

Medplum should be involved at both ends of the workflow: patient context enters from
FHIR and confirmed clinical work returns as FHIR.

FHIR R4 types must be checked against `@medplum/fhirtypes`. Codes must be validated or
left text-only and visibly flagged for review. The application should not invent
terminology codes to make a resource look complete.

The differential is a clinical assessment, so `ClinicalImpression` is the default
write-back resource. Workup items remain proposed `ServiceRequest` resources until a
real clinical workflow promotes them.

## 11. Keep subsystem ownership explicit

Teams can work in parallel when they agree on event and data contracts. The central plan
defines those contracts without dictating internal implementation.

The voice workstream may change models, prompts, or audio plumbing as long as it emits
the agreed events. The Stedi workstream may use REST or MCP as long as it returns the
canonical benefits projection. The UI should consume domain state rather than provider
payloads directly.

## 12. Keep secrets and real patient information out

Hackathon scope does not remove the need for basic repository hygiene. Keys stay in the
gitignored `.env`. Logs and screenshots must not expose them. Only synthetic people and
records belong in the repository or demo.

This is both a safety constraint and a presentation signal: the team understands the
domain even while intentionally avoiding production hardening.

## 13. Stop when the loop is complete

Once the golden path works in live and deterministic modes, effort moves to rehearsal,
video, submission, and presentation polish.

Do not add another case, agent, dashboard, payer workflow, or clinical feature while a
required demo beat remains unreliable or unclear.
