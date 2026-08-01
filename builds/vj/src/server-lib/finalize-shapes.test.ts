// Offline tests for the pure finalize resource-shaping (no Medplum calls — the route
// wires buildFinalizeResources() to fhirCreate; Noah owns the seeded patient).

import { describe, expect, it } from 'vitest';
import {
  IMPRESSION_IDENTIFIER_VALUE,
  SESSION_IDENTIFIER_SYSTEM,
  buildFinalizeResources,
  slugify,
  type SessionSummary,
} from './finalize-shapes';
import type { ClinicalImpression, ServiceRequest } from '@medplum/fhirtypes';

const summary: SessionSummary = {
  patientId: 'patient-123',
  leadingDx: 'Systemic amyloidosis with possible cardiac involvement',
  differential: [
    { display: 'Hypertensive heart disease', assessment: 'Competing explanation; long-standing HTN', rank: 2 },
    { display: 'Systemic amyloidosis with possible cardiac involvement', assessment: 'Best fit for multi-system clues', rank: 1 },
    { display: 'Hypertrophic/other infiltrative cardiomyopathy', assessment: 'Less likely; imaging discordance', rank: 3 },
  ],
  selectedOptions: [
    { display: 'Serum free light chains', purpose: 'Screen for AL amyloidosis' },
    {
      display: 'Cardiology consult',
      purpose: 'Specialist evaluation of infiltrative pattern',
      sequenceNote: 'Scheduled behind required PCP referral ($15 copay per current 271)',
    },
  ],
  patientPlanText: 'We are going to run a blood test now and set up a heart specialist visit.',
};

describe('buildFinalizeResources', () => {
  it('builds one ClinicalImpression + one ServiceRequest per selected option', () => {
    const planned = buildFinalizeResources(summary);
    expect(planned).toHaveLength(3);
    expect(planned.map((p) => p.resource.resourceType)).toEqual([
      'ClinicalImpression',
      'ServiceRequest',
      'ServiceRequest',
    ]);
  });

  it('shapes the ClinicalImpression per R4 with the required narrative sections', () => {
    const impression = buildFinalizeResources(summary)[0].resource as ClinicalImpression;
    expect(impression.status).toBe('completed');
    expect(impression.subject).toEqual({ reference: 'Patient/patient-123' });
    expect(impression.identifier).toEqual([
      { system: SESSION_IDENTIFIER_SYSTEM, value: IMPRESSION_IDENTIFIER_VALUE },
    ]);
    // Narrative: considered differential (rank-ordered) + leading dx + patient plan section.
    const text = impression.summary ?? '';
    expect(text).toContain('Differential considered:');
    expect(text.indexOf('1. Systemic amyloidosis')).toBeLessThan(
      text.indexOf('2. Hypertensive heart disease'),
    );
    expect(text).toContain('3. Hypertrophic/other infiltrative cardiomyopathy');
    expect(text).toContain(
      'Leading diagnosis selected by the clinician: Systemic amyloidosis with possible cardiac involvement',
    );
    expect(text).toContain('Presenting this to the patient:');
    expect(text).toContain(summary.patientPlanText);
    // Findings: text-only CodeableConcepts, one per considered differential item.
    expect(impression.finding).toHaveLength(3);
    for (const f of impression.finding ?? []) {
      expect(f.itemCodeableConcept?.text).toBeTruthy();
      expect(f.itemCodeableConcept?.coding).toBeUndefined();
    }
  });

  it('shapes draft/proposal ServiceRequests with text-only codes and sequence notes', () => {
    const planned = buildFinalizeResources(summary);
    const consult = planned[2].resource as ServiceRequest;
    expect(consult.status).toBe('draft');
    expect(consult.intent).toBe('proposal');
    expect(consult.subject).toEqual({ reference: 'Patient/patient-123' });
    expect(consult.code).toEqual({ text: 'Cardiology consult' });
    expect(consult.reasonCode).toEqual([{ text: 'Specialist evaluation of infiltrative pattern' }]);
    expect(consult.note).toEqual([
      { text: 'Scheduled behind required PCP referral ($15 copay per current 271)' },
    ]);
    const labs = planned[1].resource as ServiceRequest;
    expect(labs.note).toBeUndefined(); // no sequenceNote → no note
  });

  it('is idempotent: stable per-resource identifiers + matching If-None-Exist', () => {
    const a = buildFinalizeResources(summary);
    const b = buildFinalizeResources(summary);
    expect(a.map((p) => p.ifNoneExist)).toEqual(b.map((p) => p.ifNoneExist));
    expect(a[0].ifNoneExist).toBe(
      `identifier=${SESSION_IDENTIFIER_SYSTEM}|${IMPRESSION_IDENTIFIER_VALUE}`,
    );
    expect(a[2].ifNoneExist).toBe(
      `identifier=${SESSION_IDENTIFIER_SYSTEM}|session-default-sr-cardiology-consult`,
    );
    // Each ServiceRequest carries the identifier its If-None-Exist searches for.
    for (const p of a) {
      const ident = p.resource.identifier?.[0];
      expect(p.ifNoneExist).toBe(`identifier=${ident?.system}|${ident?.value}`);
    }
    // Identifier values are unique across the batch.
    const values = a.map((p) => p.resource.identifier?.[0]?.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('never invents coding systems — text-only CodeableConcepts throughout', () => {
    const json = JSON.stringify(buildFinalizeResources(summary).map((p) => p.resource));
    expect(json).not.toContain('"coding"');
    // The only system anywhere is our session identifier namespace.
    const systems = [...json.matchAll(/"system":"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(systems)).toEqual(new Set([SESSION_IDENTIFIER_SYSTEM]));
  });

  it('slugify produces stable url-safe slugs', () => {
    expect(slugify('Serum free light chains')).toBe('serum-free-light-chains');
    expect(slugify('  Tc-99m-PYP scintigraphy! ')).toBe('tc-99m-pyp-scintigraphy');
    expect(slugify('???')).toBe('option');
  });
});
