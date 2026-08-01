import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keys live in the repo-root .env (two levels up from builds/vj). Never log values.
let cache: Record<string, string> | null = null;

export function envKeys(): Record<string, string> {
  if (cache) return cache;
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(join(process.cwd(), '..', '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    // missing .env → keys absent; callers surface visible failure states
  }
  cache = out;
  return out;
}

export const key = (name: string): string => envKeys()[name] || '';
