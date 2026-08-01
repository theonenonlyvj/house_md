# house_md — positioning one-pager

**Tagline:** Diagnosis is a team sport. Most doctors don't have the team.

## What it is

house_md seats a council of AI specialist personas around a clinician's hardest case:
they argue the differential out loud in different voices, cite the patient's actual
FHIR record for every claim, check what insurance actually pays before options are
discussed, and write the confirmed plan back to the chart. The clinician runs the room
and makes every decision.

## Who it's for

The clinician without specialists down the hall. One in five Americans lives in a
rural area; most specialists don't. A rural family physician carries diagnostic load a
metro doctor would refer down the hallway, and the nearest cardiologist can be a
two-hour drive. house_md is an augmentation tool for exactly that clinician: a
specialist panel in the room, on demand, grounded in the chart the clinician already
has.

## Why now

Three things became true at once. Managed voice agents got good enough to run a
multi-voice room in real time (Deepgram). FHIR stores became programmable in an
afternoon (Medplum). Eligibility became a live API call instead of a fax (Stedi).
The pieces to build the doctor's side of agentic care finally exist, and almost
everyone is building the patient's side.

## Why us

Four builders, one day, every integration called live, and the repo publishes an
integration truth table instead of a claims page. We ship the guardrails as code and
put them on screen. That discipline is the product.

## Three proof points

1. **Seating is computed, and cannot lie.** A pure, unit-tested function maps case
   features to required specialties. A required seat the roster can't fill renders as
   an empty chair and the chair announces it out loud. No hard-coded roster, no
   scripted gap.
2. **Cited or conjecture, enforced in code.** After every model turn the coordinator
   validates citations against the record; unsupported patient-specific claims are
   demoted to visibly labeled conjecture. The model cannot self-certify. Every
   citation opens a real Medplum resource.
3. **Coverage before options.** A live Stedi test-mode eligibility call powers a
   reimbursement seat that asserts only facts the current 271 returned. In the demo
   case, a PCP-referral gate visibly re-sequences the plan and the $15 specialist
   copay attaches to the consult.

## The moat

The moat is trust architecture. Any team can prompt an LLM to role-play five doctors.
house_md's composition guardrail (real seating, honest empty chair) and citation
guardrail (cited-or-conjecture, validated in code) make the room auditable: a
clinician can click any claim and open the resource behind it. Auditability is what
turns a demo into a tool a physician allows into the exam room, and it does not come
free with the next model release.

## Where this goes (vision)

Rural clinics, critical-access hospitals (about 1,350 in the US), and FQHCs first,
sold as per-clinician seats to the health systems that run them. The buyer's math:
earlier correct diagnoses, fewer two-hour referrals for cases the panel plus a
coverage check could resolve locally, and session documentation that lands in the
chart as FHIR. The engine is case-agnostic by design (changing the spoken words or
the seeded record changes the output), so expansion is configuration: urgent care,
locum and telehealth coverage, residency teaching rounds, clinician-scarce settings
worldwide.

---
*Truth gate: every build claim above is at "integrated" or better as of ~2:50pm;
the Stedi facts are the verified `uhc` scenario. Market figures: rural population
share (US Census, ~20%) and critical-access hospital count (~1,350) are public
figures, stated approximately. Nothing else is quantified on purpose.*
