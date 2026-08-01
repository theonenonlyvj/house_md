import { PERSONAS } from '@/config/case';
import type { CaseFeatures, Persona, Seat, Specialty } from '@/domain/types';

type SpecialtyRule = {
  specialty: Specialty;
  reason: string;
  terms: RegExp;
};

const SPECIALTY_RULES: SpecialtyRule[] = [
  {
    specialty: 'cardiology',
    reason: 'Cardiac structure, function, or congestion features are present.',
    terms: /dyspnea|edema|ejection fraction|ventric|cardiac|troponin|nt-probnp|cardiomyopathy|ecg|echo/i,
  },
  {
    specialty: 'hematology',
    reason: 'A multisystem infiltrative pattern requires evaluation for a monoclonal process.',
    terms: /proteinuria|neuropathy|carpal tunnel|infiltrative|amyloid|light chain|immunofixation/i,
  },
  {
    specialty: 'neurology',
    reason: 'Peripheral or autonomic neurologic features are present.',
    terms: /neuropathy|sensory|orthostatic|carpal tunnel|dizziness/i,
  },
  {
    specialty: 'nephrology',
    reason: 'Renal involvement or persistent protein loss is present.',
    terms: /proteinuria|renal|kidney|creatinine|egfr/i,
  },
];

export function requiredSpecialties(features: CaseFeatures): Array<{ specialty: Specialty; reason: string }> {
  const corpus = [features.chiefComplaint, features.presentation, ...features.organSystems, ...features.medications, ...features.recordText].join(' ');
  return SPECIALTY_RULES.filter((rule) => rule.terms.test(corpus)).map(({ specialty, reason }) => ({ specialty, reason }));
}

export function seatCouncil(
  features: CaseFeatures,
  roster: Persona[] = PERSONAS,
  managingSpecialty: Specialty = 'internal-medicine',
): Seat[] {
  const bySpecialty = new Map<Specialty, Persona[]>();
  for (const persona of roster) bySpecialty.set(persona.specialty, [...(bySpecialty.get(persona.specialty) ?? []), persona]);

  const seats: Seat[] = [];
  const chair = bySpecialty.get('chair')?.[0];
  if (chair) seats.push({ id: 'seat-chair', label: chair.name, specialty: 'chair', kind: 'chair', persona: chair, reason: 'Council moderator and synthesis lead.' });

  seats.push({
    id: 'seat-human',
    label: 'Managing clinician',
    specialty: managingSpecialty,
    kind: 'human',
    reason: 'The clinician presents the case, selects the hypothesis, and confirms the plan.',
  });

  for (const specialty of ['skeptic', 'reimbursement'] as const) {
    const persona = bySpecialty.get(specialty)?.[0];
    if (persona) {
      seats.push({
        id: `seat-${specialty}`,
        label: persona.name,
        specialty,
        kind: specialty === 'reimbursement' ? 'reimbursement' : 'specialist',
        persona,
        reason: specialty === 'reimbursement' ? 'Standing seat for current coverage facts.' : 'Standing seat that probes overreach and missing evidence.',
      });
    }
  }

  for (const requirement of requiredSpecialties(features)) {
    const persona = bySpecialty.get(requirement.specialty)?.[0];
    seats.push(
      persona
        ? {
            id: `seat-${requirement.specialty}`,
            label: persona.name,
            specialty: requirement.specialty,
            kind: 'specialist',
            persona,
            reason: requirement.reason,
          }
        : {
            id: `seat-empty-${requirement.specialty}`,
            label: `${specialtyLabel(requirement.specialty)} needed`,
            specialty: requirement.specialty,
            kind: 'empty',
            reason: `${requirement.reason} No configured ${specialtyLabel(requirement.specialty).toLowerCase()} persona is available.`,
          },
    );
  }

  return seats;
}

export function specialtyLabel(value: Specialty): string {
  return value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}
