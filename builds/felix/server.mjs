import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import next from 'next';
import { WebSocket, WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOSTNAME || '127.0.0.1';
loadRootEnv();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((req, res) => {
  if (req.url === '/case-presentation.wav') {
    const path = resolve(process.cwd(), '../../assets/audio/case-presentation.wav');
    if (!existsSync(path)) { res.writeHead(404); res.end('audio not found'); return; }
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' });
    res.end(readFileSync(path));
    return;
  }
  handle(req, res);
});

const wss = new WebSocketServer({ server, path: '/agent' });
const DG_URL = 'wss://agent.deepgram.com/v1/agent/converse';

const functions = [
  {
    name: 'search_patient_evidence',
    description: 'Search the current patient’s Moss index. Call this before making patient-specific claims.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'consult_council',
    description: 'Return seated persona instructions, empty seats, and evidence aliases. Use only aliases E1, E2, etc. in citations.',
    parameters: { type: 'object', properties: { specialty_ids: { type: 'array', items: { type: 'string' } } }, required: ['specialty_ids'] },
  },
  {
    name: 'update_differential',
    description: 'Persist structured specialist contributions and the newly ranked differential. Every patient-specific claim needs evidence aliases; use generalReasoning true only for general medical reasoning.',
    parameters: {
      type: 'object',
      properties: {
        contributions: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, personaId: { type: 'string' }, challenged: { type: 'boolean' },
          leadingInterpretation: { $ref: '#/$defs/claim' }, strongestSupport: { $ref: '#/$defs/claim' }, contradiction: { $ref: '#/$defs/claim' }, discriminatingStep: { $ref: '#/$defs/claim' },
        }, required: ['personaId', 'leadingInterpretation', 'strongestSupport', 'contradiction', 'discriminatingStep'] } },
        differential: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, label: { type: 'string' }, rank: { type: 'number' }, confidence: { type: 'string', enum: ['leading', 'considering', 'lower'] }, movement: { type: 'string', enum: ['up', 'down', 'new', 'same'] }, rationale: { $ref: '#/$defs/claim' },
        }, required: ['id', 'label', 'rank', 'confidence', 'movement', 'rationale'] } },
      },
      required: ['contributions', 'differential'],
      $defs: { claim: { type: 'object', properties: { text: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } }, generalReasoning: { type: 'boolean' } }, required: ['text'] } },
    },
  },
  {
    name: 'propose_workup',
    description: 'Persist the workup derived from the current differential. Put light-chain screening before any ATTR-directed scintigraphy. Do not invent billing or terminology codes.',
    parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, label: { type: 'string' }, rationale: { type: 'string' }, kind: { type: 'string', enum: ['lab', 'consult', 'imaging', 'other'] }, sequence: { type: 'number' }, selected: { type: 'boolean' }, dependsOn: { type: 'array', items: { type: 'string' } },
    }, required: ['id', 'label', 'rationale', 'kind', 'sequence'] } } }, required: ['items'] },
  },
];

const prompt = `You are House, M.D., chair of a clinician-led differential council. This is decision support, not diagnosis; the managing clinician decides. Speak in one or two short sentences while detailed reasoning goes to tool calls.

Workflow after the clinician presents and explicitly assembles the room:
1. Call search_patient_evidence with a query derived only from their words.
2. Call consult_council with relevant seated specialties.
3. Independently create each specialist’s contribution in the required shape, then call update_differential. Cite only aliases returned by consult_council. Unsupported patient claims will be demoted by the coordinator.
4. Briefly call out any empty seat. Challenge the lowest-cited or invalid claim only when warranted; never stage a quota.
5. Ask the clinician to select the leading hypothesis.
6. When redirected to planning, call propose_workup. Keep AL versus ATTR unresolved and sequence light-chain screening before PYP scintigraphy.
Never invent codes, coverage facts, record facts, or integration success. Never describe a hypothesis as confirmed.`;

wss.on('connection', (browser) => {
  let deepgram;
  let ready = false;
  const sendBrowser = (value) => browser.readyState === WebSocket.OPEN && browser.send(JSON.stringify(value));
  const closeDeepgram = () => { ready = false; if (deepgram) { try { deepgram.close(); } catch {} deepgram = undefined; } };

  const start = (sessionId) => {
    closeDeepgram();
    if (!process.env.DEEPGRAM_API_KEY) { sendBrowser({ type: 'status', state: 'error', detail: 'DEEPGRAM_API_KEY is not configured' }); return; }
    sendBrowser({ type: 'status', state: 'connecting' });
    const socket = new WebSocket(DG_URL, { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } });
    deepgram = socket;
    socket.on('open', () => socket.send(JSON.stringify({
      type: 'Settings',
      audio: { input: { encoding: 'linear16', sample_rate: 24000 }, output: { encoding: 'linear16', sample_rate: 24000, container: 'none' } },
      agent: {
        language: 'en',
        listen: { provider: { type: 'deepgram', model: 'nova-3', keyterms: ['amyloidosis', 'immunofixation', 'proteinuria', 'carpal tunnel', 'Tc-99m-PYP'] } },
        think: { provider: { type: 'open_ai', model: 'gpt-5-mini', temperature: 0.4 }, prompt, functions },
        speak: { provider: { type: 'deepgram', model: 'aura-2-apollo-en' } },
        greeting: 'The room is ready. Present the case, then assemble the council.',
      },
    })));
    socket.on('message', async (data, isBinary) => {
      if (socket !== deepgram) return;
      if (isBinary) { if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary: true }); return; }
      let event; try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === 'SettingsApplied') { ready = true; sendBrowser({ type: 'status', state: 'ready' }); }
      if (event.type === 'FunctionCallRequest') {
        for (const call of event.functions ?? []) {
          let args = {}; try { args = JSON.parse(call.arguments || '{}'); } catch {}
          const response = await dispatchFunction(sessionId, call.name, args);
          socket.send(JSON.stringify({ type: 'FunctionCallResponse', id: call.id, name: call.name, content: JSON.stringify(response) }));
          sendBrowser({ type: 'function', name: call.name, ok: !response.error });
        }
        return;
      }
      sendBrowser({ type: 'dg', event });
    });
    socket.on('error', (error) => socket === deepgram && sendBrowser({ type: 'status', state: 'error', detail: error.message }));
    socket.on('close', (code, reason) => socket === deepgram && sendBrowser({ type: 'status', state: 'closed', code, detail: reason.toString() }));
  };

  browser.on('message', (data, isBinary) => {
    if (isBinary) { if (deepgram?.readyState === WebSocket.OPEN && ready) deepgram.send(data); return; }
    let event; try { event = JSON.parse(data.toString()); } catch { return; }
    if (event.type === 'start') start(String(event.sessionId || 'demo-session'));
    if (event.type === 'inject' && ready && deepgram?.readyState === WebSocket.OPEN) deepgram.send(JSON.stringify({ type: 'InjectUserMessage', content: String(event.content || '').slice(0, 800) }));
    if (event.type === 'stop') closeDeepgram();
  });
  browser.on('close', closeDeepgram);
  browser.on('error', closeDeepgram);
});

async function dispatchFunction(sessionId, name, args) {
  try {
    const path = name === 'search_patient_evidence' ? '/api/session/evidence' : '/api/agent';
    const body = name === 'search_patient_evidence' ? { id: sessionId, query: args.query } : { id: sessionId, action: name, payload: args };
    const response = await fetch(`http://${hostname}:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) return { error: value.error || `${name} failed` };
    if (name === 'search_patient_evidence') return { query: value.evidenceSearch?.query, scanned: value.evidenceSearch?.scanned, hits: value.evidence.map(({ alias, resourceType, title, summary, date }) => ({ alias, resourceType, title, summary, date })) };
    return value;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

server.listen(port, hostname, () => console.log(`house_md → http://${hostname}:${port}`));

function loadRootEnv() {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  const path = candidates.find(existsSync);
  if (!path) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
