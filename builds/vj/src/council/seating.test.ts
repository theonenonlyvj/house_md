import { describe, expect, it } from 'vitest';
import { decideSeating, deriveFeatures, emptySeats, requiredSpecialties } from './seating';
import { ROSTER } from './personas';
import type { CaseFeatures } from '../shared/types';

// Demo case: "The Medicine Is the Poison" (Tuan Pham, docs/DEMO_SPEC.md)
const tuanFeatures: CaseFeatures = {
  age: 62,
  sex: 'male',
  chiefComplaint: 'worsening shortness of breath despite steroids; abdominal pain, loose stools, fever',
  organSystems: ['pulmonary', 'gi', 'infectious'],
  activeMeds: ['prednisone 40mg', 'metformin', 'lisinopril', 'omeprazole', 'albuterol'],
  redFlags: ['multisystem-pattern'],
};

describe('seating (Guardrail #1)', () => {
  it('requires pulm/GI/ID for the demo case', () => {
    const req = requiredSpecialties(tuanFeatures).map((r) => r.specialty);
    expect(req).toEqual(expect.arrayContaining(['pulmonology', 'gastroenterology', 'infectious-disease']));
  });

  it('seats the full panel with zero empty seats (demo roster covers its case)', () => {
    const d = decideSeating(tuanFeatures, ROSTER, 'primary-care');
    expect(emptySeats(d).length).toBe(0);
    for (const id of ['house', 'pulmo', 'gastro', 'id', 'advocate']) {
      expect(d.seats.find((s) => s.personaId === id)).toBeTruthy();
    }
    expect(d.seats.find((s) => s.status === 'human')).toBeTruthy();
  });

  it('EMPTY-seat mechanism fires when the roster genuinely lacks a required specialty', () => {
    const truncated = ROSTER.filter((p) => p.specialty !== 'infectious-disease');
    const d = decideSeating(tuanFeatures, truncated, 'primary-care');
    expect(emptySeats(d).map((s) => s.specialty)).toContain('infectious-disease');
    expect(emptySeats(d).every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('is deterministic', () => {
    expect(decideSeating(tuanFeatures, ROSTER, 'primary-care')).toEqual(decideSeating(tuanFeatures, ROSTER, 'primary-care'));
  });

  it('allows duplicate specialties (human pulmonologist + PULMO)', () => {
    const d = decideSeating(tuanFeatures, ROSTER, 'pulmonology');
    const pulm = d.seats.filter((s) => s.specialty === 'pulmonology');
    expect(pulm.map((s) => s.status).sort()).toEqual(['human', 'seated']);
  });

  it('changing the features changes the seating (no scripted room)', () => {
    const resp: CaseFeatures = { ...tuanFeatures, organSystems: ['pulmonary'], redFlags: [] };
    const d = decideSeating(resp, ROSTER, 'primary-care');
    expect(d.seats.find((s) => s.specialty === 'gastroenterology')).toBeUndefined();
    expect(d.seats.find((s) => s.specialty === 'infectious-disease')).toBeUndefined();
  });

  it('full-roster mode seats the entire DEMO_SPEC cast with no empty seats', () => {
    const d = decideSeating(tuanFeatures, ROSTER, 'primary-care', true);
    expect(emptySeats(d).length).toBe(0);
    const ids = d.seats.map((s) => s.personaId).filter(Boolean);
    for (const p of ROSTER) expect(ids).toContain(p.id);
    expect(d.seats.every((s) => s.reasons.length > 0)).toBe(true);
    expect(d.seats.map((s) => s.status)).toContain('human');
  });
});

describe('deriveFeatures', () => {
  it('derives pulm/gi/infectious from a Tuan-like chart', () => {
    const f = deriveFeatures(
      [
        { resourceType: 'Condition', text: 'Adult-onset asthma — never confirmed by spirometry' },
        { resourceType: 'Observation', text: 'Eosinophils 14% flagged HIGH, no follow-up' },
        { resourceType: 'Encounter', text: 'ED: abdominal pain, nausea, loose stools, fever 100.8' },
        { resourceType: 'MedicationRequest', text: 'prednisone 40 mg daily' },
      ],
      { age: 62, sex: 'male' },
      'worsening shortness of breath'
    );
    expect(f.organSystems).toEqual(expect.arrayContaining(['pulmonary', 'gi', 'infectious']));
    expect(f.redFlags).toContain('multisystem-pattern');
    expect(f.activeMeds.length).toBe(1);
  });

  it('well-controlled diabetes does NOT demand an endocrinology seat', () => {
    const f = deriveFeatures(
      [{ resourceType: 'Condition', text: 'Type 2 diabetes mellitus — well controlled, latest A1c 6.9' }],
      { age: 62, sex: 'male' },
      'routine'
    );
    expect(f.organSystems).not.toContain('endocrine');
  });
});
