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
- Static SVG only: no <script>, no external images, no foreignObject, no event attributes.
- Only draw what the notes give you. Never invent a finding, a citation or a number.

HOUSE STYLE — follow these values exactly, every time, so every redraw looks like the
same board. Do not improvise colours, sizes or positions.

Palette (use these hex values and no others):
  cork #c9a075, cork speckle #b98e60, card #fdfbf4, card edge #d9cfbb,
  ink #1c1a17, muted ink #6b6357, string #9d1420, pin #b3121c,
  leading card #fffdf3 with a #9d1420 2px border, conjecture stamp #9d1420.

Structure — one <defs> with a drop-shadow filter and the cork pattern, then in order:
  1. full-canvas cork <rect>, 2. all string <path>s, 3. all cards, 4. all pins.
  Strings always sit behind cards; pins always on top of their own card.

Card geometry — fixed sizes only, no other dimensions:
  standard card 212 × 96, leading card 286 × 128, workup card 190 × 78.
  Corner radius 3. Drop shadow via the filter. Rotation between -2.5 and 2.5 degrees,
  applied as transform="rotate(a cx cy)" about the card's own centre.
  Pin: <circle r="5.5" fill="#b3121c"> at the card's top centre, 9px below its top edge.

Typography — no other sizes:
  card title 13.5px bold #1c1a17; body 11.5px #1c1a17, line-height 14px via <tspan dy>;
  alias / meta 9.5px bold #6b6357 letter-spacing 0.06em; leading title 17px bold #9d1420.
  Font-family "Helvetica Neue", Helvetica, Arial, sans-serif on every text element.
  Wrap body text yourself at ~30 characters per <tspan> line, max 3 lines, then ellipsis.
  Text never leaves its card: first baseline 16px below the card top, 12px side padding.

Layout zones — place every card in one of these, top to bottom within the zone:
  PATIENT: x=28, y=28 (standard card, but 128 tall). Name bold, then "age · sex · DOB",
    then the chief complaint in quotes, verbatim. The board gets no other header.
  EVIDENCE (cited chart facts, alias printed as the card's meta line): left column,
    x=28, first y=172, each next card 108 lower.
  POSITIONS (what each specialty argued, titled with the specialty): right column,
    x=${w - 240}, first y=28, each next card 108 lower.
  LEADING DIAGNOSIS: centred at x=${Math.round((w - 286) / 2)}, y=${Math.round(h * 0.42) - 64}. Leading card style,
    plus one #9d1420 circle (no fill, 1.5px stroke, opacity 0.5) drawn around it.
  WORKUP: bottom row, y=${h - 28 - 78}, starting x=268, cards spaced 12 apart.
  Nothing may cross the canvas edge and no two cards may overlap — leave ≥12px of cork
  between them. If a zone is full, drop the least important card rather than overflow.

String rules:
  supporting evidence → its diagnosis: solid #9d1420, 2px, opacity 0.85.
  contradiction / uncertainty: same colour, 2px, stroke-dasharray="7 5".
  workup card → leading diagnosis: solid, 1.5px, opacity 0.6.
  Draw as a slightly curved <path> (quadratic), never a straight <line>.

Content rules:
  Keep evidence aliases (E1, E2…) on the cards they came from — that is the citation trail.
  Stamp "CONJECTURE" (10px bold #9d1420, rotated -8°) in the bottom-right corner of a card
  whose claim was NOT cited, clear of its text. Never stamp a cited card.
  At most 16 cards total.

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
// The model drifts past the bounds it was given. Rather than clip a card off the edge,
// widen the viewBox to whatever it actually drew and let the browser scale it to fit —
// the board shrinks a little instead of losing evidence.
export function fit(svg: string): string {
  const open = svg.match(/^<svg[^>]*>/)?.[0];
  const vb = open?.match(/viewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (!open || !vb) return svg;
  const [vx, vy, vw, vh] = vb.slice(1).map(Number);
  let maxX = vx + vw;
  let maxY = vy + vh;
  // Cards are usually drawn inside translated groups, so track the group offsets —
  // without them every coordinate reads as if it were at the origin.
  const stack: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const tag of svg.match(/<[^>]+>/g) || []) {
    const top = stack[stack.length - 1];
    if (/^<\/g/.test(tag)) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (/^<g[\s>]/.test(tag)) {
      const t = tag.match(/translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/);
      const next = { x: top.x + (t ? Number(t[1]) : 0), y: top.y + (t ? Number(t[2]) : 0) };
      maxX = Math.max(maxX, next.x);
      maxY = Math.max(maxY, next.y);
      if (!/\/>$/.test(tag)) stack.push(next);
      continue;
    }
    const n = (name: string) => {
      const m = tag.match(new RegExp(`\\b${name}="\\s*(-?[\\d.]+)`));
      return m ? Number(m[1]) : null;
    };
    const w = n('width') ?? n('r') ?? 0;
    const h = n('height') ?? n('r') ?? 0;
    for (const right of [n('x') !== null ? n('x')! + w : null, n('cx') !== null ? n('cx')! + w : null, n('x1'), n('x2')])
      if (right !== null && Number.isFinite(right)) maxX = Math.max(maxX, right + top.x);
    for (const bottom of [n('y') !== null ? n('y')! + h : null, n('cy') !== null ? n('cy')! + h : null, n('y1'), n('y2')])
      if (bottom !== null && Number.isFinite(bottom)) maxY = Math.max(maxY, bottom + top.y);
  }
  if (maxX <= vx + vw && maxY <= vy + vh) return svg;
  const grown = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${maxX - vx + 16} ${maxY - vy + 16}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">`;
  return grown + svg.slice(open.length);
}

export function sanitize(raw: string): string {
  const start = raw.indexOf('<svg');
  if (start < 0) throw new Error(`model returned no SVG: ${raw.slice(0, 120)}`);
  const end = raw.lastIndexOf('</svg>');
  // A board cut off at the token limit still shows most of its cards — keep what
  // parsed, drop the half-written tag, and let the parser close the open groups.
  const body = end >= 0 ? raw.slice(start, end + 6) : `${raw.slice(start, raw.lastIndexOf('>') + 1)}</svg>`;
  return fit(body)
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
  // On a size change we start fresh instead: rescaling old coordinates by hand is what
  // makes cards overlap and run off the edge.
  const sameSize = cache.cacheKey.endsWith(`:${w}x${h}`);
  cache.inflight = draw(s, w, h, sameSize ? cache.svg : '')
    .then((svg) => {
      // ponytail: a draw that comes back a fraction of the board's size dropped most of
      // the evidence — keep the old board rather than seed the next iteration from it.
      const kept = sameSize && cache.svg && svg.length < cache.svg.length * 0.4 ? cache.svg : svg;
      cache.cacheKey = cacheKey;
      cache.svg = kept;
      return kept;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}
