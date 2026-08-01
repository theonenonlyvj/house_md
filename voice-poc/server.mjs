// Deepgram + Moss voice playground — minimal server, keys stay server-side.
// Run: PATH="/opt/homebrew/opt/node/bin:$PATH" node server.mjs   (PORT=xxxx to override)
//
// Endpoints: /  /worklet.js  /samples/<clip>  /api/snippets
//            POST /api/speak  POST /api/transcribe  POST /api/search
//            WS /agent  — relay browser <-> wss://agent.deepgram.com/v1/agent/converse
// Wire facts (endpoint, Settings schema, event names) from ../notes/deepgram-cheatsheet.md,
// verified against live docs 2026-07-31.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4182; // 4181 = stedi-poc

function loadKey(name) {
  const env = readFileSync(join(ROOT, '..', '.env'), 'utf8');
  const line = env.split('\n').find(l => l.startsWith(name + '='));
  if (!line) throw new Error(`${name} not found in ../.env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}
const DG_KEY = loadKey('DEEPGRAM_API_KEY');

const SNIPPETS = JSON.parse(readFileSync(join(ROOT, 'data', 'snippets.json'), 'utf8')).snippets;

// TTS voices verified in cheatsheet §5; agent dropdown kept to aura-2 (agent example uses aura-2).
const TTS_VOICES = ['aura-2-thalia-en', 'aura-2-apollo-en', 'aura-2-andromeda-en', 'aura-asteria-en'];
const AGENT_VOICES = ['aura-2-thalia-en', 'aura-2-apollo-en', 'aura-2-andromeda-en'];
const KEYTERMS = ['impedance', 'ICD', 'A1c', 'palpitations', 'metoprolol'];

// ---------- canned synthetic record for the lookup_patient function call ----------
const PATIENT = {
  found: true,
  name: 'Maria Okafor', dob: '1961-09-22', age: 64, sex: 'F',
  problems: ['type 2 diabetes (2019)', 'hypertension (2017)', 'paroxysmal palpitations (2025)', 'stable exertional chest pain — stress echo negative 2026-03'],
  medications: ['metoprolol succinate 25 mg daily', 'metformin 1000 mg BID', 'atorvastatin 40 mg nightly'],
  allergies: ['carvedilol — intolerance (fatigue, dizziness)', 'penicillin — hives'],
  recentLabs: { 'A1c 2026-05-20': '6.8%', 'A1c 2025-11-02': '7.2%', 'LDL 2026-05-20': '88 mg/dL' },
  lastVisit: '2026-06-10 follow-up: chest pain resolved, walking 30 min daily, good med adherence',
  disclaimer: 'SYNTHETIC DEMO RECORD — not a real person',
};

const FUNCTION_DEFS = [{
  name: 'lookup_patient',
  description: 'Look up a patient chart by name. Returns problems, medications, allergies, recent labs, last visit.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Patient full or partial name' } },
    required: ['name'],
  },
}];

const FUNCTION_MAP = {
  lookup_patient: async (args) => {
    const q = String(args?.name || '').toLowerCase();
    if (q.includes('okafor') || q.includes('maria')) return PATIENT;
    return { found: false, note: 'No chart under that name. The only patient in this synthetic demo is Maria Okafor.' };
  },
};

// ---------- Moss (lazy import; agent-built module) with local keyword fallback ----------
let mossPromise = null;
function getMoss() {
  if (!mossPromise) {
    mossPromise = existsSync(join(ROOT, 'moss.mjs'))
      ? import('./moss.mjs').catch(err => ({ mossSearch: async () => ({ ok: false, error: 'moss.mjs failed to load: ' + err.message }) }))
      : Promise.resolve(null);
  }
  return mossPromise;
}

const tokenize = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []);
const DF = new Map(); // document frequency for idf-lite weighting
for (const sn of SNIPPETS) for (const t of new Set(tokenize(sn.text))) DF.set(t, (DF.get(t) || 0) + 1);

function localSearch(q, topK = 5) {
  const qt = [...new Set(tokenize(q))].filter(t => !['the', 'a', 'of', 'my', 'last', 'history'].includes(t));
  const scored = SNIPPETS.map(sn => {
    const tokens = new Set(tokenize(sn.text));
    let s = 0;
    for (const t of qt) if (tokens.has(t)) s += 1 / (DF.get(t) || 1);
    return { id: sn.id, text: sn.text, score: Number((s / Math.max(qt.length, 1)).toFixed(3)) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  return scored;
}

// ---------- HTTP plumbing ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(ROOT, 'index.html')));
    } else if (req.method === 'GET' && url.pathname === '/worklet.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(readFileSync(join(ROOT, 'worklet.js')));
    } else if (req.method === 'GET' && /^\/samples\/[a-z-]+\.mp3$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      res.end(readFileSync(join(ROOT, url.pathname.slice(1))));
    } else if (req.method === 'GET' && url.pathname === '/api/snippets') {
      json(res, 200, { snippets: SNIPPETS });

    } else if (req.method === 'POST' && url.pathname === '/api/speak') {
      let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'JSON body {text, voice} required' }); }
      const text = String(body.text || '').slice(0, 1900); // Aura REST cap is 2000 chars
      const voice = TTS_VOICES.includes(body.voice) ? body.voice : TTS_VOICES[0];
      if (!text.trim()) return json(res, 400, { error: 'text is empty' });
      const t0 = Date.now();
      const dg = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}`, {
        method: 'POST',
        headers: { Authorization: `Token ${DG_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000),
      });
      if (!dg.ok) return json(res, 502, { error: `Deepgram TTS HTTP ${dg.status}: ${(await dg.text()).slice(0, 300)}` });
      const audio = Buffer.from(await dg.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'X-Latency-Ms': String(Date.now() - t0), 'X-Voice': voice });
      res.end(audio);

    } else if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const audio = await readBody(req);
      if (!audio.length) return json(res, 400, { error: 'raw audio body required' });
      const useKeyterms = url.searchParams.get('keyterms') === '1';
      const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true' });
      if (useKeyterms) for (const k of KEYTERMS) params.append('keyterm', k);
      const t0 = Date.now();
      const dg = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: { Authorization: `Token ${DG_KEY}`, 'Content-Type': req.headers['content-type'] || 'application/octet-stream' },
        body: audio,
        signal: AbortSignal.timeout(60000),
      });
      const data = await dg.json();
      if (!dg.ok) return json(res, 502, { error: `Deepgram STT HTTP ${dg.status}`, detail: data });
      const alt = data.results?.channels?.[0]?.alternatives?.[0];
      json(res, 200, { transcript: alt?.transcript ?? '', confidence: alt?.confidence, ms: Date.now() - t0, keyterms: useKeyterms ? KEYTERMS : [] });

    } else if (req.method === 'POST' && url.pathname === '/api/search') {
      let body; try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'JSON body {q} required' }); }
      const q = String(body.q || '').slice(0, 500);
      if (!q.trim()) return json(res, 400, { error: 'q is empty' });
      const topK = Math.min(Number(body.topK) || 5, 10);
      const moss = await getMoss();
      if (moss?.mossSearch) {
        const r = await moss.mossSearch(q, topK).catch(err => ({ ok: false, error: String(err.message || err) }));
        if (r?.ok) return json(res, 200, { mode: 'moss', results: r.results, ms: r.ms });
        const t0 = Date.now();
        return json(res, 200, { mode: 'local-fallback', mossError: r?.error, results: localSearch(q, topK), ms: Date.now() - t0 });
      }
      const t0 = Date.now();
      json(res, 200, { mode: 'local-fallback', mossError: 'moss.mjs not present', results: localSearch(q, topK), ms: Date.now() - t0 });

    } else {
      res.writeHead(404);
      res.end('not found');
    }
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

// ---------- /agent WebSocket relay: browser <-> Deepgram Voice Agent ----------
// Browser sends: text {type:"start", prompt, voice, temperature, greeting} | {type:"stop"} | binary mic PCM (linear16@24k).
// Browser gets:  text {type:"status"|"dg"|"fncall", ...} | binary agent audio (linear16@24k).
const DG_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';

function buildSettings(cfg) {
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
        provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: Math.min(Math.max(Number(cfg.temperature) || 0.7, 0), 1.2) },
        prompt: String(cfg.prompt || 'You are a helpful clinical demo assistant. Keep replies to 1-3 short sentences.').slice(0, 24000),
        functions: FUNCTION_DEFS,
      },
      speak: { provider: { type: 'deepgram', model: AGENT_VOICES.includes(cfg.voice) ? cfg.voice : AGENT_VOICES[0] } },
      greeting: String(cfg.greeting || 'Voice playground online. How can I help?').slice(0, 300),
    },
  };
}

const wss = new WebSocketServer({ server, path: '/agent' });

wss.on('connection', (client) => {
  let dg = null, dgReady = false;
  const toClient = obj => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(obj)); };
  const closeDg = () => { dgReady = false; if (dg) { try { dg.close(); } catch {} dg = null; } };

  function startAgent(cfg) {
    closeDg();
    toClient({ type: 'status', state: 'connecting' });
    const sock = new WebSocket(DG_AGENT_URL, { headers: { Authorization: `Token ${DG_KEY}` } });
    dg = sock;

    sock.on('open', () => sock.send(JSON.stringify(buildSettings(cfg))));

    sock.on('message', async (data, isBinary) => {
      if (sock !== dg) return; // stale socket after a restart
      if (isBinary) { if (client.readyState === WebSocket.OPEN) client.send(data, { binary: true }); return; }
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'SettingsApplied') { dgReady = true; toClient({ type: 'status', state: 'ready' }); }

      if (msg.type === 'FunctionCallRequest') {
        for (const fn of msg.functions || []) {
          let args = {}; try { args = JSON.parse(fn.arguments || '{}'); } catch {}
          const impl = FUNCTION_MAP[fn.name];
          const result = impl ? await impl(args) : { error: `unknown function ${fn.name}` };
          sock.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify(result) }));
          toClient({ type: 'fncall', name: fn.name, args, result });
        }
        return;
      }
      toClient({ type: 'dg', event: msg }); // ConversationText, AgentThinking, LatencyReport, Error, ...
    });

    sock.on('error', err => { if (sock === dg) toClient({ type: 'status', state: 'error', detail: String(err.message || err) }); });
    sock.on('close', (code, reason) => { if (sock === dg) { dgReady = false; toClient({ type: 'status', state: 'closed', code, detail: String(reason || '') }); } });
  }

  client.on('message', (data, isBinary) => {
    if (isBinary) { if (dg && dgReady && dg.readyState === WebSocket.OPEN) dg.send(data); return; }
    let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'start') startAgent(msg);
    else if (msg.type === 'stop') { closeDg(); toClient({ type: 'status', state: 'stopped' }); }
    else if (msg.type === 'inject' && dg && dgReady && dg.readyState === WebSocket.OPEN) {
      // Text-instead-of-talk. InjectUserMessage type name is cheatsheet-verified; its
      // {content} field was confirmed empirically by test-agent.mjs against the live API.
      dg.send(JSON.stringify({ type: 'InjectUserMessage', content: String(msg.content || '').slice(0, 500) }));
    }
  });

  client.on('close', closeDg);
  client.on('error', closeDg);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use — rerun with PORT=<other> node server.mjs`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => console.log(`Voice POC → http://localhost:${PORT}`));

// Warmup: first Moss query downloads the index + model (~4s); do it now so panel searches are ~3ms.
getMoss().then(m => m?.mossSearch?.('warmup', 1)).then(r => {
  if (r) console.log(r.ok ? `Moss warm (${r.ms}ms first query)` : `Moss unavailable → local fallback (${r.error})`);
}).catch(() => {});
