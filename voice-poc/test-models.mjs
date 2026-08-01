// Direct-to-Deepgram model shootout — tests which managed think models actually
// work on this account's credits for clinical reasoning. No local server needed.
// Run: PATH="/opt/homebrew/opt/node/bin:$PATH" node test-models.mjs
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
function loadKey(name) {
  if (process.env[name]) return process.env[name];
  const envPath = join(ROOT, '..', '.env');
  try {
    const env = readFileSync(envPath, 'utf8');
    const line = env.split('\n').find(l => l.startsWith(name + '='));
    if (!line) throw new Error(`${name} not in .env`);
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    throw new Error(`${name} not in env or .env (no .env at ${envPath})`);
  }
}
const KEY = loadKey('DEEPGRAM_API_KEY');
const DG_URL = 'wss://agent.deepgram.com/v1/agent/converse';

// A real council-style prompt: cited clinical argumentation across personas.
const COUNCIL_PROMPT = `You are the chair of a clinical council debating a differential for a 55-year-old woman with progressive exertional dyspnea, bilateral leg edema, preserved ejection fraction, and increased LV wall thickness disproportionate to her hypertension.

Available specialist personas: cardiologist, nephrologist, neurologist, hematologist.

Respond as ONE specialist (the cardiologist) in this exact JSON shape and nothing else:
{"specialist":"cardiologist","leading_interpretation":"<one sentence>","supporting_evidence":"<one sentence citing a finding>","contradiction":"<one sentence>","discriminating_question":"<one sentence>"}

Keep each field to one sentence. Do not narrate. Output only the JSON.`;

const INJECT = 'Give me the cardiologist argument now.';

const MODELS = [
  { type: 'open_ai', model: 'gpt-4o-mini' },                          // baseline (old plan default)
  { type: 'open_ai', model: 'gpt-5-mini' },                            // chosen council brain (default reasoning_mode)
  { type: 'open_ai', model: 'gpt-5-mini', reasoning_mode: 'low' },     // specialist lines (latency-critical)
  { type: 'open_ai', model: 'gpt-5-mini', reasoning_mode: 'medium' },  // chair synthesis (quality-critical)
  { type: 'open_ai', model: 'gpt-5.4-nano' },                          // chair candidate (smallest/fastest Standard)
  { type: 'anthropic', model: 'claude-haiku-4-5' },                    // fallback #1
  { type: 'anthropic', model: 'claude-sonnet-5' },                     // escalation only
  { type: 'google', model: 'gemini-2.5-flash' },                       // chair candidate
];

function buildSettings(provider) {
  const { type, model, reasoning_mode } = provider;
  const thinkProvider = { type, model, temperature: 0.4 };
  if (reasoning_mode) thinkProvider.reasoning_mode = reasoning_mode;
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: 24000 },
      output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
    },
    agent: {
      language: 'en',
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think: {
        provider: thinkProvider,
        prompt: COUNCIL_PROMPT,
      },
      speak: { provider: { type: 'deepgram', model: 'aura-2-apollo-en' } },
      greeting: 'Council ready.',
    },
  };
}

function testModel(provider, label) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const result = { label, provider, ok: false, settingsApplied: false, transcript: [], audioBytes: 0, ms: 0, error: null };
    let injected = false, settled = false;
    const sock = new WebSocket(DG_URL, { headers: { Authorization: `Token ${KEY}` } });

    const finish = (r) => {
      if (settled) return;
      settled = true;
      result.ms = Date.now() - t0;
      try { sock.close(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ...result, ok: false, error: 'timeout 45s' }), 45000);

    sock.on('open', () => sock.send(JSON.stringify(buildSettings(provider))));

    sock.on('message', (data, isBinary) => {
      if (isBinary) { result.audioBytes += data.length; return; }
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'SettingsApplied') {
        result.settingsApplied = true;
        setTimeout(() => {
          if (!injected) {
            injected = true;
            sock.send(JSON.stringify({ type: 'InjectUserMessage', content: INJECT }));
          }
        }, 800);
      } else if (msg.type === 'ConversationText') {
        result.transcript.push(`${msg.role}: ${msg.content}`);
        if (msg.role === 'assistant' && msg.content && !/council ready/i.test(msg.content)) {
          result.ok = true;
          clearTimeout(timer);
          setTimeout(() => finish(result), 1500);
        }
      } else if (msg.type === 'Error') {
        result.error = JSON.stringify(msg);
        clearTimeout(timer);
        finish(result);
      } else if (msg.type === 'Warning' && msg.code === 'THINK_REQUEST_FAILED') {
        result.error = (result.error || '') + ' THINK_REQUEST_FAILED:' + (msg.message || '');
      }
    });

    sock.on('error', (e) => { clearTimeout(timer); finish({ ...result, ok: false, error: 'ws: ' + e.message }); });
    sock.on('close', () => { if (!settled) finish(result); });
  });
}

console.log(`Testing ${MODELS.length} managed think models on Deepgram credits…\n`);
const results = [];
for (const m of MODELS) {
  const label = `${m.type}/${m.model}${m.reasoning_mode ? ` (${m.reasoning_mode})` : ''}`;
  process.stdout.write(`${label.padEnd(40)} … `);
  const r = await testModel(m, label);
  results.push(r);
  const verdict = r.ok
    ? `OK  ${r.ms}ms  audio=${r.audioBytes}B  reply="${(r.transcript.find(t => t.startsWith('assistant:')) || '').slice(0, 120)}…"`
    : `FAIL  ${r.ms}ms  ${r.error || 'no assistant reply'}`;
  console.log(verdict + '\n');
}

console.log('=== SUMMARY ===');
for (const r of results) {
  console.log(`${r.label.padEnd(40)} ${r.ok ? 'PASS' : 'FAIL'}  ${r.settingsApplied ? 'settings-ok' : 'no-settings'}  ${r.ms}ms`);
  if (r.transcript.length) {
    const reply = r.transcript.find(t => t.startsWith('assistant:'));
    if (reply) console.log(`  reply: ${reply.slice(0, 200)}`);
  }
}
