// The engine is case-agnostic; THIS FILE is the pluggable input (PLAN-FINAL §4).
// >>> NOAH: your seeded patient plugs in here — fill `patientLocator` (and anything
// else marked FILL) once your seed lands. Nothing outside this file changes. <<<

export interface CaseConfig {
  id: string;
  title: string;
  // How the app finds the patient in hosted Medplum. Use EITHER a direct id or an
  // identifier search (system+value). FILL from Noah's seed output.
  patientLocator: {
    patientId?: string; // e.g. '0198...'  (FILL when known)
    identifier?: { system: string; value: string };
    nameFallback?: { family: string; given: string }; // last-resort search
  };
  // Presenter-facing default presentation (also the prerecorded-audio script).
  chiefComplaint: string;
  presentation: string;
  // The human at the table (Vijay may respecify).
  clinicianSpecialty: string;
  // Demo panel mode: seat the entire roster (the DEMO_SPEC cast) instead of
  // deriving seats from case features.
  seatFullRoster?: boolean;
  // Stedi test-mode scenario key from stedi-poc/scenarios.mjs.
  stediScenario: string;
  payerLabel: string;
}

export const DEFAULT_CASE: CaseConfig = {
  id: 'default',
  title: 'Complicated multisystem presentation (synthetic)',
  patientLocator: {
    // FILL: patientId from Noah's seed. Fallbacks below let the app find a
    // "Jane Doe"-style synthetic patient in the meantime.
    identifier: { system: 'https://housemd.example/seed', value: 'patient-jane-doe' },
    nameFallback: { family: 'Doe', given: 'Jane' },
  },
  chiefComplaint: 'progressive exertional dyspnea and bilateral leg swelling',
  presentation:
    'Jane is a 55-year-old woman with progressive exertional dyspnea, bilateral leg edema, preserved ejection fraction, and increased ventricular wall thickness that seems disproportionate to her hypertension. What are we missing?',
  clinicianSpecialty: 'internal-medicine',
  seatFullRoster: true,
  stediScenario: 'uhc',
  payerLabel: 'UnitedHealthcare (Stedi test mode)',
};
