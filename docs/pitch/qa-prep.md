# house_md — judge Q&A prep (the six probes)

Live round, if reached. Answers are ~20 seconds spoken. The vocabulary for probe 4 is
the repo's own truth table: designed / verified standalone / integrated / demo-ready.

## 1. "Isn't this AI diagnosing?"

No order leaves the room without the clinician. That's enforced in the product, not
the pitch: write-back happens only on explicit confirmation, orders are draft
ServiceRequests, the differential is decision support, and the chair challenges
uncited claims on the record. The council argues; the doctor decides. We built the
guardrails as code and put them on screen.

## 2. "Five teams did DDx today."

They built the patient's side: intake bots and symptom checkers. We built the
clinician's instrument, and three things in it you didn't see elsewhere today:
seating computed from the chart with an honest empty chair, citations validated in
code after every model turn, and coverage checked live before options were discussed.
Ask any DDx demo whether you can click its evidence and open the record behind it.

## 3. "Why would a doctor trust this?"

Because it shows its work and admits ignorance. Every patient-specific claim opens a
real FHIR resource or the board demotes it to labeled conjecture. When the case needed
a specialty we couldn't seat, the chair said so out loud instead of faking expertise.
Clinicians extend trust to colleagues who cite evidence and say "I don't know."
We built both behaviors in, and made them visible.

## 4. "What's real vs canned?" — answer proudly

We keep a public truth table in the repo with four levels: designed, verified
standalone, integrated, demo-ready — and the README says do not infer completion from
documentation. In the session you watched, Deepgram, Medplum, Moss, and Stedi were
all called live. The transcript, debate, differential, benefits, and write-back were
generated in-session; there is no fixture behind any visible result, and a failed
provider call fails on screen with a retry. Two honest disclosures: the clinician
audio was prerecorded and played through the live pipeline (our one sanctioned input
fallback), and the patient is synthetic by design. Change the spoken words or the
record and the output changes. We would rather show you the truth table than a magic
trick.

## 5. "Business model?"

Per-clinician seats, sold to rural health systems, critical-access hospitals — about
1,350 of them in the US — and FQHCs. Rural generalists carry specialist-grade
diagnostic load with the least backup, so that's the wedge. The buyer's math: earlier
correct diagnoses, fewer two-hour referrals for cases the panel plus a coverage check
resolves locally, and documentation that lands in the chart as FHIR instead of an
extra hour of typing. Voice-first means near-zero workflow change, which is where
clinical software usually dies.

## 6. "What's next after today?"

Three concrete steps. One: human-verify the browser mic path; today's input ran the
sanctioned prerecorded route through the live pipeline. Two: run a second case config
end to end; the engine is case-agnostic by design and we want that proven in
practice, not asserted. Three: put it in front of a rural clinician and watch. That
design partner is the empty chair we most want to fill.

---
*Delivery: probe 4 is the one to want. Slow down, name the four levels, smile.*
