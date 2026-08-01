# house_md — Google Form submission text

## Project blurb (~100 words)

house_md seats a council of AI specialists around a doctor's hardest case. The
clinician presents by voice; a unit-tested seating function fills the chairs from the
chart, and a specialty it can't seat renders as an empty chair the chair announces
out loud. The specialists argue the differential in their own voices, and every
patient-specific claim either cites a resolvable FHIR resource or is demoted to
labeled conjecture, in code. A reimbursement seat speaks live test-mode eligibility
before options are discussed, re-sequencing the plan around a referral gate. On
confirmation, the session writes a ClinicalImpression and draft ServiceRequests back
to the chart. Built as augmentation for clinicians practicing hours from the nearest
specialist. The council argues; the doctor decides.

## Team credit (one line)

Built in one day by Vijay Ram, Thai Nguyen, Noah Landesberg, and Felix Wotschofsky.

## Sponsor usage (one sentence)

Medplum holds and receives the FHIR record, Deepgram runs the voice council, Moss
retrieves the evidence that moves the differential, and Stedi answers eligibility
live in test mode — removing any one of the four deletes a visible demo beat.
