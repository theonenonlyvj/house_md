import 'server-only';
import type { ClinicalImpression, Patient, Resource, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { CASE_CONFIG, PERSONAS } from '@/config/case';
import { validateClaim, type ClaimInput } from '@/domain/citations';
import { projectWorkup } from '@/domain/coverage';
import { seatCouncil } from '@/domain/seating';
import type { Contribution, DifferentialItem, EvidenceItem, SessionState, WorkupItem } from '@/domain/types';
import { getMedplum, loadCaseRecord, resourceDisplay } from './medplum';
import { searchMoss } from './moss';
import { checkEligibility } from './stedi';

interface SessionRecord {
  state: SessionState;
  patient?: Patient;
  resources: Map<string, Resource>;
  loadPromise?: Promise<void>;
}

const sessions = globalThis as typeof globalThis & { __houseMdSessions?: Map<string, SessionRecord> };
const store = sessions.__houseMdSessions ?? new Map<string, SessionRecord>();
sessions.__houseMdSessions = store;

export function getSession(id = 'demo-session'): SessionRecord {
  let session = store.get(id);
  if (!session) {
    session = { state: initialState(id), resources: new Map() };
    store.set(id, session);
  }
  return session;
}

export async function initializeSession(id = 'demo-session'): Promise<SessionState> {
  const session = getSession(id);
  if (session.patient) return session.state;
  if (!session.loadPromise) {
    session.loadPromise = (async () => {
      setIntegration(session.state, 'medplum', 'working', 'Loading the locked synthetic patient record…');
      try {
        const { patient, resources } = await loadCaseRecord();
        session.patient = patient;
        session.resources = new Map(resources.filter((resource) => resource.id).map((resource) => [`${resource.resourceType}/${resource.id}`, resource]));
        session.state.patient = {
          reference: `Patient/${patient.id}`,
          display: patientName(patient),
          birthDate: patient.birthDate,
          age: ageAt(patient.birthDate),
          sex: patient.gender,
          payer: CASE_CONFIG.payer,
          synthetic: true,
          resourceCount: resources.length,
        };
        session.state.status = 'presenting';
        session.state.error = undefined;
        setIntegration(session.state, 'medplum', 'ready', `${resources.length} FHIR R4 resources loaded from hosted Medplum.`);
        touch(session.state);
      } catch (error) {
        session.state.status = 'error';
        session.state.error = message(error);
        setIntegration(session.state, 'medplum', 'error', message(error));
        touch(session.state);
      }
    })().finally(() => { session.loadPromise = undefined; });
  }
  await session.loadPromise;
  return session.state;
}

export function assembleSession(id: string, presentation: string): SessionState {
  const session = getSession(id);
  if (!session.patient || !session.state.patient) throw new Error('Load the patient record before assembling the council.');
  const recordText = [...session.resources.values()].map((resource) => JSON.stringify(resource));
  session.state.presentation = presentation;
  session.state.transcript = presentation;
  session.state.seats = seatCouncil({
    chiefComplaint: presentation,
    organSystems: [],
    medications: [],
    age: session.state.patient.age,
    sex: session.state.patient.sex,
    presentation,
    recordText,
  }, PERSONAS, CASE_CONFIG.managingClinicianSpecialty);
  session.state.status = 'assembled';
  touch(session.state);
  return session.state;
}

export async function searchSessionEvidence(id: string, query: string): Promise<SessionState> {
  const session = getSession(id);
  setIntegration(session.state, 'moss', 'working', `Searching ${session.resources.size} indexed records…`);
  touch(session.state);
  try {
    const result = await searchMoss(query, 6);
    const found: EvidenceItem[] = [];
    for (const doc of result.docs) {
      const metadataRef = typeof doc.metadata?.resourceId === 'string' ? doc.metadata.resourceId : undefined;
      const reference = metadataRef ?? doc.id;
      const resource = session.resources.get(reference);
      if (!resource?.id) continue;
      const display = resourceDisplay(resource);
      found.push({
        alias: `E${found.length + 1}`,
        resourceId: reference,
        resourceType: resource.resourceType,
        title: display.title,
        summary: display.summary,
        date: display.date,
        score: doc.score,
        raw: resource,
      });
    }
    session.state.evidence = found;
    session.state.evidenceSearch = { query, scanned: session.resources.size, hits: found.length, mode: 'moss' };
    session.state.status = 'debating';
    setIntegration(session.state, 'moss', 'ready', `${found.length} Medplum-backed hits in ${result.ms}ms.`);
  } catch (error) {
    setIntegration(session.state, 'moss', 'error', message(error));
    throw error;
  } finally {
    touch(session.state);
  }
  return session.state;
}

export function councilContext(id: string, specialtyIds: string[]) {
  const session = getSession(id);
  const selected = session.state.seats.filter((seat) => seat.persona && (specialtyIds.length === 0 || specialtyIds.includes(seat.specialty) || specialtyIds.includes(seat.persona.id)));
  return {
    personas: selected.map((seat) => ({ id: seat.persona!.id, name: seat.persona!.name, specialty: seat.specialty, argumentStyle: seat.persona!.argumentStyle, systemPrompt: seat.persona!.systemPrompt })),
    evidence: session.state.evidence.map(({ alias, resourceId: _resourceId, raw: _raw, ...item }) => item),
    emptySeats: session.state.seats.filter((seat) => seat.kind === 'empty').map((seat) => ({ specialty: seat.specialty, reason: seat.reason })),
  };
}

export function applyCouncilUpdate(id: string, input: CouncilUpdateInput): SessionState {
  const session = getSession(id);
  const claim = (value: ClaimInput) => validateClaim(value, session.state.evidence);
  session.state.contributions = input.contributions.map((item, index): Contribution => ({
    id: item.id || `contribution-${index + 1}`,
    personaId: item.personaId,
    leadingInterpretation: claim(item.leadingInterpretation),
    strongestSupport: claim(item.strongestSupport),
    contradiction: claim(item.contradiction),
    discriminatingStep: claim(item.discriminatingStep),
    challenged: item.challenged,
  }));
  session.state.differential = input.differential.sort((a, b) => a.rank - b.rank).map((item): DifferentialItem => ({
    ...item,
    confidence: item.rank === 1 ? 'leading' : item.confidence,
    rationale: claim(item.rationale),
  }));
  session.state.status = 'debating';
  touch(session.state);
  return session.state;
}

export function applyWorkup(id: string, items: WorkupInput[]): SessionState {
  const session = getSession(id);
  session.state.workup = items.map((item, index): WorkupItem => ({
    id: item.id || `workup-${index + 1}`,
    label: item.label,
    rationale: item.rationale,
    kind: item.kind,
    sequence: item.sequence,
    selected: item.selected ?? true,
    dependsOn: item.dependsOn,
    benefits: [],
  })).sort((a, b) => a.sequence - b.sequence);
  session.state.status = 'planning';
  touch(session.state);
  return session.state;
}

export function selectHypothesis(id: string, differentialId: string): SessionState {
  const session = getSession(id);
  session.state.differential = session.state.differential.map((item) => ({ ...item, selected: item.id === differentialId }));
  touch(session.state);
  return session.state;
}

export function selectWorkup(id: string, workupId: string, selected: boolean): SessionState {
  const session = getSession(id);
  session.state.workup = session.state.workup.map((item) => item.id === workupId ? { ...item, selected } : item);
  touch(session.state);
  return session.state;
}

export async function applyCoverage(id: string): Promise<SessionState> {
  const session = getSession(id);
  setIntegration(session.state, 'stedi', 'working', 'Running the current UHC test-mode 270/271 eligibility check…');
  touch(session.state);
  try {
    const { projection } = await checkEligibility();
    session.state.coverage = projection;
    session.state.workup = projectWorkup(session.state.workup, projection);
    session.state.status = 'planning';
    setIntegration(session.state, 'stedi', 'ready', `Current 271 received · ${projection.status} plan${projection.traceId ? ` · trace ${projection.traceId}` : ''}.`);
  } catch (error) {
    setIntegration(session.state, 'stedi', 'error', message(error));
    throw error;
  } finally {
    touch(session.state);
  }
  return session.state;
}

export async function finalizeSession(id: string): Promise<SessionState> {
  const session = getSession(id);
  if (!session.patient?.id) throw new Error('No loaded Medplum patient to finalize.');
  const selectedDx = session.state.differential.find((item) => item.selected);
  if (!selectedDx) throw new Error('Select the leading hypothesis before finalizing.');
  const selectedWorkup = session.state.workup.filter((item) => item.selected);
  if (!selectedWorkup.length) throw new Error('Select at least one proposed workup item.');
  setIntegration(session.state, 'medplum', 'working', 'Writing draft R4 chart documentation…');
  touch(session.state);
  const medplum = await getMedplum();
  const identifier = `house-md-session-${id}`;
  const impression: ClinicalImpression = {
    resourceType: 'ClinicalImpression',
    identifier: [{ system: 'https://house-md.demo/session', value: identifier }],
    status: 'completed',
    subject: { reference: `Patient/${session.patient.id}` },
    date: new Date().toISOString(),
    description: 'Clinician-arbitrated living differential council session',
    summary: `Leading hypothesis selected by the managing clinician: ${selectedDx.label}. The council considered ${session.state.differential.map((item) => item.label).join('; ')}. This is decision support, not a confirmed diagnosis.`,
    finding: session.state.differential.map((item) => ({ itemCodeableConcept: { text: item.label }, basis: item.rationale.text })),
    note: [{ text: `Presenting this to the patient: We discussed several possible explanations for your symptoms. The current leading possibility is ${selectedDx.label}, but it is not confirmed. We propose ${selectedWorkup.map((item) => item.label).join(', ')} to help distinguish the possibilities. Your clinician will review each next step with you.` }],
  };
  const savedImpression = await medplum.createResourceIfNoneExist(impression, `identifier=${encodeURIComponent(`https://house-md.demo/session|${identifier}`)}`);
  const created = [{ key: 'clinical-impression', label: 'ClinicalImpression', reference: `ClinicalImpression/${savedImpression.id}`, resource: savedImpression as Resource }];
  for (const item of selectedWorkup) {
    const requestIdentifier = `${identifier}-${item.id}`;
    const request: ServiceRequest = {
      resourceType: 'ServiceRequest',
      identifier: [{ system: 'https://house-md.demo/session-item', value: requestIdentifier }],
      status: 'draft',
      intent: 'proposal',
      code: { text: item.label },
      subject: { reference: `Patient/${session.patient.id}` },
      reasonReference: [{ reference: `ClinicalImpression/${savedImpression.id}` }],
      note: [{ text: `${item.rationale} Terminology coding requires clinician review.` }],
    };
    const saved = await medplum.createResourceIfNoneExist(request, `identifier=${encodeURIComponent(`https://house-md.demo/session-item|${requestIdentifier}`)}`);
    created.push({ key: item.id, label: item.label, reference: `ServiceRequest/${saved.id}`, resource: saved as Resource });
  }
  session.state.createdResources = created;
  session.state.status = 'finalized';
  setIntegration(session.state, 'medplum', 'ready', `${created.length} idempotent R4 resources are inspectable.`);
  touch(session.state);
  return session.state;
}

function initialState(id: string): SessionState {
  const integrations = Object.fromEntries(['medplum', 'deepgram', 'moss', 'stedi'].map((name) => [name, { state: 'idle', detail: 'Not started' }])) as SessionState['integrations'];
  return { id, status: 'loading', patient: null, presentation: '', transcript: '', seats: [], evidence: [], contributions: [], differential: [], workup: [], coverage: null, createdResources: [], integrations, revision: 0, updatedAt: new Date().toISOString() };
}

function setIntegration(state: SessionState, name: keyof SessionState['integrations'], status: SessionState['integrations'][typeof name]['state'], detail: string) {
  state.integrations[name] = { state: status, detail, updatedAt: new Date().toISOString() };
}

function touch(state: SessionState) { state.revision += 1; state.updatedAt = new Date().toISOString(); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function patientName(patient: Patient): string { const name = patient.name?.[0]; return [...(name?.given ?? []), name?.family].filter(Boolean).join(' ') || 'Synthetic patient'; }
function ageAt(birthDate?: string): number | undefined { if (!birthDate) return undefined; const birth = new Date(`${birthDate}T00:00:00Z`); const today = new Date(); let age = today.getUTCFullYear() - birth.getUTCFullYear(); if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1; return age; }

export interface CouncilUpdateInput {
  contributions: Array<{
    id?: string;
    personaId: string;
    leadingInterpretation: ClaimInput;
    strongestSupport: ClaimInput;
    contradiction: ClaimInput;
    discriminatingStep: ClaimInput;
    challenged?: boolean;
  }>;
  differential: Array<Omit<DifferentialItem, 'rationale'> & { rationale: ClaimInput }>;
}

export interface WorkupInput {
  id?: string;
  label: string;
  rationale: string;
  kind: WorkupItem['kind'];
  sequence: number;
  selected?: boolean;
  dependsOn?: string[];
}
