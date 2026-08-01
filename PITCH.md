# PITCH — skeleton for the humans to edit

## One-liner

Every doctor gets told to trust their gut. house_md gives them a council instead — AI
specialists who argue the diagnosis out loud from the patient's actual chart, with
insurance reality sitting at the table.

## 60-second pitch (spoken)

Diagnosis is a team sport, but most doctors don't have the team. house_md is a case
conference on demand: present a hard case by voice, click "Assemble council," and a
chaired panel of specialist AI personas argues the differential — out loud, in
different voices — citing the patient's real FHIR record for every claim. Claims
without a citation get stamped CONJECTURE, by code, not by prompt. If the case needs
a specialty the council doesn't have, that chair sits visibly empty and the chair
says so — we demo the gap instead of faking the expert.

Then the part every other DDx demo skips: the reimbursement seat speaks. One live
Stedi eligibility check, and the plan visibly re-sequences around what the patient's
insurance actually requires — labs now, the specialist consult behind the referral it
needs, real copay attached. A diagnosis without a feasible plan is a term paper.

The doctor decides everything. One click and the whole argument becomes chart
documentation in Medplum — the considered differential, the confirmed plan, and a
plain-language version for talking to the patient.

Built today: Medplum in and out, Deepgram's managed voice agent as the council's
brain and voices, Moss semantic retrieval over the longitudinal record, Stedi test
mode. All live — change the words or the chart and the debate changes.

## Submission-form blurb (~80 words)

house_md is a clinician-facing case conference: a council of AI specialist personas
argues a differential out loud from the patient's real Medplum record (every claim
cited or auto-demoted to conjecture), flags missing expertise with a visibly empty
seat, checks the patient's coverage live via Stedi, re-sequences the plan around
referral requirements and real copays, and — on the clinician's explicit
confirmation — writes ClinicalImpression + draft ServiceRequests back to Medplum
with a plain-language patient version. Deepgram powers voice + reasoning; Moss
powers retrieval. Decision support, not diagnosis.

## Judge Q&A ammo

- "Is the AI diagnosing?" — No. It argues; the clinician selects, confirms, and owns
  every write. Requests stay draft/proposal.
- "Is the debate scripted?" — Live, every run. One managed model role-plays all seven
  seats in structured output; seating, citation validation, and coverage facts are
  deterministic code. Run-to-run variance is visible.
- "Why should we believe the citations?" — Click any claim: it opens the actual FHIR
  resource. Uncited claims are labeled conjecture on screen.
- "What about cost?" — We only display facts the current 271 returned, per line item,
  labeled as estimates. No invented prices, ever.
- Team: Vijay, Thai, Noah, Felix. One day. Public repo.
