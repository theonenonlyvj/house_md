# house_md — two-minute video brief

Status: production constraint. Write the final screenplay only after clinically
reviewing the locked patient and insurance profile in [`PLAN.md`](./PLAN.md).

## Hard limit

The submitted video is no longer than two minutes. Target 100–110 seconds of planned
content and retain the remaining time as editing margin.

## Required visible proof

The final video must show, not merely describe:

1. a synthetic patient record loaded from Medplum;
2. clinician audio processed by Deepgram;
3. a Moss evidence search returning Medplum-backed citations;
4. a differential that changes in response to the retrieved evidence;
5. a live Stedi test-mode response projected into the workup;
6. explicit clinician confirmation;
7. the resulting `ClinicalImpression` and proposed `ServiceRequest` resources in
   Medplum.

## Authenticity rules

- Use the working application.
- Use live Medplum, Moss, and Stedi test-mode calls during recording.
- Pass live or prerecorded clinician audio through Deepgram.
- Do not inject a stored transcript.
- Do not populate the differential, workup, benefits, or write-back from a video-only
  fixture.
- Cuts may remove waiting time but must not imply an operation occurred when it did not.
- Label every patient and payer identity as synthetic/test data.

## Video structure

The eventual screenplay should use only these beats:

- problem and patient context;
- one spoken clinician turn;
- one evidence-driven differential change;
- one selected workup;
- one insurance reveal;
- one clinician confirmation and FHIR result;
- one closing sentence.

Do not include architecture explanation, setup, login, patient selection, multiple
cases, error handling, or raw provider payload walkthroughs in the main two-minute cut.
Capture those separately for backup or judge questions.

## Completion gate

Do not write or record the final screenplay until:

- the patient and insurance pairing is selected;
- the case is clinically reviewed;
- the full application flow succeeds end to end;
- every visible citation resolves to Medplum;
- the Stedi interpretation has been checked against the current response;
- the write-back resources have been inspected in Medplum.
