// The detective board: every time the session state changes, one SVG is drawn for the
// exact pixel size of the table surface and laid over it. Model = OpenRouter
// z-ai/glm-4.7:nitro. Decision support, not diagnosis — the board only re-draws what the
// council already argued on the record; it never adds a claim of its own.

import { key } from './env';
import type { SessionState } from '../shared/types';

const MODEL = 'z-ai/glm-4.7:nitro';

// ponytail: one board per (version, size) held in memory, no eviction beyond the last
// entry — the session is a single demo run. Swap for an LRU if this ever serves >1 table.
const g = globalThis as any;
if (!g.__housemd_board) g.__housemd_board = { cacheKey: '', svg: '', inflight: null as Promise<string> | null };
const cache: { cacheKey: string; svg: string; inflight: Promise<string> | null } = g.__housemd_board;

const claim = (a: { claim: string; provenance: string; resolved: { alias: string }[] }) =>
  `${a.claim} [${a.provenance === 'cited' ? a.resolved.map((e) => e.alias).join(',') || 'cited' : 'CONJECTURE'}]`;

// Compact, citation-preserving brief. Aliases (E1, E2…) are the connective tissue the
// board draws its lines from, so they must survive into the prompt verbatim.
export function brief(s: SessionState): string {
  const L: string[] = [];
  if (s.patient) L.push(`PATIENT (synthetic): ${s.patient.name}, DOB ${s.patient.dob}, payer ${s.patient.payer}`);
  if (s.features)
    L.push(
      `CASE: ${s.features.age}y ${s.features.sex} — ${s.features.chiefComplaint}`,
      `systems: ${s.features.organSystems.join(', ')}`,
      `meds: ${s.features.activeMeds.join(', ') || 'none recorded'}`,
      `red flags: ${s.features.redFlags.join(', ') || 'none'}`,
    );
  L.push(`PHASE: ${s.phase}`);
  const seated = (s.seating?.seats || []).filter((x) => x.status !== 'empty');
  if (seated.length) L.push(`COUNCIL: ${seated.map((x) => `${x.personaName || 'you'} (${x.specialty})`).join('; ')}`);
  for (const d of s.differential) {
    L.push(`DX${d.rank} ${d.display} [${d.status}] — ${d.assessment}`);
    for (const a of d.supporting) L.push(`  supports: ${claim(a)}`);
    for (const a of d.contradicting) L.push(`  against: ${claim(a)}`);
  }
  for (const c of s.contributions) {
    L.push(`POSITION ${c.specialty}: ${claim(c.interpretation)}`);
    if (c.contradiction) L.push(`  but: ${claim(c.contradiction)}`);
    if (c.discriminator) L.push(`  discriminator: ${c.discriminator}`);
  }
  for (const o of s.workup) {
    const b = o.benefit;
    L.push(
      `WORKUP ${o.display} (${o.priority}${o.selected ? ', selected' : ''}) — ${o.purpose}` +
        (b?.matched ? ` | coverage: ${[b.copay && `copay ${b.copay}`, b.deductibleRemaining && `deductible ${b.deductibleRemaining}`, ...b.messages].filter(Boolean).join(', ')}` : ''),
    );
  }
  for (const t of s.transcript.slice(-8)) L.push(`SAID ${t.role}: ${t.text}`);
  return L.join('\n');
}

const prompt = (b: string, w: number, h: number, prev: string) => `You are drawing a detective's evidence board on a corkboard for a clinical council session.
Return ONE raw SVG document and nothing else — no prose, no markdown fence.

Hard requirements:
- <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"> — every element inside those bounds, nothing clipped.
- Background: corkboard (warm brown, subtle grain via a few <circle> speckles or a <pattern>).
- The patient card is always pinned top-left and always readable: name in bold, then "age · sex · DOB", then the chief complaint in quotes, verbatim. It is the only header the board gets.
- Evidence as pinned index cards / photos: white-ish <rect> with a slight rotate() transform, a red pushpin <circle>, short readable text (12-15px, sans-serif, dark ink). Wrap long text yourself across <tspan> lines; never let text overflow its card.
- Red string: <path>/<line> in crimson connecting cards that relate — supporting evidence to its diagnosis, contradictions in a dashed line, workup hanging off the leading diagnosis. Draw the string BEHIND the cards.
- The leading diagnosis is the visual centre: bigger card, red marker circle around it.
- Keep evidence aliases (E1, E2…) printed on the cards they came from — they are the citation trail.
- Stay inside the drawable region: every x coordinate between 40 and ${w - 40}, every y between 40 and ${h - 40}. A card is up to 200 wide and 110 tall, so no card's x may exceed ${w - 240} and no card's y may exceed ${h - 150}. Nothing may cross the canvas edge.
- Stamp "CONJECTURE" in a corner of the specific card carrying the uncited claim, small and clear of that card's text; never present a conjecture as established, and never stamp a card whose claim was cited.
- Cards must never overlap each other — leave at least 12px of cork between them. Use no more than ~18 cards; drop the least important rather than overcrowding.
- Static SVG only: no <script>, no external images, no foreignObject, no event attributes.

The board so far (only draw what is here — invent nothing):
${b}
${prev ? `
This is the board as it currently hangs. Do NOT start over: keep every existing card in
place with its wording, position and rotation, and change only what the notes above
changed — pin the new cards into free space, run string from them to what they relate to,
re-mark the leading diagnosis if it moved. One exception to "leave cards alone": if the
patient card does not yet follow the patient-card rule above, redraw that card so it does. If the canvas size above differs from this
SVG's, rescale the layout to the new size. Return the complete updated SVG.

${prev}` : ''}`;

// SVG from a model is untrusted markup rendered into the page: strip anything active.
export function sanitize(raw: string): string {
  const start = raw.indexOf('<svg');
  if (start < 0) throw new Error(`model returned no SVG: ${raw.slice(0, 120)}`);
  const end = raw.lastIndexOf('</svg>');
  // A board cut off at the token limit still shows most of its cards — keep what
  // parsed, drop the half-written tag, and let the parser close the open groups.
  const body = end >= 0 ? raw.slice(start, end + 6) : `${raw.slice(start, raw.lastIndexOf('>') + 1)}</svg>`;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*(["'])\s*(?!#)[^"']*\2/gi, '');
}

async function draw(s: SessionState, w: number, h: number, prev: string): Promise<string> {
  const apiKey = key('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      // Thinking off: it burned ~3k tokens per board and this is a drawing task, not a
      // reasoning one — the reasoning budget is better spent on cards.
      reasoning: { enabled: false },
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt(brief(s), w, h, prev) }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  try {
    return sanitize(choice?.message?.content || '');
  } catch (e) {
    throw new Error(`${(e as Error).message} (finish_reason=${choice?.finish_reason})`);
  }
}

// One draw per (state version, size). Concurrent callers share the in-flight request.
export function board(s: SessionState, version: number, w: number, h: number): Promise<string> {
  const cacheKey = `${version}:${w}x${h}`;
  if (cache.cacheKey === cacheKey) return Promise.resolve(cache.svg);
  if (cache.inflight) return cache.inflight;
  // Each draw amends the board that's already hanging — cards stay put, only the new
  // evidence gets pinned — so the demo reads as one board growing, not a reshuffle.
  cache.inflight = draw(s, w, h, cache.svg)
    .then((svg) => {
      // ponytail: a draw that comes back a fraction of the board's size dropped most of
      // the evidence — keep the old board rather than seed the next iteration from it.
      const kept = cache.svg && svg.length < cache.svg.length * 0.4 ? cache.svg : svg;
      cache.cacheKey = cacheKey;
      cache.svg = kept;
      return kept;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}
