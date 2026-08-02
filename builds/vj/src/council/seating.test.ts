import { describe, expect, it } from 'vitest';
import {
  MAX_SPECIALISTS,
  decideSeating,
  deriveFeatures,
  emptySeats,
  requiredSpecialties,
} from './seating';
import { ROSTER } from './personas';
import type { CaseFeatures } from '../shared/types';

const features = (over: Partial<CaseFeatures> = {}): CaseFeatures => ({
  age: 62,
  sex: 'male',
  chiefComplaint: 'worsening shortness of breath despite steroids; abdominal pain, loose stools, fever',
  organSystems: ['pulmonary', 'gi', 'infectious'],
  systemEvidence: { pulmonary: ['asthma'], gi: ['abdominal'], infectious: ['fever'] },
  activeMeds: ['prednisone 40mg', 'metformin'],
  redFlags: ['multisystem-pattern'],
  ...over,
});

describe('seating (Guardrail #1)', () => {
  it('maps organ systems to the specialties the record argues for', () => {
    const req = requiredSpecialties(features()).map((r) => r.specialty);
    expect(req).toEqual(['pulmonology', 'gastroenterology', 'infectious-disease']);
  });

  it('builds every seat reason from terms that actually matched', () => {
    const req = requiredSpecialties(features());
    expect(req.find((r) => r.specialty === 'pulmonology')?.reason).toBe('record mentions asthma');
  });

  it('always seats chair, skeptic, advocate and the human clinician', () => {
    const d = decideSeating(features(), ROSTER, 'primary-care');
    for (const id of ['house', 'skeptic', 'advocate']) {
      expect(d.seats.find((s) => s.personaId === id)).toBeTruthy();
    }
    expect(d.seats.find((s) => s.status === 'human')).toBeTruthy();
  });

  it('EMPTY-seat mechanism fires when the bench genuinely lacks a required specialty', () => {
    // The shipped bench has no rheumatologist — that gap is the honest case.
    const d = decideSeating(features({ organSystems: ['rheum'], systemEvidence: { rheum: ['arthralgia'] } }), ROSTER, 'primary-care');
    expect(emptySeats(d).map((s) => s.specialty)).toContain('rheumatology');
    expect(emptySeats(d).every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('never improvises: an empty seat is left empty, not filled by a neighbour', () => {
    const d = decideSeating(features({ organSystems: ['rheum'], systemEvidence: { rheum: ['arthralgia'] } }), ROSTER, 'primary-care');
    const specialists = d.seats.filter((s) => s.status === 'seated' && s.personaId && !['house', 'skeptic', 'advocate'].includes(s.personaId));
    expect(specialists).toHaveLength(0);
  });

  it('caps the panel so a long chart cannot flood the room', () => {
    const many = features({
      organSystems: ['pulmonary', 'gi', 'infectious', 'cardiac', 'renal', 'neuro', 'heme'],
    });
    const d = decideSeating(many, ROSTER, 'primary-care');
    const specialists = d.seats.filter(
      (s) => s.personaId && ROSTER.find((p) => p.id === s.personaId)?.kind === 'specialist'
    );
    expect(specialists.length).toBe(MAX_SPECIALISTS);
  });

  it('keeps the loudest systems when it caps — ranking is the tie-break', () => {
    const many = features({ organSystems: ['cardiac', 'renal', 'neuro', 'heme', 'pulmonary'] });
    const d = decideSeating(many, ROSTER, 'primary-care');
    const seated = d.seats.map((s) => s.specialty);
    expect(seated).toContain('cardiology');
    expect(seated).not.toContain('pulmonology'); // ranked fifth, past the cap
  });

  it('is deterministic', () => {
    expect(decideSeating(features(), ROSTER, 'primary-care')).toEqual(decideSeating(features(), ROSTER, 'primary-care'));
  });

  it('allows duplicate specialties (human pulmonologist + PULMO)', () => {
    const d = decideSeating(features(), ROSTER, 'pulmonology');
    const pulm = d.seats.filter((s) => s.specialty === 'pulmonology');
    expect(pulm.map((s) => s.status).sort()).toEqual(['human', 'seated']);
  });

  it('changing the features changes the seating (no scripted room)', () => {
    const d = decideSeating(features({ organSystems: ['pulmonary'], systemEvidence: { pulmonary: ['asthma'] } }), ROSTER, 'primary-care');
    expect(d.seats.find((s) => s.specialty === 'gastroenterology')).toBeUndefined();
    expect(d.seats.find((s) => s.specialty === 'infectious-disease')).toBeUndefined();
  });

  it('seats nobody as arrived — arrival is staged by the consult, not by seating', () => {
    const d = decideSeating(features(), ROSTER, 'primary-care');
    expect(d.seats.every((s) => s.arrivedAt === undefined)).toBe(true);
  });
});

describe('deriveFeatures', () => {
  const tuanChart = [
    { resourceType: 'Condition', text: 'Adult-onset asthma — never confirmed by spirometry' },
    { resourceType: 'Observation', text: 'Eosinophils 14% flagged HIGH, no follow-up' },
    { resourceType: 'Encounter', text: 'ED: abdominal pain, nausea, loose stools, fever 100.8' },
    { resourceType: 'MedicationRequest', text: 'prednisone 40 mg daily' },
  ];

  it('derives pulm/gi/infectious from a Tuan-like chart', () => {
    const f = deriveFeatures(tuanChart, { age: 62, sex: 'male' }, 'worsening shortness of breath');
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

  it('what the clinician SAYS outweighs a passing mention in the chart', () => {
    const chart = [
      { resourceType: 'Condition', text: 'History of atrial fibrillation, rate controlled' },
      { resourceType: 'Observation', text: 'Routine annual labs unremarkable' },
    ];
    const quiet = deriveFeatures(chart, { age: 71, sex: 'female' }, 'routine follow-up');
    const spoken = deriveFeatures(chart, { age: 71, sex: 'female' }, 'routine follow-up', 'she has joint pain and joint swelling in both wrists');
    expect(quiet.organSystems).not.toContain('rheum');
    // One cardiac mention in the chart (weight 1) loses to two spoken rheum terms
    // (weight 3 each) — the clinician's own words are the stronger signal.
    expect(spoken.organSystems[0]).toBe('rheum');
  });

  it('records the matched terms so every seat can show its receipts', () => {
    const f = deriveFeatures(tuanChart, { age: 62, sex: 'male' }, 'worsening shortness of breath');
    expect(f.systemEvidence?.pulmonary).toEqual(expect.arrayContaining(['asthma']));
  });

  it('ranks organ systems by evidence weight, loudest first', () => {
    const f = deriveFeatures(
      [
        { resourceType: 'Observation', text: 'echocardiogram: ventricular wall thickening, ejection fraction preserved' },
        { resourceType: 'Observation', text: 'troponin mildly elevated; NT-proBNP rising' },
        { resourceType: 'Condition', text: 'mild anemia' },
      ],
      { age: 71, sex: 'female' },
      'heart failure symptoms'
    );
    expect(f.organSystems[0]).toBe('cardiac');
  });

  it('flags a recent medication change as a red flag', () => {
    const f = deriveFeatures(
      [{ resourceType: 'MedicationRequest', text: 'prednisone 40 mg daily, dose increase 16 days ago' }],
      { age: 62, sex: 'male' },
      'worse since the steroid started'
    );
    expect(f.redFlags).toContain('recent-medication-change');
  });
});
