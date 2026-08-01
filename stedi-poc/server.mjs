// Stedi test-mode eligibility demo — minimal server, key stays server-side.
// Run: PATH="/opt/homebrew/opt/node/bin:$PATH" node server.mjs   (PORT=xxxx to override)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, X12_SAMPLE } from './scenarios.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4181;
const TIMEOUT = AbortSignal.timeout;

// Endpoints verified from live Stedi docs 2026-08-01 (see README).
const ELIGIBILITY_URL = 'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3';
const MCP_URL = 'https://mcp.us.stedi.com/2025-07-11/mcp';

function loadKey() {
  const env = readFileSync(join(ROOT, '..', '.env'), 'utf8');
  const line = env.split('\n').find(l => l.startsWith('STEDI_TEST_API_KEY='));
  if (!line) throw new Error('STEDI_TEST_API_KEY not found in ../.env');
  return line.slice('STEDI_TEST_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}
const API_KEY = loadKey();

// ---------- REST transport ----------

async function restCheck(payload, path = '') {
  const res = await fetch(ELIGIBILITY_URL + path, {
    method: 'POST',
    headers: { Authorization: `Key ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: TIMEOUT(20000),
  });
  return { httpStatus: res.status, data: await res.json() };
}

// ---------- MCP transport (Streamable HTTP, SSE responses) ----------

let mcpSessionPromise = null; // promise-as-mutex: concurrent callers share one init
let mcpId = 10;

function parseSse(text, wantId) {
  const frames = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.replace(/^data:\s?/, ''));
  if (!frames.length) return JSON.parse(text); // plain JSON fallback
  const msgs = frames.map(f => { try { return JSON.parse(f); } catch { return null; } }).filter(Boolean);
  return msgs.find(m => wantId != null && m.id === wantId) ?? msgs[msgs.length - 1];
}

async function mcpRequest(body, session) {
  const headers = { Authorization: API_KEY, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session) headers['Mcp-Session-Id'] = session;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: TIMEOUT(20000) });
  const text = await res.text();
  if (!res.ok && res.status !== 404 && res.status !== 400)
    throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 200)}`);
  return { status: res.status, text };
}

async function mcpInit() {
  const res = await mcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'stedi-poc', version: '0.2' } } });
  const msg = parseSse(res.text, 1);
  if (msg.error) throw new Error(`MCP init failed: ${msg.error.message}`);
  return null; // Stedi's server issues no session id; header capture kept out for simplicity
}

async function mcpCall(method, params) {
  if (!mcpSessionPromise) mcpSessionPromise = mcpInit().catch(err => { mcpSessionPromise = null; throw err; });
  const session = await mcpSessionPromise;
  const id = ++mcpId;
  const res = await mcpRequest({ jsonrpc: '2.0', id, method, params }, session);
  const msg = parseSse(res.text, id);
  if (msg.error) throw new Error(`MCP error: ${msg.error.message}`);
  return msg.result;
}

async function mcpToolCall(name, args) {
  const result = await mcpCall('tools/call', { name, arguments: args });
  const content = result?.content?.[0]?.text ?? '';
  try { return { isError: !!result?.isError, data: JSON.parse(content) }; }
  catch { return { isError: !!result?.isError, data: { raw: content } }; }
}

let promptsCache = null;
async function mcpPrompts() {
  if (promptsCache) return promptsCache;
  const list = await mcpCall('prompts/list', {});
  const prompts = [];
  for (const p of list?.prompts || []) {
    try {
      const got = await mcpCall('prompts/get', { name: p.name });
      prompts.push({ name: p.name, description: p.description || '',
        text: (got?.messages || []).map(m => m.content?.text || '').join('\n') });
    } catch { prompts.push({ name: p.name, description: p.description || '', text: '(could not fetch)' }); }
  }
  promptsCache = prompts;
  return prompts;
}

// ---------- HTTP server ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
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
      const html = readFileSync(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.method === 'GET' && url.pathname === '/api/scenarios') {
      json(res, 200, { scenarios: SCENARIOS, x12Label: X12_SAMPLE.label });
    } else if (req.method === 'POST' && url.pathname === '/api/check') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'POST body must be JSON: {request, transport}' }); }
      if (!body?.request?.tradingPartnerServiceId) return json(res, 400, { error: 'missing request.tradingPartnerServiceId' });
      const t0 = Date.now();
      if (body.transport === 'mcp') {
        const { isError, data } = await mcpToolCall('eligibility_check', body.request);
        json(res, 200, { transport: 'mcp', isError, ms: Date.now() - t0, data });
      } else {
        const { httpStatus, data } = await restCheck(body.request);
        json(res, 200, { transport: 'rest', httpStatus, ms: Date.now() - t0, data });
      }
    } else if (req.method === 'POST' && url.pathname === '/api/check-x12') {
      const t0 = Date.now();
      const { httpStatus, data } = await restCheck({ x12: X12_SAMPLE.x12 }, '/raw-x12');
      json(res, 200, { transport: 'raw-x12', httpStatus, ms: Date.now() - t0, data, sentX12: X12_SAMPLE.x12 });
    } else if (req.method === 'GET' && url.pathname === '/api/payer-search') {
      const q = url.searchParams.get('q') || '';
      if (!q) return json(res, 400, { error: 'missing ?q=' });
      const { isError, data } = await mcpToolCall('search_for_payer', { query: q });
      json(res, 200, { isError, data });
    } else if (req.method === 'GET' && url.pathname === '/api/mcp-prompts') {
      json(res, 200, { prompts: await mcpPrompts() });
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use — rerun with PORT=<other> node server.mjs`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => console.log(`Stedi POC → http://localhost:${PORT}`));
