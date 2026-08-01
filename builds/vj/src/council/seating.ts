import type { CaseFeatures, Persona, Seat, SeatingDecision } from '../shared/types';

// Guardrail #1 — seating is REAL, not scripted. Pure + deterministic: case features →
// required specialties, matched against whatever roster exists. Whatever required seat
// can't be filled renders EMPTY and the chair says so — whichever specialty that is.

interface SpecialtyRule {
  specialty: string;
  when: (f: CaseFeatures) => boolean;
  reason: (f: CaseFeatures) => string;
}

export const SPECIALTY_RULES: SpecialtyRule[] = [
  {
    specialty: 'cardiology',
    when: (f) => f.organSystems.includes('cardiac'),
    reason: () => 'cardiac findings in presentation/record',
  },
  {
    specialty: 'nephrology',
    when: (f) => f.organSystems.includes('renal'),
    reason: () => 'renal findings (proteinuria / renal dysfunction)',
  },
  {
    specialty: 'neurology',
    when: (f) => f.organSystems.includes('neuro'),
    reason: () => 'neurologic findings across the record',
  },
  {
    specialty: 'endocrinology',
    when: (f) => f.organSystems.includes('endocrine'),
    reason: () => 'endocrine/metabolic findings',
  },
  {
    specialty: 'clinical-pharmacology',
    when: (f) => f.activeMeds.length > 0,
    reason: (f) => `active medications (${f.activeMeds.length}) may explain or confound findings`,
  },
  {
    // Multisystem pattern (>=3 organ systems) raises infiltrative/systemic processes —
    // those differentials need hematology input (e.g. plasma-cell dyscrasias).
    specialty: 'hematology',
    when: (f) => f.organSystems.length >= 3 || f.redFlags.includes('multisystem-pattern'),
    reason: (f) => `multisystem involvement (${f.organSystems.join(', ')}) — systemic/infiltrative processes need hematology input`,
  },
];

export function requiredSpecialties(features: CaseFeatures): { specialty: string; reason: string }[] {
  return SPECIALTY_RULES.filter((r) => r.when(features)).map((r) => ({
    specialty: r.specialty,
    reason: r.reason(features),
  }));
}

export function decideSeating(
  features: CaseFeatures,
  roster: Persona[],
  clinicianSpecialty: string
): SeatingDecision {
  const seats: Seat[] = [];

  // Structural seats: chair, skeptic, reimbursement — seated whenever the roster has them.
  for (const kind of ['chair', 'skeptic', 'reimbursement'] as const) {
    const p = roster.find((r) => r.kind === kind);
    if (p) {
      seats.push({
        specialty: p.specialty,
        status: 'seated',
        personaId: p.id,
        personaName: p.name,
        reasons: [kind === 'chair' ? 'moderates every council' : kind === 'skeptic' ? 'standing devil’s advocate' : 'coverage reality has a seat at the table'],
      });
    }
  }

  // The human clinician fills their own seat. Duplicate specialties are allowed.
  seats.push({
    specialty: clinicianSpecialty,
    status: 'human',
    personaName: 'You (managing clinician)',
    reasons: ['presenting and managing this case'],
  });

  // Case-driven specialist seats — required by features, filled from roster or EMPTY.
  for (const req of requiredSpecialties(features)) {
    const p = roster.find((r) => r.kind === 'specialist' && r.specialty === req.specialty);
    if (p) {
      seats.push({
        specialty: req.specialty,
        status: 'seated',
        personaId: p.id,
        personaName: p.name,
        reasons: [req.reason],
      });
    } else {
      seats.push({ specialty: req.specialty, status: 'empty', reasons: [req.reason] });
    }
  }

  return { seats };
}

export const emptySeats = (d: SeatingDecision): Seat[] => d.seats.filter((s) => s.status === 'empty');

// ---- Feature derivation: deterministic keyword mapping over the fetched chart. ----
// Changing the record changes the features changes the seating (PLAN-FINAL §7).

const SYSTEM_KEYWORDS: Record<string, RegExp> = {
  cardiac: /dyspnea|edema|ventricular|wall thickness|ejection fraction|echocardiogram|ecg|troponin|nt-probnp|cardiac|heart/i,
  renal: /proteinuria|renal|creatinine|kidney|nephro/i,
  neuro: /neuropathy|orthostatic|carpal tunnel|sensory|nerve|dizz/i,
  endocrine: /thyroid|a1c|diabet|hormon|adrenal/i,
  heme: /anemia|monoclonal|light.chain|paraprotein|cytopenia/i,
};

export interface ChartResourceLite {
  resourceType: string;
  text: string; // concatenated display/code text of the resource
}

export function deriveFeatures(
  resources: ChartResourceLite[],
  patient: { age: number; sex: 'male' | 'female' | 'other' },
  chiefComplaint: string
): CaseFeatures {
  const corpus = resources.map((r) => `${r.resourceType} ${r.text}`).join('\n') + '\n' + chiefComplaint;
  const organSystems = Object.entries(SYSTEM_KEYWORDS)
    .filter(([, re]) => re.test(corpus))
    .map(([sys]) => sys);
  const activeMeds = resources
    .filter((r) => r.resourceType === 'MedicationRequest' || r.resourceType === 'MedicationStatement')
    .map((r) => r.text.trim())
    .filter(Boolean);
  const redFlags: string[] = [];
  if (organSystems.length >= 3) redFlags.push('multisystem-pattern');
  return { age: patient.age, sex: patient.sex, chiefComplaint, organSystems, activeMeds, redFlags };
}
