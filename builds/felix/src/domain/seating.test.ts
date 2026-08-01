import { describe, expect, it } from 'vitest';
import { PERSONAS } from '@/config/case';
import type { CaseFeatures } from '@/domain/types';
import { requiredSpecialties, seatCouncil } from './seating';

const janeFeatures: CaseFeatures = {
  chiefComplaint: 'Progressive exertional dyspnea and bilateral leg edema',
  organSystems: ['cardiac', 'renal', 'neurologic'],
  medications: [],
  age: 55,
  sex: 'female',
  presentation: 'Preserved ejection fraction with increased ventricular wall thickness',
  recordText: ['Bilateral carpal tunnel release', 'sensory neuropathy and orthostatic dizziness', 'persistent proteinuria'],
};

describe('seating engine', () => {
  it('derives required specialties from case features', () => {
    expect(requiredSpecialties(janeFeatures).map((item) => item.specialty)).toEqual([
      'cardiology',
      'hematology',
      'neurology',
      'nephrology',
    ]);
  });

  it('renders Jane’s required hematology seat as honestly empty with the default roster', () => {
    const seats = seatCouncil(janeFeatures, PERSONAS);
    expect(seats.find((seat) => seat.specialty === 'hematology')).toMatchObject({ kind: 'empty' });
  });

  it('fills hematology when a configured persona exists', () => {
    const seats = seatCouncil(janeFeatures, [
      ...PERSONAS,
      {
        id: 'hematologist',
        name: 'Dr. Test',
        specialty: 'hematology',
        argumentStyle: 'Test',
        systemPrompt: 'Test',
        voiceId: 'test',
      },
    ]);
    expect(seats.find((seat) => seat.specialty === 'hematology')).toMatchObject({ kind: 'specialist', label: 'Dr. Test' });
  });
});
