import 'server-only';
import { ClientStorage, MedplumClient, MemoryStorage } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import { CASE_CONFIG } from '@/config/case';
import { env } from './env';

let clientPromise: Promise<MedplumClient> | null = null;

export function getMedplum(): Promise<MedplumClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new MedplumClient({ baseUrl: 'https://api.medplum.com/', storage: new ClientStorage(new MemoryStorage()) });
      await client.startClientLogin(env('MEDPLUM_CLIENT_ID'), env('MEDPLUM_CLIENT_SECRET'));
      return client;
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function loadCaseRecord(): Promise<{ patient: Patient; resources: Resource[] }> {
  const medplum = await getMedplum();
  const patients = await medplum.searchResources('Patient', new URLSearchParams({
    identifier: `${CASE_CONFIG.patientIdentifierSystem}|${CASE_CONFIG.patientIdentifierValue}`,
  }));
  const patient = patients[0];
  if (!patient?.id) throw new Error('Synthetic Jane Doe was not found in hosted Medplum. Run the atomic seed/index script first.');

  const patientRef = `Patient/${patient.id}`;
  const searchPlan: Array<[string, string]> = [
    ['Condition', 'patient'],
    ['Observation', 'patient'],
    ['Procedure', 'patient'],
    ['Encounter', 'patient'],
    ['DiagnosticReport', 'patient'],
  ];
  const groups = await Promise.all(searchPlan.map(([type, param]) => medplum.searchResources(type as Resource['resourceType'], new URLSearchParams({ [param]: patientRef, _count: '100' }))));
  return { patient, resources: [patient, ...groups.flat()] };
}

export function resourceDisplay(resource: Resource): { title: string; summary: string; date?: string } {
  const value = resource as unknown as Record<string, unknown>;
  const code = value.code as { text?: string; coding?: Array<{ display?: string }> } | undefined;
  const title = code?.text ?? code?.coding?.[0]?.display ?? textFrom(value.type) ?? resource.resourceType;
  const summary =
    textFrom(value.valueCodeableConcept) ??
    String(value.valueString ?? '') ??
    textFrom(value.conclusionCode) ??
    String(value.conclusion ?? '') ??
    textFrom(value.reasonCode) ??
    title;
  const period = value.period as { start?: string } | undefined;
  const date = String(value.effectiveDateTime ?? value.issued ?? value.performedDateTime ?? value.recordedDate ?? period?.start ?? '');
  return { title, summary: summary || title, date: date || undefined };
}

function textFrom(value: unknown): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join('; ') || undefined;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return undefined;
  const obj = value as { text?: string; coding?: Array<{ display?: string }> };
  return obj.text ?? obj.coding?.map((item) => item.display).filter(Boolean).join('; ') ?? undefined;
}
