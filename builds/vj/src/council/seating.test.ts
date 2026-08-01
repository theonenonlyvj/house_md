import { describe, expect, it } from 'vitest';
import { decideSeating, deriveFeatures, emptySeats, requiredSpecialties } from './seating';
import { ROSTER } from './personas';
import type { CaseFeatures, Persona } from '../shared/types';

const janeFeatures: CaseFeatures = {
  age: 55,
  sex: 'female',
  chiefComplaint: 'progressive exertional dyspnea and bilateral leg swelling',
  organSystems: ['cardiac', 'renal', 'neuro'],
  activeMeds: ['lisinopril'],
  redFlags: ['multisystem-pattern'],
};

// Engine-behavior tests use a fixture roster so the demo cast (personas.ts)
// can be reconfigured without rewriting Guardrail #1's contract.
const FIXTURE: Persona[] = [
  { id: 'chair', name: 'Chair', specialty: 'internal-medicine', kind: 'chair', style: '' },
  { id: 'skeptic', name: 'Skeptic', specialty: 'diagnostic-skeptic', kind: 'skeptic', style: '' },
  { id: 'reimb', name: 'Advocate', specialty: 'reimbursement', kind: 'reimbursement', style: '' },
  { id: 'cardiology', name: 'Cardio', specialty: 'cardiology', kind: 'specialist', style: '' },
  { id: 'nephrology', name: 'Nephro', specialty: 'nephrology', kind: 'specialist', style: '' },
  { id: 'neurology', name: 'Neuro', specialty: 'neurology', kind: 'specialist', style: '' },
  { id: 'clin-pharm', name: 'Pharm', specialty: 'clinical-pharmacology', kind: 'specialist', style: '' },
  { id: 'hematology', name: 'Heme', specialty: 'hematology', kind: 'specialist', style: '' },
];

describe('seating (Guardrail #1)', () => {
  it('requires hematology for a multisystem case like the default', () => {
    const req = requiredSpecialties(janeFeatures).map((r) => r.specialty);
    expect(req).toContain('hematology');
    expect(req).toContain('cardiology');
    expect(req).toContain('nephrology');
    expect(req).toContain('neurology');
  });

  it('seats every required specialty when the roster covers them (nothing empty)', () => {
    const d = decideSeating(janeFeatures, FIXTURE, 'internal-medicine');
    expect(emptySeats(d).length).toBe(0);
    const heme = d.seats.find((s) => s.specialty === 'hematology');
    expect(heme?.status).toBe('seated');
  });

  it('EMPTY-seat mechanism still fires when the roster genuinely lacks a required specialty', () => {
    const truncated = FIXTURE.filter((p) => p.specialty !== 'neurology');
    const d = decideSeating(janeFeatures, truncated, 'internal-medicine');
    const empty = emptySeats(d);
    expect(empty.map((s) => s.specialty)).toContain('neurology');
    expect(empty.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('is deterministic: same input → same output', () => {
    const a = decideSeating(janeFeatures, FIXTURE, 'internal-medicine');
    const b = decideSeating(janeFeatures, FIXTURE, 'internal-medicine');
    expect(a).toEqual(b);
  });

  it('seats structural personas (chair, skeptic, reimbursement) and the human', () => {
    const d = decideSeating(janeFeatures, FIXTURE, 'cardiology');
    const statuses = d.seats.map((s) => s.status);
    expect(statuses).toContain('human');
    expect(d.seats.find((s) => s.personaId === 'chair')).toBeTruthy();
    expect(d.seats.find((s) => s.personaId === 'skeptic')).toBeTruthy();
    expect(d.seats.find((s) => s.personaId === 'reimb')).toBeTruthy();
  });

  it('allows duplicate specialties (human cardiologist + AI cardiologist)', () => {
    const d = decideSeating(janeFeatures, FIXTURE, 'cardiology');
    const cardioSeats = d.seats.filter((s) => s.specialty === 'cardiology');
    expect(cardioSeats.length).toBe(2);
    expect(cardioSeats.map((s) => s.status).sort()).toEqual(['human', 'seated']);
  });

  it('every seated/empty case seat carries feature-citing reasons', () => {
    const d = decideSeating(janeFeatures, FIXTURE, 'internal-medicine');
    expect(d.seats.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('changing the features changes the seating (no scripted room)', () => {
    const simple: CaseFeatures = {
      ...janeFeatures,
      organSystems: ['cardiac'],
      activeMeds: [],
      redFlags: [],
    };
    const d = decideSeating(simple, FIXTURE, 'internal-medicine');
    expect(emptySeats(d).length).toBe(0);
    expect(d.seats.find((s) => s.specialty === 'nephrology')).toBeUndefined();
  });

  it('full-roster mode seats the entire DEMO_SPEC cast with no empty seats', () => {
    const d = decideSeating(janeFeatures, ROSTER, 'internal-medicine', true);
    expect(emptySeats(d).length).toBe(0);
    const ids = d.seats.map((s) => s.personaId).filter(Boolean);
    for (const p of ROSTER) expect(ids).toContain(p.id);
    expect(d.seats.every((s) => s.reasons.length > 0)).toBe(true);
    expect(d.seats.map((s) => s.status)).toContain('human');
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
