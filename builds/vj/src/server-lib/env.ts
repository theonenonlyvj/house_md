import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keys live in the repo-root .env (two levels up from builds/vj). Never log values.
// No caching: keys added to .env mid-session apply on the next call, no restart.
export function envKeys(): Record<string, string> {
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
  return out;
}

export const key = (name: string): string => envKeys()[name] || '';
