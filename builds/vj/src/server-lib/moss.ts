import { key } from './env';
import type { LoadedChart } from './chart';
import type { EvidenceRef } from '../shared/types';

// Moss semantic retrieval over the loaded chart (pattern lifted from voice-poc/moss.mjs,
// verified live today). Mutations are async server-side builds; queries run locally
// after loadIndex. While the index builds, callers fall back to local keyword search —
// every search is labeled with its true source.

const INDEX = 'housemd-vj-chart';
const g = globalThis as any;

interface MossState {
  client: any | null;
  ready: boolean;
  kicked: boolean;
  loadPromise: Promise<void> | null;
}
if (!g.__housemd_moss) g.__housemd_moss = { client: null, ready: false, kicked: false, loadPromise: null } as MossState;
const st: MossState = g.__housemd_moss;

async function getClient(): Promise<any | null> {
  if (st.client) return st.client;
  const id = key('MOSS_PROJECT_ID');
  const pk = key('MOSS_PROJECT_KEY');
  if (!id || !pk) return null;
  try {
    const { MossClient } = await import('@moss-dev/moss');
    st.client = new MossClient(id, pk);
    return st.client;
  } catch (e) {
    console.error('[moss] SDK unavailable:', String(e).slice(0, 150));
    return null;
  }
}

// Fire-and-forget at assemble: upsert the chart snippets, then load the index.
export function kickChartIndex(chart: LoadedChart): void {
  if (st.kicked) return;
  st.kicked = true;
  void (async () => {
    const c = await getClient();
    if (!c) return;
    try {
      const docs = chart.aliases.map((a) => ({ id: a.alias, text: `${a.resourceType}: ${a.fact}` }));
      try {
        await c.createIndex(INDEX, docs, { modelId: 'moss-minilm' });
        console.log('[moss] index created,', docs.length, 'docs');
      } catch (e: any) {
        if (!/exist/i.test(String(e?.message ?? e))) throw e;
        await c.addDocs(INDEX, docs, { upsert: true });
        console.log('[moss] index upserted,', docs.length, 'docs');
      }
      st.loadPromise = null;
      await ensureLoaded(c);
      st.ready = true;
      console.log('[moss] index loaded — semantic retrieval LIVE');
    } catch (e) {
      console.error('[moss] index build failed:', String(e).slice(0, 200));
    }
  })();
}

function ensureLoaded(c: any): Promise<void> {
  if (!st.loadPromise) {
    st.loadPromise = c.loadIndex(INDEX).catch((err: any) => {
      st.loadPromise = null;
      throw err;
    });
  }
  return st.loadPromise!;
}

// Returns null when Moss isn't ready — caller uses the local fallback and labels it.
export async function mossSearch(chart: LoadedChart, query: string, topK = 6): Promise<EvidenceRef[] | null> {
  if (!st.ready) return null;
  const c = await getClient();
  if (!c) return null;
  try {
    await ensureLoaded(c);
    const res = await c.query(INDEX, query, { topK });
    const byAlias = new Map(chart.aliases.map((a) => [a.alias, a]));
    const hits = (res.docs ?? [])
      .map((d: any) => byAlias.get(d.id))
      .filter(Boolean) as EvidenceRef[];
    return hits.length > 0 ? hits : null;
  } catch (e) {
    console.error('[moss] query failed:', String(e).slice(0, 120));
    return null;
  }
}

export const mossReady = (): boolean => st.ready;
