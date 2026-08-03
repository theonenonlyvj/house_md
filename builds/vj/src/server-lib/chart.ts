import { fhirRead, fhirSearch } from './medplum';
import type { CaseConfig } from '../case/cases';
import type { EvidenceRef, PatientBanner } from '../shared/types';
import type { ChartResourceLite } from '../council/seating';

// Loads a case patient's chart from hosted Medplum and builds the alias table
// (E1, E2, …) — the model only ever cites aliases; the server resolves them.

export interface LoadedChart {
  caseId: string;
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
  // Orders that were placed and never completed are some of the most diagnostic
  // rows in a chart — a referral nobody attended, a study nobody ran. Omitting
  // ServiceRequest hid exactly the kind of gap the panel is here to notice.
  'ServiceRequest',
];

const cc = (c: any): string =>
  c?.text || c?.coding?.map((x: any) => x.display).filter(Boolean).join(' ') || '';

// Seeded records carry a synthetic-data disclaimer in note[]. It is honest
// provenance in FHIR and pure noise everywhere else — it would repeat on every row
// on screen and eat the model's context on every search hit. Strip it here, once.
const BOILERPLATE = /Synthetic demo record\.\s*Terminology coding intentionally omitted[^.]*\.\s*/gi;
const clean = (s: string) =>
  s
    .replace(BOILERPLATE, '')
    .replace(/\s+/g, ' ')
    // removing a trailing segment leaves its " — " joiner dangling
    .replace(/(\s*—\s*)+$/, '')
    .replace(/\s*—\s*—\s*/g, ' — ')
    .trim();

/** The resource's name, for a chart row or a card heading. */
function titleOf(r: any): string {
  const named =
    cc(r.code) ||
    cc(r.medicationCodeableConcept) ||
    cc(r.type?.[0]) ||
    cc(r.category?.[0]) ||
    r.resourceType;
  return clean(named).slice(0, 110);
}

/** Everything the resource says, for retrieval and citation. */
function textOf(r: any): string {
  const bits: string[] = [];
  bits.push(titleOf(r));
  bits.push(r.valueString || cc(r.valueCodeableConcept) || '');
  if (r.valueQuantity) bits.push(`${r.valueQuantity.value ?? ''} ${r.valueQuantity.unit ?? ''}`);
  if (Array.isArray(r.dosageInstruction)) bits.push(r.dosageInstruction.map((d: any) => d.text).filter(Boolean).join('; '));
  bits.push(cc(r.reasonCode?.[0]) || '');
  bits.push(r.conclusion || '');
  if (r.interpretation?.[0]) bits.push(`FLAGGED ${cc(r.interpretation[0])}`);
  if (Array.isArray(r.note)) bits.push(r.note.map((n: any) => n.text).join(' '));
  if (r.status && ['revoked', 'draft', 'completed'].includes(r.status)) bits.push(`status: ${r.status}`);
  return clean(bits.filter(Boolean).join(' — '));
}

/** Effective date across the resource types we load. */
function dateOf(r: any): string | undefined {
  return (
    r.performedDateTime ||
    r.effectiveDateTime ||
    r.authoredOn || // MedicationRequest, ServiceRequest — was missing, so both showed no date
    r.recordedDate ||
    r.onsetDateTime ||
    r.period?.start ||
    r.occurrenceDateTime ||
    undefined
  );
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

// One chart per case, so switching patients on the provider page does not serve a
// stale record — and switching back does not re-fetch a decade of history.
const cache = new Map<string, LoadedChart>();

export function resetChartCache(caseId?: string): void {
  if (caseId) cache.delete(caseId);
  else cache.clear();
}

export async function loadChart(cfg: CaseConfig, force = false): Promise<LoadedChart> {
  const hit = cache.get(cfg.id);
  if (hit && !force) return hit;
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
    display: titleOf(r) || r.resourceType,
    fact: textOf(r).slice(0, 300),
    date: dateOf(r),
  }));

  const name = patient.name?.[0];
  const loaded: LoadedChart = {
    caseId: cfg.id,
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
  cache.set(cfg.id, loaded);
  return loaded;
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
