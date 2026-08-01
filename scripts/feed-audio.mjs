// Prerecorded-input feeder — streams assets/audio/case-presentation.wav through the
// live Deepgram Voice Agent pipeline (PLAN-FINAL §5/§6: prerecorded clinician audio is
// the only input fallback; the pipeline stays fully live).
//
// Run: PATH="/opt/homebrew/opt/node/bin:$PATH" node scripts/feed-audio.mjs [wav-path]
//
// Flow: connect wss://agent.deepgram.com/v1/agent/converse → send Settings (nova-3 /
// managed gpt-5-mini / aura-2) → WAIT for SettingsApplied → stream WAV PCM (44-byte
// header stripped) as binary frames, 1920 bytes per 40ms (real-time linear16@24k mono)
// → trailing zero-silence frames (endpointing) → print every ConversationText and
// FunctionCallRequest → exit 0 on first full assistant ConversationText.
// Wire facts from docs/notes/deepgram-cheatsheet.md (SettingsApplied gate, short-form
// event names, stringified fn args) and voice-poc/{server,test-models}.mjs.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadKey(name) {
  if (process.env[name]) return process.env[name];
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  const line = env.split('\n').find(l => l.startsWith(name + '='));
  if (!line) throw new Error(`${name} not found in .env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}
const KEY = loadKey('DEEPGRAM_API_KEY');
const DG_URL = 'wss://agent.deepgram.com/v1/agent/converse';

const WAV_PATH = process.argv[2] || join(ROOT, 'assets', 'audio', 'case-presentation.wav');
const wav = readFileSync(WAV_PATH);

// --- sanity-check the header so declared format matches actual bytes (failure mode #1) ---
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
  console.error(`FAIL: ${WAV_PATH} is not a RIFF/WAVE file`);
  process.exit(1);
}
const fmt = { audioFormat: wav.readUInt16LE(20), channels: wav.readUInt16LE(22), rate: wav.readUInt32LE(24), bits: wav.readUInt16LE(34) };
if (fmt.audioFormat !== 1 || fmt.channels !== 1 || fmt.rate !== 24000 || fmt.bits !== 16) {
  console.error(`FAIL: WAV is not linear16 mono 24kHz — got ${JSON.stringify(fmt)}`);
  process.exit(1);
}
const pcm = wav.subarray(44); // Deepgram TTS writes placeholder RIFF/data sizes; real length = file length
const CHUNK = 1920;           // 24000 Hz * 2 B * 0.040 s — one 40 ms frame
const FRAME_MS = 40;
console.log(`wav ok: ${WAV_PATH} — linear16 mono 24kHz, ${pcm.length} PCM bytes (${(pcm.length / 48000).toFixed(1)}s)`);

// --- Settings (PLAN-FINAL §6 model stack; shape live-verified in voice-poc) ---
const PROMPT =
  'You are the chair of a hospital diagnostic council. A clinician has just presented a case aloud. ' +
  'Respond as the attending chair: acknowledge the presentation and give your initial differential ' +
  'considerations in 2-3 short sentences. Never present any diagnosis as confirmed.';

function buildSettings(thinkProvider) {
  return {
    type: 'Settings',
    audio: {
      input: { encoding: 'linear16', sample_rate: 24000 },
      output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
    },
    agent: {
      language: 'en',
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think: { provider: thinkProvider, prompt: PROMPT },
      speak: { provider: { type: 'deepgram', model: 'aura-2-thalia-en' } },
      // no greeting — the first assistant ConversationText must be the live response to the audio
    },
  };
}

// PLAN-FINAL §6. No temperature: live-verified 2026-08-01 that gpt-5-mini rejects any
// non-default temperature at think time ("Only the default (1) value is supported").
const THINK_PRIMARY = { type: 'open_ai', model: 'gpt-5-mini' };
const THINK_FALLBACK = { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0.5 }; // exact config test-agent.mjs exercised via server.mjs

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = t0 => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

function attempt(thinkProvider) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const label = `${thinkProvider.type}/${thinkProvider.model}`;
    const out = { ok: false, thinkRejected: false, error: null, firstUser: null, firstAssistant: null, msToAssistant: null, audioBytes: 0 };
    let settingsApplied = false, streaming = false, settled = false, stopSilence = false;

    console.log(`\n=== attempt: think=${label} ===`);
    const sock = new WebSocket(DG_URL, { headers: { Authorization: `Token ${KEY}` } });

    const finish = () => {
      if (settled) return;
      settled = true;
      stopSilence = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      resolve(out);
    };
    const timer = setTimeout(() => {
      out.error = out.error || `timeout: no full assistant ConversationText within 60s (settingsApplied=${settingsApplied}, streamed=${streaming}, userText=${!!out.firstUser})`;
      finish();
    }, 60000);

    async function streamAudio() {
      streaming = true;
      console.log(`[${ts(t0)}] streaming ${Math.ceil(pcm.length / CHUNK)} frames at real-time pace…`);
      const start = Date.now();
      let i = 0;
      for (let off = 0; off < pcm.length; off += CHUNK, i++) {
        if (settled || sock.readyState !== WebSocket.OPEN) return;
        sock.send(pcm.subarray(off, Math.min(off + CHUNK, pcm.length)));
        const target = start + (i + 1) * FRAME_MS; // drift-corrected pacing
        const wait = target - Date.now();
        if (wait > 0) await sleep(wait);
      }
      console.log(`[${ts(t0)}] audio done (${((Date.now() - start) / 1000).toFixed(1)}s wall) — sending silence for endpointing…`);
      // ~2s of zero-silence, then keep trickling silence like a live open mic so the
      // turn reliably endpoints (failure mode: turn never endpoints without input flow).
      const zero = Buffer.alloc(CHUNK);
      for (let f = 0; !stopSilence && sock.readyState === WebSocket.OPEN; f++) {
        sock.send(zero);
        await sleep(FRAME_MS);
        if (f === 49) console.log(`[${ts(t0)}] 2s silence sent — holding open, mic-style silence continues…`);
      }
    }

    sock.on('open', () => {
      console.log(`[${ts(t0)}] connected — sending Settings`);
      sock.send(JSON.stringify(buildSettings(thinkProvider)));
    });

    sock.on('message', (data, isBinary) => {
      if (isBinary) { out.audioBytes += data.length; return; }
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }

      switch (msg.type) {
        case 'Welcome':
          console.log(`[${ts(t0)}] Welcome (request_id ${msg.request_id || '?'}) — waiting for SettingsApplied before streaming`);
          break;
        case 'SettingsApplied':
          settingsApplied = true;
          console.log(`[${ts(t0)}] SettingsApplied — ${label} accepted`);
          streamAudio().catch(e => { out.error = 'stream: ' + e.message; finish(); });
          break;
        case 'ConversationText':
          console.log(`[${ts(t0)}] ${msg.role}: ${msg.content}`);
          if (msg.role === 'user' && !out.firstUser) out.firstUser = msg.content;
          if (msg.role === 'assistant' && msg.content && msg.content.trim()) {
            if (!out.firstAssistant) {
              out.firstAssistant = msg.content;
              out.msToAssistant = Date.now() - t0;
            }
            out.ok = true;
            setTimeout(finish, 1200); // let any immediate follow-up events land, then exit green
          }
          break;
        case 'FunctionCallRequest':
          console.log(`[${ts(t0)}] FunctionCallRequest: ${JSON.stringify(msg.functions || msg)}`);
          break;
        case 'UserStartedSpeaking':
        case 'AgentThinking':
        case 'AgentStartedSpeaking':
        case 'AgentAudioDone':
          console.log(`[${ts(t0)}] ${msg.type}`);
          break;
        case 'Warning':
          console.log(`[${ts(t0)}] Warning: ${JSON.stringify(msg)}`);
          if (msg.code === 'THINK_REQUEST_FAILED') { out.thinkRejected = true; out.error = 'THINK_REQUEST_FAILED: ' + (msg.message || ''); finish(); }
          break;
        case 'Error':
          console.log(`[${ts(t0)}] Error: ${JSON.stringify(msg)}`);
          out.error = JSON.stringify(msg);
          if (!settingsApplied || /think|model|provider/i.test(JSON.stringify(msg))) out.thinkRejected = true;
          finish();
          break;
        case 'History':
        case 'LatencyReport':
          break; // cheatsheet addendum: safe to ignore
        default:
          console.log(`[${ts(t0)}] event: ${msg.type}`);
      }
    });

    sock.on('error', e => { out.error = 'ws: ' + e.message; finish(); });
    sock.on('close', (code, reason) => {
      if (!settled) {
        out.error = out.error || `socket closed (${code} ${reason || ''}) before assistant reply`;
        if (!settingsApplied) out.thinkRejected = true;
        finish();
      }
    });
  });
}

let think = THINK_PRIMARY;
let r = await attempt(think);
if (!r.ok && r.thinkRejected) {
  console.log(`\n${THINK_PRIMARY.model} rejected — falling back to ${THINK_FALLBACK.model} (test-agent.mjs config)`);
  think = THINK_FALLBACK;
  r = await attempt(think);
}

console.log('\n=== RESULT ===');
console.log(`think model used:        ${think.type}/${think.model}`);
console.log(`user transcript:         ${r.firstUser ?? '(none)'}`);
console.log(`first assistant text:    ${r.firstAssistant ?? '(none)'}`);
console.log(`ms to assistant text:    ${r.msToAssistant ?? '-'} (from ws connect)`);
console.log(`agent audio bytes:       ${r.audioBytes}`);
if (r.ok && r.firstUser) {
  console.log('PASS — live pipeline round-trip: prerecorded audio → user transcript → assistant reply');
  process.exit(0);
}
console.log(`FAIL — ${r.error || (r.ok ? 'assistant replied but no user transcript (audio not recognized?)' : 'no assistant reply')}`);
process.exit(1);
