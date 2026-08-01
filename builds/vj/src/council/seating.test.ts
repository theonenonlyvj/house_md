import { describe, expect, it } from 'vitest';
import { decideSeating, deriveFeatures, emptySeats, requiredSpecialties } from './seating';
import { ROSTER } from './personas';
import type { CaseFeatures } from '../shared/types';

const janeFeatures: CaseFeatures = {
  age: 55,
  sex: 'female',
  chiefComplaint: 'progressive exertional dyspnea and bilateral leg swelling',
  organSystems: ['cardiac', 'renal', 'neuro'],
  activeMeds: ['lisinopril'],
  redFlags: ['multisystem-pattern'],
};

describe('seating (Guardrail #1)', () => {
  it('requires hematology for a multisystem case like the default', () => {
    const req = requiredSpecialties(janeFeatures).map((r) => r.specialty);
    expect(req).toContain('hematology');
    expect(req).toContain('cardiology');
    expect(req).toContain('nephrology');
    expect(req).toContain('neurology');
  });

  it('seats hematology with the full default roster (nothing empty for the demo case)', () => {
    const d = decideSeating(janeFeatures, ROSTER, 'internal-medicine');
    expect(emptySeats(d).length).toBe(0);
    const heme = d.seats.find((s) => s.specialty === 'hematology');
    expect(heme?.status).toBe('seated');
  });

  it('EMPTY-seat mechanism still fires when the roster genuinely lacks a required specialty', () => {
    const truncated = ROSTER.filter((p) => p.specialty !== 'neurology');
    const d = decideSeating(janeFeatures, truncated, 'internal-medicine');
    const empty = emptySeats(d);
    expect(empty.map((s) => s.specialty)).toContain('neurology');
    expect(empty.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('is deterministic: same input → same output', () => {
    const a = decideSeating(janeFeatures, ROSTER, 'internal-medicine');
    const b = decideSeating(janeFeatures, ROSTER, 'internal-medicine');
    expect(a).toEqual(b);
  });

  it('seats structural personas (chair, skeptic, reimbursement) and the human', () => {
    const d = decideSeating(janeFeatures, ROSTER, 'cardiology');
    const statuses = d.seats.map((s) => s.status);
    expect(statuses).toContain('human');
    expect(d.seats.find((s) => s.personaId === 'chair-house')).toBeTruthy();
    expect(d.seats.find((s) => s.personaId === 'skeptic')).toBeTruthy();
    expect(d.seats.find((s) => s.personaId === 'reimbursement')).toBeTruthy();
  });

  it('allows duplicate specialties (human cardiologist + AI cardiologist)', () => {
    const d = decideSeating(janeFeatures, ROSTER, 'cardiology');
    const cardioSeats = d.seats.filter((s) => s.specialty === 'cardiology');
    expect(cardioSeats.length).toBe(2);
    expect(cardioSeats.map((s) => s.status).sort()).toEqual(['human', 'seated']);
  });

  it('every seated/empty case seat carries feature-citing reasons', () => {
    const d = decideSeating(janeFeatures, ROSTER, 'internal-medicine');
    expect(d.seats.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('changing the features changes the seating (no scripted room)', () => {
    const simple: CaseFeatures = {
      ...janeFeatures,
      organSystems: ['cardiac'],
      activeMeds: [],
      redFlags: [],
    };
    const d = decideSeating(simple, ROSTER, 'internal-medicine');
    expect(emptySeats(d).length).toBe(0);
    expect(d.seats.find((s) => s.specialty === 'nephrology')).toBeUndefined();
  });
});

describe('deriveFeatures', () => {
  it('derives organ systems + meds + multisystem flag from chart text', () => {
    const f = deriveFeatures(
      [
        { resourceType: 'Procedure', text: 'Left carpal tunnel release' },
        { resourceType: 'Observation', text: 'Persistent proteinuria, mildly reduced renal function' },
        { resourceType: 'DiagnosticReport', text: 'Echocardiogram: increased LV wall thickness, preserved ejection fraction' },
        { resourceType: 'MedicationStatement', text: 'lisinopril' },
      ],
      { age: 55, sex: 'female' },
      'progressive exertional dyspnea'
    );
    expect(f.organSystems).toEqual(expect.arrayContaining(['cardiac', 'renal', 'neuro']));
    expect(f.activeMeds).toEqual(['lisinopril']);
    expect(f.redFlags).toContain('multisystem-pattern');
  });
});
