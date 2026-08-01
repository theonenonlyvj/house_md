// moss.mjs — semantic retrieval over Moss (https://docs.moss.dev) for the voice PoC.
//
// Exports:
//   mossSearch(query, topK = 5) -> { ok: true, results: [{ id, text, score }], ms }
//                                | { ok: false, error: "..." }   (never throws)
//   mossIndexAll()              -> (re)indexes data/snippets.json into the 'voice-poc'
//                                  index (build time only; ~10-20 s server-side build)
//   mossClose()                 -> releases the SDK's native resources so the process
//                                  can exit cleanly (call in one-off scripts/tests)
//
// Architecture (verified live 2026-08-01): Moss queries run LOCALLY — the SDK
// (@moss-dev/moss, Rust core) downloads the index on loadIndex() and embeds +
// searches in-process (~1-10 ms after the first call). Mutations (createIndex/
// addDocs) are async server-side builds against https://service.usemoss.dev/v1.
// Credentials go only to Moss's own API via the SDK.
//
// Docs: https://docs.moss.dev/docs/start/quickstart
//       https://docs.moss.dev/docs/reference/js/api

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MossClient } from '@moss-dev/moss';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX_NAME = 'voice-poc';
const SNIPPETS_PATH = join(HERE, 'data', 'snippets.json');

// Same pattern as stedi-poc/server.mjs loadKey(): read ../.env, find line, strip quotes.
function loadEnv(name) {
  const env = readFileSync(join(HERE, '..', '.env'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith(name + '='));
  if (!line) throw new Error(name + ' not found in ../.env');
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}

let client = null;
let loadPromise = null;

function getClient() {
  if (!client) {
    client = new MossClient(loadEnv('MOSS_PROJECT_ID'), loadEnv('MOSS_PROJECT_KEY'));
  }
  return client;
}

// Load the index into memory exactly once (concurrent-safe). First call pays
// the download + model load (~seconds); after that queries are in-memory.
function ensureLoaded(c) {
  if (!loadPromise) {
    loadPromise = c.loadIndex(INDEX_NAME).catch((err) => {
      loadPromise = null; // allow retry on next call
      throw err;
    });
  }
  return loadPromise;
}

export async function mossSearch(query, topK = 5) {
  const t0 = performance.now();
  try {
    const c = getClient();
    await ensureLoaded(c);
    const res = await c.query(INDEX_NAME, query, { topK });
    const ms = Math.round(performance.now() - t0);
    const results = (res.docs ?? []).map((d) => ({ id: d.id, text: d.text, score: d.score }));
    return { ok: true, results, ms };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function mossIndexAll() {
  try {
    const { snippets } = JSON.parse(readFileSync(SNIPPETS_PATH, 'utf8'));
    const docs = snippets.map((s) => ({ id: s.id, text: s.text, metadata: { tag: s.tag } }));
    const c = getClient();
    try {
      // createIndex throws if the index already exists — fall through to upsert.
      const r = await c.createIndex(INDEX_NAME, docs, { modelId: 'moss-minilm' });
      return { ok: true, created: true, docCount: r.docCount, jobId: r.jobId };
    } catch (err) {
      if (!/exist/i.test(String(err?.message ?? err))) throw err;
      const r = await c.addDocs(INDEX_NAME, docs, { upsert: true });
      loadPromise = null; // force a fresh loadIndex on next search
      return { ok: true, created: false, docCount: r.docCount, jobId: r.jobId };
    }
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function mossClose() {
  if (client) {
    const c = client;
    client = null;
    loadPromise = null;
    await c.close();
  }
}
