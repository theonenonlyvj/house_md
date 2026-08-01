import { key } from './env';

// Minimal hosted-Medplum client: client-credentials token (cached) + FHIR R4 REST.
const BASE = 'https://api.medplum.com';
let tok: { value: string; exp: number } | null = null;

export async function medplumToken(): Promise<string> {
  if (tok && Date.now() < tok.exp) return tok.value;
  const id = key('MEDPLUM_CLIENT_ID');
  const secret = key('MEDPLUM_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Medplum credentials missing from .env');
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Medplum auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tok = { value: data.access_token, exp: Date.now() + (data.expires_in - 300) * 1000 };
  return tok.value;
}

async function fhir(path: string, init?: RequestInit): Promise<any> {
  const t = await medplumToken();
  const res = await fetch(`${BASE}/fhir/R4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/fhir+json',
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Medplum ${init?.method || 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export const fhirSearch = (type: string, params: string) => fhir(`${type}?${params}`);
export const fhirRead = (type: string, id: string) => fhir(`${type}/${id}`);

export async function fhirCreate(resource: any, ifNoneExist?: string): Promise<any> {
  return fhir(resource.resourceType, {
    method: 'POST',
    body: JSON.stringify(resource),
    headers: ifNoneExist ? { 'If-None-Exist': ifNoneExist } : undefined,
  });
}
