import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const path = candidates.find(existsSync);
  if (!path) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

export function env(name: string): string {
  loadRootEnv();
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function hasEnv(...names: string[]): boolean {
  loadRootEnv();
  return names.every((name) => Boolean(process.env[name]));
}
