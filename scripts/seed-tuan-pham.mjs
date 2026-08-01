#!/usr/bin/env node
// Seeds the "Medicine Is the Poison" demo patient (Tuan Pham) per docs/DEMO_SPEC.md §3.
// Idempotent: every resource carries a stable identifier under SYSTEM; reruns upsert in place.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { medplumToken, upsertByIdentifier, ROOT } from './lib.mjs';

const SYSTEM = 'https://housemd.example/seed';
const SYNTHETIC_NOTE = 'Synthetic demo record. Terminology coding intentionally omitted (text-only) pending clinical review.';

// --- Relative dates (DEMO_SPEC §9: demo dates are relative; never goes stale) ---
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };
const TODAY = daysAgo(0);
const PREDNISONE_START = daysAgo(16); // the loaded gun
const ED_VISIT = daysAgo(1);
const ADMIT_CBC = daysAgo(3);

const token = await medplumToken();
const ids = {}; // slug -> ResourceType/id
async function seed(slug, resource) {
  const identifier = { system: SYSTEM, value: slug };
  const saved = await upsertByIdentifier(token, { ...resource, identifier: [identifier] }, identifier);
  ids[slug] = `${saved.resourceType}/${saved.id}`;
  process.stdout.write('.');
  return saved;
}

// --- Patient ---
const patient = await seed('patient-tuan-pham', {
  resourceType: 'Patient',
  active: true,
  name: [{ use: 'official', family: 'Pham', given: ['Tuan'] }],
  gender: 'male',
  birthDate: '1964-03-14',
  address: [{ use: 'home', city: 'Berkeley', state: 'CA', country: 'US' }],
  communication: [
    { language: { text: 'English' }, preferred: true },
    { language: { text: 'Vietnamese' } },
  ],
  contact: [{
    relationship: [{ text: 'Daughter (emergency contact)' }],
    name: { family: 'Pham', given: ['Linh'] },
  }],
  extension: [{ url: 'https://housemd.example/fhir/StructureDefinition/synthetic-data', valueBoolean: true }],
});
const subject = { reference: `Patient/${patient.id}`, display: 'Tuan Pham' };

// --- Builders (text-only CodeableConcepts; NO invented SNOMED/LOINC codes) ---
const category = (code) => [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code }] }];
const obs = (slug, date, cat, codeText, valueText, extra = {}) => seed(slug, {
  resourceType: 'Observation', status: 'final', subject,
  category: category(cat), code: { text: codeText },
  effectiveDateTime: date, valueString: valueText,
  note: [{ text: SYNTHETIC_NOTE }], ...extra,
});
const condition = (slug, onset, codeText, noteText) => seed(slug, {
  resourceType: 'Condition', subject,
  clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
  verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }] },
  code: { text: codeText }, onsetDateTime: onset, note: [{ text: noteText }],
});
const medication = (slug, authoredOn, medText, dosageText, noteText) => seed(slug, {
  resourceType: 'MedicationRequest', status: 'active', intent: 'order', subject,
  medicationCodeableConcept: { text: medText }, authoredOn,
  dosageInstruction: [{ text: dosageText }],
  ...(noteText ? { note: [{ text: noteText }] } : {}),
});
const encounter = (slug, classCode, start, typeText, reasonText, end = start) => seed(slug, {
  resourceType: 'Encounter', status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: classCode },
  type: [{ text: typeText }], subject,
  period: { start, end }, reasonCode: [{ text: reasonText }],
});

// --- Social history (CLUE #1 buried in the 2016 intake) ---
await obs('clue1-intake-social-history-2016', '2016-04-11', 'social-history', 'Social history — new-patient intake',
  'New-patient intake: Born in rural Tây Ninh province, Vietnam. Worked in family rice paddies as a child. Immigrated to the US in 1984 via refugee camp in Thailand.');
await obs('social-occupation-tobacco', '2016-04-11', 'social-history', 'Occupation and tobacco history',
  'Occupation: retired machinist. Tobacco: former smoker, quit 2005, ~20 pack-years. Alcohol: rare/social.');

// --- Conditions (problem list) ---
await condition('condition-t2dm', '2015', 'Type 2 diabetes mellitus', 'Well controlled, latest A1c 6.9.');
await condition('condition-hypertension', '2012', 'Hypertension', 'Controlled on lisinopril.');
await condition('condition-gerd', '2018', 'GERD', 'On omeprazole.');
await condition('condition-asthma-adult-onset', '2024', 'Asthma, adult-onset',
  'No childhood history. Diagnosed clinically. Never confirmed by spirometry.');

// --- Medications ---
await medication('med-metformin', '2015', 'Metformin 1000 mg oral tablet', 'Metformin 1000 mg PO BID');
await medication('med-lisinopril', '2012', 'Lisinopril 20 mg oral tablet', 'Lisinopril 20 mg PO daily');
await medication('med-omeprazole', '2018', 'Omeprazole 20 mg oral capsule', 'Omeprazole 20 mg PO daily');
await medication('med-albuterol', '2024', 'Albuterol HFA inhaler', 'Albuterol HFA inhaler, 2 puffs PRN wheezing');
await medication('med-prednisone', PREDNISONE_START, 'Prednisone 40 mg oral tablet', 'Prednisone 40 mg PO daily',
  'for asthma exacerbation, taper planned');

// --- CBCs carrying the plot ---
await obs('clue2-cbc-2019-03-08', '2019-03-08', 'laboratory', 'CBC with differential',
  'Eosinophils 14% (absolute 1,100/µL) — flagged HIGH. No follow-up documented.',
  { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: 'H' }], text: 'HIGH' }] });
await obs('cbc-2022-06-14', '2022-06-14', 'laboratory', 'CBC with differential',
  'Eosinophils 6% — mildly elevated, not flagged');
await obs('cbc-admission', ADMIT_CBC, 'laboratory', 'CBC with differential', 'Eosinophils 0%');

// --- Boring distractor labs 2016–2025 ---
const distractorLabs = [
  ['lab-cmp-2016', '2016-09-20', 'Comprehensive metabolic panel', 'Unremarkable.'],
  ['lab-a1c-2017', '2017-09-18', 'Hemoglobin A1c', 'A1c 7.1 — well controlled.'],
  ['lab-lipids-2018', '2018-09-24', 'Lipid panel', 'Unremarkable.'],
  ['lab-cmp-2019', '2019-09-16', 'Comprehensive metabolic panel', 'Unremarkable.'],
  ['lab-a1c-2020', '2020-10-05', 'Hemoglobin A1c', 'A1c 7.0 — well controlled.'],
  ['lab-lipids-2021', '2021-09-13', 'Lipid panel', 'Unremarkable.'],
  ['lab-cmp-2023', '2023-09-11', 'Comprehensive metabolic panel', 'Unremarkable.'],
  ['lab-a1c-2025', '2025-03-10', 'Hemoglobin A1c', 'A1c 6.9 — well controlled.'],
];
for (const [slug, date, codeText, valueText] of distractorLabs) await obs(slug, date, 'laboratory', codeText, valueText);

// --- Encounters: thin annual PCP visits + the 2024 asthma visit ---
await encounter('encounter-annual-2017', 'AMB', '2017-05-02', 'Annual PCP visit', 'Routine annual visit. No new concerns.');
await encounter('encounter-annual-2021', 'AMB', '2021-06-15', 'Annual PCP visit', 'Routine annual visit. Chronic conditions stable.');
await encounter('encounter-annual-2023', 'AMB', '2023-09-11', 'Annual PCP visit', 'Routine annual visit. Medications refilled.');
await encounter('encounter-asthma-2024', 'AMB', '2024-03-05', 'PCP visit — new respiratory complaint',
  'Wheezing, dyspnea on exertion. Trial albuterol. Refer to pulmonology for spirometry.');

// --- The missed referral (PULMO cites this) ---
await seed('referral-pulmonology-2024', {
  resourceType: 'ServiceRequest', status: 'revoked', intent: 'order', subject,
  code: { text: 'Pulmonology referral — spirometry' }, authoredOn: '2024-03-05',
  note: [{ text: 'Patient no-showed. Spirometry never performed.' }],
});

// --- PCP note 16 days ago: the prednisone start ---
await obs('pcp-note-prednisone-start', PREDNISONE_START, 'exam', 'PCP progress note',
  'Asthma worse. Start prednisone 40 mg daily burst with taper.');

// --- Current ED encounter (yesterday) + its findings ---
const ed = await encounter('encounter-ed-current', 'EMER', ED_VISIT, 'Emergency department visit',
  'Chief complaint: worsening shortness of breath, new diffuse abdominal pain, nausea, 2 days loose stools, fever 100.8°F');
const edRef = { reference: `Encounter/${ed.id}` };
await seed('dx-chest-xray-ed', {
  resourceType: 'DiagnosticReport', status: 'final', subject, encounter: edRef,
  code: { text: 'Chest X-ray' }, effectiveDateTime: ED_VISIT,
  conclusion: 'Patchy bilateral infiltrates.',
});
await obs('clue3-ed-nursing-note', ED_VISIT, 'exam', 'ED nursing note',
  'Wife reports faint red streaks on his lower back overnight, resolved by morning.', { encounter: edRef });

// --- Coverage (the Stedi beat; member id = Stedi uhc sandbox scenario) ---
await seed('coverage-uhc-ppo', {
  resourceType: 'Coverage', status: 'active',
  type: { text: 'Commercial PPO' },
  subscriberId: 'UHC123456',
  beneficiary: { reference: `Patient/${patient.id}` },
  payor: [{ display: 'UNITEDHEALTHCARE' }],
  class: [{
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'plan' }], text: 'plan' },
    value: 'Commercial PPO',
    name: 'Individual deductible $4,000; ~$3,400 remaining this plan year',
  }],
});

process.stdout.write('\n');
const outDir = resolve(ROOT, 'scripts/out');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'tuan-pham-ids.json'), `${JSON.stringify(ids, null, 2)}\n`);
console.log(`Seeded/updated synthetic ${ids['patient-tuan-pham']} plus ${Object.keys(ids).length - 1} chart resources.`);
console.log(`Dates: prednisone start ${PREDNISONE_START}, admission CBC ${ADMIT_CBC}, ED visit ${ED_VISIT} (today ${TODAY}).`);
console.log('ID map written to scripts/out/tuan-pham-ids.json');
