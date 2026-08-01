// Seed the synthetic Jane Doe case into hosted Medplum (PLAN-FINAL §4.1).
// Idempotent: conditional-create on identifier system https://housemd.example/seed.
// Run: PATH="/opt/homebrew/opt/node/bin:$PATH" node scripts/seed-jane-doe.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_SYS = 'https://housemd.example/seed';
const BASE = 'https://api.medplum.com';

const env = readFileSync(join(HERE, '..', '.env'), 'utf8');
const key = (n) => (env.match(new RegExp(`^${n}=(.*)$`, 'm')) || [])[1]?.trim() || '';

const tokRes = await fetch(`${BASE}/oauth2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=client_credentials&client_id=${encodeURIComponent(key('MEDPLUM_CLIENT_ID'))}&client_secret=${encodeURIComponent(key('MEDPLUM_CLIENT_SECRET'))}`,
});
if (!tokRes.ok) { console.error('auth failed', tokRes.status); process.exit(1); }
const { access_token } = await tokRes.json();

async function create(slug, resource) {
  resource.identifier = [...(resource.identifier || []), { system: SEED_SYS, value: slug }];
  const res = await fetch(`${BASE}/fhir/R4/${resource.resourceType}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/fhir+json',
      'If-None-Exist': `identifier=${SEED_SYS}|${slug}`,
    },
    body: JSON.stringify(resource),
  });
  if (!res.ok) { console.error('FAIL', slug, res.status, (await res.text()).slice(0, 200)); return null; }
  const r = await res.json();
  console.log(res.status === 201 ? 'created' : 'exists ', r.resourceType.padEnd(19), slug);
  return r;
}

const patient = await create('patient-jane-doe', {
  resourceType: 'Patient',
  active: true,
  name: [{ use: 'official', family: 'Doe', given: ['Jane'], text: 'Jane Doe (SYNTHETIC)' }],
  gender: 'female',
  birthDate: '1971-01-01',
});
if (!patient) process.exit(1);
const subject = { reference: `Patient/${patient.id}`, display: 'Jane Doe (SYNTHETIC)' };

const T = (text) => ({ text });
// Manifest resources (qualitative values only; ECG carries the RAW finding, never the inference)
const manifest = [
  ['proc-cts-left-2018', { resourceType: 'Procedure', status: 'completed', code: T('Left carpal tunnel release'), subject, performedDateTime: '2018-06-14' }],
  ['proc-cts-right-2020', { resourceType: 'Procedure', status: 'completed', code: T('Right carpal tunnel release'), subject, performedDateTime: '2020-09-22' }],
  ['cond-htn-2022', { resourceType: 'Condition', clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] }, code: T('Essential hypertension'), subject, recordedDate: '2022-01-10' }],
  ['obs-neuro-2024', { resourceType: 'Observation', status: 'final', code: T('Neurologic exam note'), valueString: 'Progressive distal sensory neuropathy, both feet; intermittent orthostatic dizziness', subject, effectiveDateTime: '2024-03-05' }],
  ['obs-renal-2025', { resourceType: 'Observation', status: 'final', code: T('Renal function assessment'), valueString: 'Persistent proteinuria on repeat urinalysis; mildly reduced estimated renal function', subject, effectiveDateTime: '2025-02-18' }],
  ['dr-echo-2026', { resourceType: 'DiagnosticReport', status: 'final', code: T('Transthoracic echocardiogram'), conclusion: 'Increased left-ventricular wall thickness; preserved ejection fraction; diastolic dysfunction', subject, effectiveDateTime: '2026-05-10' }],
  ['obs-ecg-2026', { resourceType: 'Observation', status: 'final', code: T('12-lead ECG'), valueString: 'Low-normal QRS voltage in limb leads; no acute changes', subject, effectiveDateTime: '2026-05-10' }],
  ['obs-biomarkers-2026', { resourceType: 'Observation', status: 'final', code: T('Cardiac biomarker trend'), valueString: 'NT-proBNP elevated with rising trend; troponin mildly and persistently elevated', subject, effectiveDateTime: '2026-06-15' }],
  ['obs-current-2026', { resourceType: 'Observation', status: 'final', code: T('Current symptoms'), valueString: 'Exertional dyspnea, bilateral lower-extremity edema, declining exercise tolerance', subject, effectiveDateTime: '2026-07-28' }],
  ['enc-current-2026', { resourceType: 'Encounter', status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' }, subject, period: { start: '2026-07-28' } }],
  ['med-lisinopril', { resourceType: 'MedicationStatement', status: 'active', medicationCodeableConcept: T('lisinopril'), subject }],
];

// Distractors — routine noise so retrieval does real work
const distractors = [];
for (let yr = 2019; yr <= 2026; yr++) {
  distractors.push([`obs-cbc-${yr}`, { resourceType: 'Observation', status: 'final', code: T('Complete blood count'), valueString: 'Within normal limits', subject, effectiveDateTime: `${yr}-04-15` }]);
  if (yr % 2 === 0) distractors.push([`obs-bmp-${yr}`, { resourceType: 'Observation', status: 'final', code: T('Basic metabolic panel'), valueString: 'Unremarkable', subject, effectiveDateTime: `${yr}-04-15` }]);
}
distractors.push(['obs-lipids-2024', { resourceType: 'Observation', status: 'final', code: T('Lipid panel'), valueString: 'Borderline LDL, otherwise unremarkable', subject, effectiveDateTime: '2024-04-15' }]);
distractors.push(['imm-flu-2025', { resourceType: 'Immunization', status: 'completed', vaccineCode: T('Seasonal influenza vaccine'), patient: subject, occurrenceDateTime: '2025-10-12' }]);
distractors.push(['enc-annual-2024', { resourceType: 'Encounter', status: 'finished', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' }, subject, period: { start: '2024-04-15' } }]);
distractors.push(['obs-tsh-2023', { resourceType: 'Observation', status: 'final', code: T('Thyroid function'), valueString: 'Within normal limits', subject, effectiveDateTime: '2023-08-02' }]);

const ids = { 'patient-jane-doe': { resourceType: 'Patient', id: patient.id } };
for (const [slug, res] of [...manifest, ...distractors]) {
  const r = await create(slug, res);
  if (r) ids[slug] = { resourceType: r.resourceType, id: r.id };
}
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', 'case-ids.json'), JSON.stringify(ids, null, 2));
console.log(`\nDONE — patient ${patient.id}; ${Object.keys(ids).length} resources; map → scripts/out/case-ids.json`);
