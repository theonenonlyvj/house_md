import type { CaseFeatures, Persona, Seat, SeatingDecision } from '../shared/types';

// Guardrail #1 — seating is REAL, not scripted. Pure + deterministic: chart/presentation
// keywords → organ systems → required specialties, matched against whatever roster
// exists. A required specialty the roster can't fill renders EMPTY and the chair says
// so — whichever specialty that is. (The default demo roster covers its case fully.)

export const SYSTEM_KEYWORDS: Record<string, RegExp> = {
  pulmonary: /wheez|asthma|inhaler|albuterol|spirometry|infiltrate|shortness of breath|bronch/i,
  gi: /abdominal|stool|nausea|gerd|bowel|vomit|diarrhea/i,
  infectious: /fever|infect|parasit|eosinophil|refugee|endemic|larva|rash/i,
  cardiac: /echocardiogram|ventricular|troponin|nt-probnp|heart failure|ejection fraction/i,
  renal: /proteinuria|nephro|creatinine elevat|renal impair|kidney disease/i,
  neuro: /neuropathy|orthostatic|carpal tunnel|nerve conduction|seizure/i,
  endocrine: /thyroid|adrenal|uncontrolled diabet|hyperglyc/i,
  heme: /anemia|cytopenia|monoclonal|light.chain|paraprotein/i,
};

const SYSTEM_TO_SPECIALTY: Record<string, string> = {
  pulmonary: 'pulmonology',
  gi: 'gastroenterology',
  infectious: 'infectious-disease',
  cardiac: 'cardiology',
  renal: 'nephrology',
  neuro: 'neurology',
  endocrine: 'endocrinology',
  heme: 'hematology',
};

export function requiredSpecialties(features: CaseFeatures): { specialty: string; reason: string }[] {
  return features.organSystems
    .filter((sys) => SYSTEM_TO_SPECIALTY[sys])
    .map((sys) => ({
      specialty: SYSTEM_TO_SPECIALTY[sys],
      reason: `${sys} findings in the presentation/record`,
    }));
}

export function decideSeating(
  features: CaseFeatures,
  roster: Persona[],
  clinicianSpecialty: string,
  seatFullRoster = false
): SeatingDecision {
  const seats: Seat[] = [];

  for (const kind of ['chair', 'skeptic', 'reimbursement'] as const) {
    const p = roster.find((r) => r.kind === kind);
    if (p) {
      seats.push({
        specialty: p.specialty,
        status: 'seated',
        personaId: p.id,
        personaName: p.name,
        reasons: [
          kind === 'chair'
            ? 'moderates every council'
            : kind === 'skeptic'
              ? 'standing devil’s advocate'
              : 'coverage reality has a seat at the table',
        ],
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

  // Full-roster mode (demo panel): every roster specialist is named to the consult.
  // The case-driven engine and its empty-seat mechanism remain the default path.
  if (seatFullRoster) {
    const required = requiredSpecialties(features);
    for (const p of roster.filter((r) => r.kind === 'specialist')) {
      const req = required.find((r) => r.specialty === p.specialty);
      seats.push({
        specialty: p.specialty,
        status: 'seated',
        personaId: p.id,
        personaName: p.name,
        reasons: [req ? req.reason : 'named to this consult'],
      });
    }
    return { seats };
  }

  for (const req of requiredSpecialties(features)) {
    const p = roster.find((r) => r.kind === 'specialist' && r.specialty === req.specialty);
    if (p) {
      seats.push({ specialty: req.specialty, status: 'seated', personaId: p.id, personaName: p.name, reasons: [req.reason] });
    } else {
      seats.push({ specialty: req.specialty, status: 'empty', reasons: [req.reason] });
    }
  }

  return { seats };
}

export const emptySeats = (d: SeatingDecision): Seat[] => d.seats.filter((s) => s.status === 'empty');

export interface ChartResourceLite {
  resourceType: string;
  text: string;
}

// Deterministic: changing the record changes the features changes the seating.
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
