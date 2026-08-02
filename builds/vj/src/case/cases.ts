// The engine is case-agnostic; THIS FILE is the pluggable input.
//
// One entry per seeded patient. The chart CONTENT lives in scripts/cases/<id>.mjs
// and is seeded into Medplum; this registry is only what the app needs to find that
// patient and frame the consult. The join key between the two is the seed slug.
//
// Adding a case is two files and no code: write scripts/cases/<id>.mjs, run
// `node scripts/seed-case.mjs <id>`, and add an entry here.

export interface CaseConfig {
  id: string;
  title: string;
  /** One line for the provider app's patient list — why this chart is open today. */
  reasonForVisit: string;
  patientLocator: {
    patientId?: string;
    identifier?: { system: string; value: string };
    nameFallback?: { family: string; given: string };
  };
  chiefComplaint: string;
  /** The clinician's cue card. Spoken live; this is the fallback text, never injected. */
  presentation: string;
  clinicianSpecialty: string;
  clinicianName: string;
  /** Key into the Stedi sandbox scenario table (src/server-lib/stedi.ts). */
  stediScenario: string;
  payerLabel: string;
}

const SEED_SYSTEM = 'https://housemd.example/seed';

export const CASES: CaseConfig[] = [
  {
    id: 'tuan-pham',
    title: 'The Medicine Is the Poison (synthetic)',
    reasonForVisit: 'Worsening despite steroids; new abdominal symptoms and fever',
    patientLocator: {
      identifier: { system: SEED_SYSTEM, value: 'patient-tuan-pham' },
      nameFallback: { family: 'Pham', given: 'Tuan' },
    },
    chiefComplaint:
      'worsening shortness of breath despite steroids; new abdominal pain, nausea, loose stools, low-grade fever',
    presentation:
      "This is my patient Mr. Pham, he's 62. I diagnosed him with asthma last year and started steroids two weeks ago, but he keeps getting worse — and now he has stomach pain and a fever too. I'm debating two things: do I increase the steroids, or is there something else going on that I'm missing? Can you take a look?",
    clinicianSpecialty: 'primary-care',
    clinicianName: 'Dr. Lee',
    stediScenario: 'uhc',
    payerLabel: 'Commercial PPO (Stedi test mode)',
  },
  {
    id: 'marguerite-adeyemi',
    title: 'The Hands Told You First (synthetic)',
    reasonForVisit: 'Near-syncope and hypotension after beta blocker uptitration',
    patientLocator: {
      identifier: { system: SEED_SYSTEM, value: 'patient-marguerite-adeyemi' },
      nameFallback: { family: 'Adeyemi', given: 'Marguerite' },
    },
    chiefComplaint:
      'near-syncope on standing and worsening fatigue since the beta blocker was increased; thickening heart walls with falling blood pressure',
    presentation:
      "This is Mrs. Adeyemi, she's 71. I've been treating her for hypertensive heart failure for about six years. I increased her beta blocker three weeks ago and she's gotten worse, not better — she nearly passed out standing up and her pressure was 84 in the ED. Do I back off the beta blocker and keep managing this as heart failure, or is her heart thick for a reason I haven't looked for? Can you take a look?",
    clinicianSpecialty: 'primary-care',
    clinicianName: 'Dr. Lee',
    stediScenario: 'uhc',
    payerLabel: 'Commercial PPO (Stedi test mode)',
  },
  {
    id: 'priya-raghunathan',
    title: 'Nobody Ever Grew A Culture (synthetic)',
    reasonForVisit: 'Seven weeks of daily fever; three antibiotic courses, no response',
    patientLocator: {
      identifier: { system: SEED_SYSTEM, value: 'patient-priya-raghunathan' },
      nameFallback: { family: 'Raghunathan', given: 'Priya' },
    },
    chiefComplaint:
      'seven weeks of daily spiking fever with joint pain and rash; every culture and serology negative; platelets now falling and liver enzymes rising',
    presentation:
      "This is Priya Raghunathan, she's 34. She's had a fever every single day for seven weeks. I've given her three courses of antibiotics and she's had a full inpatient workup — cultures, serologies, CT, echo — and everything came back negative. Now her platelets are dropping and her liver enzymes are climbing. Do I give her another antibiotic course, or am I chasing the wrong thing entirely? Can you take a look?",
    clinicianSpecialty: 'primary-care',
    clinicianName: 'Dr. Lee',
    stediScenario: 'uhc',
    payerLabel: 'Commercial PPO (Stedi test mode)',
  },
];

export const caseById = (id: string): CaseConfig | undefined => CASES.find((c) => c.id === id);

/** The case the app opens on when nothing else is selected. */
export const DEFAULT_CASE_ID = 'tuan-pham';
