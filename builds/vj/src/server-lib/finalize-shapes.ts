// Pure finalize resource-shaping — session summary → R4 resources (PLAN-FINAL §2 Act 4).
// Text-only CodeableConcepts everywhere; the ONLY identifier system is our session slug
// namespace. No invented SNOMED/ICD/CPT/LOINC codes, ever. Route imports this so the
// shapes are unit-testable offline without touching Medplum.

import type { ClinicalImpression, ServiceRequest } from '@medplum/fhirtypes';

export const SESSION_IDENTIFIER_SYSTEM = 'https://housemd.example/session';
export const IMPRESSION_IDENTIFIER_VALUE = 'session-default-impression';

export interface FinalizeDifferentialItem {
  display: string;
  assessment: string;
  rank: number;
}

export interface FinalizeOption {
  display: string;
  purpose: string;
  sequenceNote?: string;
}

export interface SessionSummary {
  patientId: string;
  leadingDx: string;
  differential: FinalizeDifferentialItem[];
  selectedOptions: FinalizeOption[];
  patientPlanText: string;
}

export interface PlannedResource {
  resource: ClinicalImpression | ServiceRequest;
  ifNoneExist: string; // If-None-Exist search — write-back is idempotent within a session
  display: string; // human label for the CreatedResource card
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'option'
  );
}

export function buildFinalizeResources(summary: SessionSummary): PlannedResource[] {
  const subject = { reference: `Patient/${summary.patientId}` };
  const ranked = [...summary.differential].sort((a, b) => a.rank - b.rank);

  const summaryText = [
    'Council session documentation. Decision support, not diagnosis: the council argued, the clinician decided.',
    '',
    'Differential considered:',
    ...ranked.map((d) => `${d.rank}. ${d.display} — ${d.assessment}`),
    '',
    `Leading diagnosis selected by the clinician: ${summary.leadingDx}`,
    '',
    'Presenting this to the patient:',
    summary.patientPlanText,
  ].join('\n');

  const impression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    subject,
    identifier: [{ system: SESSION_IDENTIFIER_SYSTEM, value: IMPRESSION_IDENTIFIER_VALUE }],
    summary: summaryText,
    finding: ranked.map((d) => ({ itemCodeableConcept: { text: d.display } })),
  };

  const planned: PlannedResource[] = [
    {
      resource: impression,
      ifNoneExist: `identifier=${SESSION_IDENTIFIER_SYSTEM}|${IMPRESSION_IDENTIFIER_VALUE}`,
      display: `Clinical impression — leading: ${summary.leadingDx}`,
    },
  ];

  for (const opt of summary.selectedOptions) {
    const slug = `session-default-sr-${slugify(opt.display)}`;
    const request: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'proposal',
      subject,
      identifier: [{ system: SESSION_IDENTIFIER_SYSTEM, value: slug }],
      code: { text: opt.display },
      ...(opt.purpose ? { reasonCode: [{ text: opt.purpose }] } : {}),
      ...(opt.sequenceNote ? { note: [{ text: opt.sequenceNote }] } : {}),
    };
    planned.push({
      resource: request,
      ifNoneExist: `identifier=${SESSION_IDENTIFIER_SYSTEM}|${slug}`,
      display: opt.display,
    });
  }

  return planned;
}
