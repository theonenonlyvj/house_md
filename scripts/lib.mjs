import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

export function loadEnv() {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) throw new Error('Root .env is missing. Copy .env.example and obtain values out-of-band.');
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

export function requiredEnv(name) {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured in root .env`);
  return value;
}

export async function medplumToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: requiredEnv('MEDPLUM_CLIENT_ID'), client_secret: requiredEnv('MEDPLUM_CLIENT_SECRET') });
  const response = await fetch('https://api.medplum.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(`Medplum authentication failed (${response.status})`);
  return payload.access_token;
}

export async function fhir(token, path, init = {}) {
  const response = await fetch(`https://api.medplum.com/fhir/R4/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/fhir+json', ...(init.body ? { 'Content-Type': 'application/fhir+json' } : {}), ...init.headers },
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Medplum ${init.method ?? 'GET'} ${path} failed (${response.status}): ${payload.issue?.[0]?.diagnostics ?? 'unknown error'}`);
  return payload;
}

export async function upsertByIdentifier(token, resource, identifier) {
  const systemAndValue = `${identifier.system}|${identifier.value}`;
  const found = await fhir(token, `${resource.resourceType}?identifier=${encodeURIComponent(systemAndValue)}&_count=1`);
  const existing = found.entry?.[0]?.resource;
  if (existing?.id) return fhir(token, `${resource.resourceType}/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...resource, id: existing.id, meta: existing.meta }) });
  return fhir(token, resource.resourceType, { method: 'POST', body: JSON.stringify(resource), headers: { 'If-None-Exist': `identifier=${encodeURIComponent(systemAndValue)}` } });
}

export const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
