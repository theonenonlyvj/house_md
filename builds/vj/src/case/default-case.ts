// The engine is case-agnostic; THIS FILE is the pluggable input.
// Active demo: "The Medicine Is the Poison" (docs/DEMO_SPEC.md) — Tuan Pham,
// seeded by scripts/seed-tuan-pham.mjs.

export interface CaseConfig {
  id: string;
  title: string;
  patientLocator: {
    patientId?: string;
    identifier?: { system: string; value: string };
    nameFallback?: { family: string; given: string };
  };
  chiefComplaint: string;
  presentation: string;
  clinicianSpecialty: string;
  clinicianName: string;
  // Demo panel mode: seat the entire roster (the DEMO_SPEC cast) instead of
  // deriving seats from case features.
  seatFullRoster?: boolean;
  stediScenario: string;
  payerLabel: string;
}

export const DEFAULT_CASE: CaseConfig = {
  id: 'tuan-pham',
  title: 'The Medicine Is the Poison (synthetic)',
  patientLocator: {
    identifier: { system: 'https://housemd.example/seed', value: 'patient-tuan-pham' },
    nameFallback: { family: 'Pham', given: 'Tuan' },
  },
  chiefComplaint:
    'worsening shortness of breath despite steroids; new abdominal pain, nausea, loose stools, low-grade fever',
  // Dr. Lee's cue card (DEMO_SPEC §5) — she paraphrases live; this is the prerecorded
  // fallback text. "Can you take a look?" is the handoff cue to the chair.
  presentation:
    "This is my patient Mr. Pham, he's 62. I diagnosed him with asthma last year and started steroids two weeks ago, but he keeps getting worse — and now he has stomach pain and a fever too. I'm debating two things: do I increase the steroids, or is there something else going on that I'm missing? Can you take a look?",
  clinicianSpecialty: 'primary-care',
  clinicianName: 'Dr. Lee',
  seatFullRoster: true,
  stediScenario: 'uhc',
  payerLabel: 'Commercial PPO (Stedi test mode)',
};
