#!/usr/bin/env node
import { medplumToken, upsertByIdentifier } from './lib.mjs';

const SYSTEM = 'https://house-md.demo/seed';
const token = await medplumToken();
const patientIdentifier = { system: 'https://house-md.demo/patient', value: 'jane-doe-synthetic' };
const patient = await upsertByIdentifier(token, {
  resourceType: 'Patient',
  identifier: [patientIdentifier],
  active: true,
  name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
  gender: 'female',
  birthDate: '1971-01-01',
  extension: [{ url: 'https://house-md.demo/fhir/StructureDefinition/synthetic-data', valueBoolean: true }],
}, patientIdentifier);

const subject = { reference: `Patient/${patient.id}` };
const identifier = (value) => [{ system: SYSTEM, value }];
const procedure = (id, date, text) => ({ resourceType: 'Procedure', identifier: identifier(id), status: 'completed', subject, code: { text }, performedDateTime: date, note: [{ text: 'Synthetic demo record. Terminology coding requires clinical review.' }] });
const observation = (id, date, codeText, valueText) => ({ resourceType: 'Observation', identifier: identifier(id), status: 'final', subject, code: { text: codeText }, effectiveDateTime: date, valueCodeableConcept: { text: valueText }, note: [{ text: 'Synthetic qualitative finding. Terminology coding requires clinical review.' }] });

const clinical = [
  procedure('left-carpal-release', '2018-04-12', 'Left carpal-tunnel release'),
  procedure('right-carpal-release', '2020-09-03', 'Right carpal-tunnel release'),
  { resourceType: 'Condition', identifier: identifier('essential-hypertension'), clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] }, subject, code: { text: 'Essential hypertension' }, recordedDate: '2022-06-20', note: [{ text: 'Synthetic demo record. Diagnostic terminology code intentionally omitted pending review.' }] },
  observation('neurologic-pattern', '2024-08-18', 'Neurologic symptom pattern', 'Distal sensory neuropathy with orthostatic dizziness'),
  observation('renal-pattern', '2025-11-08', 'Renal finding pattern', 'Persistent proteinuria with mildly reduced renal function'),
  { resourceType: 'DiagnosticReport', identifier: identifier('echo-2026-05'), status: 'final', subject, code: { text: 'Transthoracic echocardiogram report' }, effectiveDateTime: '2026-05-14', conclusion: 'Increased left ventricular wall thickness with preserved ejection fraction and diastolic dysfunction.', presentedForm: [], extension: [{ url: 'https://house-md.demo/fhir/StructureDefinition/code-review-required', valueBoolean: true }] },
  observation('ecg-voltage', '2026-05-16', 'Electrocardiogram finding', 'Low-to-normal QRS voltage in limb leads'),
  observation('cardiac-biomarker-trend', '2026-06-10', 'Cardiac biomarker trend', 'Elevated NT-proBNP with a rising troponin trend'),
  observation('active-dyspnea', '2026-08-01', 'Current symptom', 'Progressive exertional dyspnea with worsening exercise tolerance'),
  observation('active-edema', '2026-08-01', 'Current symptom', 'Bilateral leg edema'),
];

const distractorFacts = [
  ['routine-vision-2019', '2019-02-11', 'Routine vision visit', 'No new concern recorded'],
  ['influenza-2019', '2019-10-09', 'Seasonal vaccination history', 'Routine preventive care documented'],
  ['minor-sprain-2020', '2020-01-22', 'Minor ankle sprain follow-up', 'Symptoms resolved'],
  ['dental-2020', '2020-07-18', 'Routine dental history', 'Preventive visit documented'],
  ['sleep-2021', '2021-03-12', 'Sleep review', 'Occasional difficulty initiating sleep'],
  ['skin-2021', '2021-06-20', 'Dermatology review', 'Benign-appearing lesion monitored'],
  ['preventive-2021', '2021-12-03', 'Preventive care review', 'Routine health maintenance documented'],
  ['headache-2022', '2022-02-14', 'Self-limited headache', 'Resolved without recurrence'],
  ['allergy-2022', '2022-04-30', 'Seasonal allergy symptoms', 'Intermittent nasal symptoms'],
  ['travel-2022', '2022-09-08', 'Travel counseling', 'Routine counseling documented'],
  ['hearing-2023', '2023-01-19', 'Hearing screen', 'No functional concern recorded'],
  ['vaccination-2023', '2023-05-26', 'Vaccination review', 'Preventive record updated'],
  ['nutrition-2023', '2023-08-07', 'Nutrition counseling', 'General balanced-diet counseling'],
  ['eye-2023', '2023-11-04', 'Routine eye examination', 'No acute finding recorded'],
  ['uri-2024', '2024-01-12', 'Upper respiratory symptoms', 'Self-limited symptoms resolved'],
  ['muscle-2024', '2024-04-18', 'Transient muscle soreness', 'Resolved with conservative care'],
  ['preventive-2024', '2024-10-02', 'Preventive visit', 'Routine screening reviewed'],
  ['sleep-2025', '2025-01-16', 'Sleep hygiene review', 'General counseling documented'],
  ['vaccination-2025', '2025-04-29', 'Vaccination status', 'Routine review completed'],
  ['minor-cut-2025', '2025-08-15', 'Minor skin injury', 'Healed without complication'],
].map(([id, date, codeText, valueText]) => observation(id, date, codeText, valueText));

for (const resource of [...clinical, ...distractorFacts]) {
  const stable = resource.identifier[0];
  await upsertByIdentifier(token, resource, stable);
  process.stdout.write('.');
}
process.stdout.write('\n');
console.log(`Seeded/updated synthetic Patient/${patient.id} plus ${clinical.length + distractorFacts.length} longitudinal resources.`);
console.log('Rebuilding Moss from freshly-read Medplum resources…');
const { indexJaneDoe } = await import('./index-moss.mjs');
await indexJaneDoe();
