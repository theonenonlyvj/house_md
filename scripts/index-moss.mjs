#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fhir, medplumToken, requiredEnv, delay } from './lib.mjs';

const requireFromBuild = createRequire(new URL('../builds/felix/package.json', import.meta.url));
const { MossClient } = requireFromBuild('@moss-dev/moss');
const INDEX = 'house-md-jane-doe';

export async function indexJaneDoe() {
  const token = await medplumToken();
  const patients = await fhir(token, `Patient?identifier=${encodeURIComponent('https://house-md.demo/patient|jane-doe-synthetic')}&_count=1`);
  const patient = patients.entry?.[0]?.resource;
  if (!patient?.id) throw new Error('Synthetic Jane Doe not found; run seed-jane-doe.mjs first.');
  const reference = `Patient/${patient.id}`;
  const searchPlan = [['Condition', 'patient'], ['Observation', 'patient'], ['Procedure', 'patient'], ['Encounter', 'patient'], ['DiagnosticReport', 'patient']];
  const bundles = await Promise.all(searchPlan.map(([type, param]) => fhir(token, `${type}?${param}=${encodeURIComponent(reference)}&_count=100`)));
  const resources = [patient, ...bundles.flatMap((bundle) => bundle.entry?.map((entry) => entry.resource) ?? [])];
  const docs = resources.filter((resource) => resource?.id).map((resource) => ({ id: `${resource.resourceType}/${resource.id}`, text: searchableText(resource), metadata: { resourceId: `${resource.resourceType}/${resource.id}`, resourceType: resource.resourceType } }));
  const client = new MossClient(requiredEnv('MOSS_PROJECT_ID'), requiredEnv('MOSS_PROJECT_KEY'));
  try {
    try {
      await client.createIndex(INDEX, docs, { modelId: 'moss-minilm' });
    } catch (error) {
      if (!/exist/i.test(String(error?.message ?? error))) throw error;
      await client.addDocs(INDEX, docs, { upsert: true });
    }
    let sentinel;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await client.loadIndex(INDEX);
        sentinel = await client.query(INDEX, 'carpal tunnel', { topK: 5 });
        if (sentinel.docs?.some((doc) => /Procedure\//.test(doc.id) && /carpal/i.test(doc.text))) break;
      } catch {}
      await delay(5_000);
    }
    if (!sentinel?.docs?.some((doc) => /Procedure\//.test(doc.id) && /carpal/i.test(doc.text))) throw new Error('Moss sentinel query did not return the expected carpal-tunnel Procedure ID.');
    console.log(`Moss index ${INDEX} refreshed from ${docs.length} Medplum resources; sentinel passed.`);
  } finally {
    await client.close();
  }
}

function searchableText(resource) {
  const copy = structuredClone(resource);
  delete copy.meta;
  return `${resource.resourceType} ${resource.id} ${JSON.stringify(copy)}`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await indexJaneDoe();
