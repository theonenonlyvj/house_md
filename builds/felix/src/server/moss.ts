import 'server-only';
import { MossClient } from '@moss-dev/moss';
import { env } from './env';

const INDEX_NAME = 'house-md-jane-doe';
let client: MossClient | null = null;
let loadPromise: Promise<unknown> | null = null;

function getClient(): MossClient {
  if (!client) client = new MossClient(env('MOSS_PROJECT_ID'), env('MOSS_PROJECT_KEY'));
  return client;
}

export async function searchMoss(query: string, topK = 5) {
  const moss = getClient();
  if (!loadPromise) loadPromise = moss.loadIndex(INDEX_NAME).catch((error) => { loadPromise = null; throw error; });
  await loadPromise;
  const started = performance.now();
  const result = await moss.query(INDEX_NAME, query, { topK });
  return {
    ms: Math.round(performance.now() - started),
    docs: (result.docs ?? []).map((doc) => ({
      id: doc.id,
      text: doc.text,
      score: doc.score,
      metadata: doc.metadata as Record<string, unknown> | undefined,
    })),
  };
}
