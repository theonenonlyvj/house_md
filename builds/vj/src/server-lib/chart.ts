import { fhirRead, fhirSearch } from './medplum';
import { DEFAULT_CASE } from '../case/default-case';
import type { EvidenceRef, PatientBanner } from '../shared/types';
import type { ChartResourceLite } from '../council/seating';

// Loads the case patient's chart from hosted Medplum and builds the alias table
// (E1, E2, …) — the model only ever cites aliases; the server resolves them.

export interface LoadedChart {
  banner: PatientBanner;
  patientId: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  resources: ChartResourceLite[];
  aliases: EvidenceRef[]; // alias → real resource mapping
  source: 'medplum' | 'dev-local';
}

const EVIDENCE_TYPES = [
  'Condition',
  'Observation',
  'Procedure',
  'DiagnosticReport',
  'MedicationRequest',
  'MedicationStatement',
  'AllergyIntolerance',
  'Encounter',
  'Immunization',
];

function textOf(r: any): string {
  const bits: string[] = [];
  const cc = (c: any) => c?.text || c?.coding?.map((x: any) => x.display).filter(Boolean).join(' ');
  bits.push(cc(r.code) || '');
  bits.push(r.valueString || cc(r.valueCodeableConcept) || '');
  if (r.valueQuantity) bits.push(`${r.valueQuantity.value ?? ''} ${r.valueQuantity.unit ?? ''}`);
  bits.push(cc(r.reasonCode?.[0]) || '');
  bits.push(r.conclusion || '');
  if (Array.isArray(r.note)) bits.push(r.note.map((n: any) => n.text).join(' '));
  if (r.performedDateTime) bits.push(r.performedDateTime);
  if (r.effectiveDateTime) bits.push(r.effectiveDateTime);
  return bits.filter(Boolean).join(' — ');
}

function ageFrom(dob?: string): number {
  if (!dob) return 0;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

// Dev fallback so the build runs before Noah's seed lands. Clearly labeled in UI;
// never the submitted path.
const DEV_CHART: { patient: any; resources: any[] } = {
  patient: { resourceType: 'Patient', id: 'dev-local', name: [{ given: ['Jane'], family: 'Doe' }], birthDate: '1971-01-01', gender: 'female' },
  resources: [
    { resourceType: 'Procedure', id: 'dev-1', code: { text: 'Left carpal tunnel release' }, performedDateTime: '2018-06-01' },
    { resourceType: 'Procedure', id: 'dev-2', code: { text: 'Right carpal tunnel release' }, performedDateTime: '2020-09-01' },
    { resourceType: 'Condition', id: 'dev-3', code: { text: 'Essential hypertension' }, recordedDate: '2022-01-01' },
    { resourceType: 'Observation', id: 'dev-4', code: { text: 'Progressive distal sensory neuropathy with intermittent orthostatic dizziness' }, effectiveDateTime: '2024-03-01' },
    { resourceType: 'Observation', id: 'dev-5', code: { text: 'Persistent proteinuria; mildly reduced renal function' }, effectiveDateTime: '2025-02-01' },
    { resourceType: 'DiagnosticReport', id: 'dev-6', code: { text: 'Echocardiogram' }, conclusion: 'Increased LV wall thickness, preserved ejection fraction, diastolic dysfunction', effectiveDateTime: '2026-05-10' },
    { resourceType: 'Observation', id: 'dev-7', code: { text: 'ECG: low-normal QRS voltage in limb leads' }, effectiveDateTime: '2026-05-10' },
    { resourceType: 'Observation', id: 'dev-8', code: { text: 'NT-proBNP elevated with rising trend; troponin mildly elevated, persistent' }, effectiveDateTime: '2026-06-15' },
    { resourceType: 'Observation', id: 'dev-9', code: { text: 'Dyspnea on exertion; bilateral lower-extremity edema; declining exercise tolerance' }, effectiveDateTime: '2026-07-28' },
    { resourceType: 'MedicationStatement', id: 'dev-10', medicationCodeableConcept: { text: 'lisinopril' }, status: 'active' },
  ],
};

let cached: LoadedChart | null = null;

export async function loadChart(force = false): Promise<LoadedChart> {
  if (cached && !force) return cached;
  const cfg = DEFAULT_CASE;
  let patient: any | null = null;
  let source: 'medplum' | 'dev-local' = 'medplum';
  let resources: any[] = [];

  try {
    if (cfg.patientLocator.patientId) {
      patient = await fhirRead('Patient', cfg.patientLocator.patientId);
    }
    if (!patient && cfg.patientLocator.identifier) {
      const b = await fhirSearch('Patient', `identifier=${encodeURIComponent(cfg.patientLocator.identifier.system + '|' + cfg.patientLocator.identifier.value)}`);
      patient = b.entry?.[0]?.resource || null;
    }
    if (!patient && cfg.patientLocator.nameFallback) {
      const { family, given } = cfg.patientLocator.nameFallback;
      const b = await fhirSearch('Patient', `family=${encodeURIComponent(family)}&given=${encodeURIComponent(given)}&_count=1`);
      patient = b.entry?.[0]?.resource || null;
    }
    if (patient) {
      for (const type of EVIDENCE_TYPES) {
        const b = await fhirSearch(type, `subject=Patient/${patient.id}&_count=100`).catch(() =>
          fhirSearch(type, `patient=Patient/${patient.id}&_count=100`).catch(() => null)
        );
        for (const e of b?.entry || []) resources.push(e.resource);
      }
    }
  } catch {
    patient = null;
  }

  if (!patient || resources.length === 0) {
    patient = DEV_CHART.patient;
    resources = DEV_CHART.resources;
    source = 'dev-local';
  }

  const lite: ChartResourceLite[] = resources.map((r) => ({ resourceType: r.resourceType, text: textOf(r) }));
  const aliases: EvidenceRef[] = resources.map((r, i) => ({
    alias: `E${i + 1}`,
    resourceType: r.resourceType,
    resourceId: r.id,
    display: (textOf(r) || r.resourceType).slice(0, 90),
    fact: textOf(r).slice(0, 240),
  }));

  const name = patient.name?.[0];
  cached = {
    banner: {
      name: `${name?.given?.join(' ') ?? ''} ${name?.family ?? ''}`.trim() || 'Synthetic Patient',
      dob: patient.birthDate || 'unknown',
      synthetic: true,
      payer: cfg.payerLabel,
      medplumId: source === 'medplum' ? patient.id : undefined,
    },
    patientId: patient.id,
    age: ageFrom(patient.birthDate),
    sex: (patient.gender as any) || 'other',
    resources: lite,
    aliases,
    source,
  };
  return cached;
}

// Keyword-scored evidence search over the alias table (honest local retrieval; the
// evidence returned is exactly what the model may cite). Moss can upgrade this seam.
export function searchEvidence(chart: LoadedChart, query: string, limit = 6): EvidenceRef[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = chart.aliases.map((a) => {
    const hay = `${a.resourceType} ${a.fact}`.toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { a, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
