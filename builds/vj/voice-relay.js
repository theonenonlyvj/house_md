// Browser ⇄ Deepgram Voice Agent relay. Lifted/adapted from voice-poc/server.mjs
// (verified today). The permanent key stays server-side; the browser speaks our
// simplified protocol. Filled in at the voice gate — until then a stub that reports
// readiness so the UI can render honest status.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadEnvKey(name) {
  try {
    const env = readFileSync(join(import.meta.dirname, '..', '..', '.env'), 'utf8');
    const m = env.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

export function attachVoiceRelay(wss) {
  wss.on('connection', (ws) => {
    const hasKey = Boolean(loadEnvKey('DEEPGRAM_API_KEY'));
    ws.send(JSON.stringify({ type: 'status', ready: false, hasKey, note: 'relay stub — wired at voice gate' }));
  });
}
