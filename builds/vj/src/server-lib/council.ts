import WebSocket from 'ws';
import { key } from './env';
import { loadChart, searchEvidence, type LoadedChart } from './chart';
import { getState, mutate, pushAudio } from './session';
import { decideSeating, deriveFeatures, emptySeats } from '../council/seating';
import { ROSTER } from '../council/personas';
import { DEFAULT_CASE } from '../case/default-case';
import type { Argument, DifferentialItem, EvidenceRef, SpecialistContribution } from '../shared/types';

// The council brain: ONE headless Deepgram Voice Agent session (managed think model —
// the only LLM in the system). The model role-plays the whole council inside tool-call
// JSON; the server validates citations and renders. Server never generates arguments.

const DG_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const g = globalThis as any;

interface Live {
  ws: WebSocket | null;
  ready: boolean;
  chart: LoadedChart | null;
  patientPlanText: string;
  keepAlive: ReturnType<typeof setInterval> | null;
  pendingLines: { name: string; voice: string; text: string; personaId: string }[];
  speaking: boolean;
}
if (!g.__housemd_live) g.__housemd_live = { ws: null, ready: false, chart: null, patientPlanText: '', keepAlive: null, pendingLines: [], speaking: false } as Live;
const live: Live = g.__housemd_live;

// Audible council (max two heard lines per debate round): TTS each pending specialist
// line in its persona's own Aura voice, pushed into the same PCM stream strictly
// AFTER the chair's audio is done — no overlapping speech.
async function speakPendingLines(): Promise<void> {
  if (live.speaking || live.pendingLines.length === 0) return;
  live.speaking = true;
  try {
    while (live.pendingLines.length > 0) {
      const line = live.pendingLines.shift()!;
      try {
        const res = await fetch(
          `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(line.voice)}&encoding=linear16&sample_rate=24000&container=none`,
          {
            method: 'POST',
            headers: { Authorization: `Token ${key('DEEPGRAM_API_KEY')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.text.slice(0, 600) }),
            signal: AbortSignal.timeout(20000),
          }
        );
        if (!res.ok) {
          console.error('[council] tts failed', res.status, line.voice, (await res.text()).slice(0, 120));
          continue;
        }
        const pcm = Buffer.from(await res.arrayBuffer());
        mutate((s) => { s.transcript.push({ role: 'specialist', personaId: line.personaId, text: `${line.name}: ${line.text}`, at: Date.now() }); });
        // stream in ~200ms slices so playback starts promptly
        const slice = 9600;
        for (let i = 0; i < pcm.length; i += slice) {
          pushAudio(pcm.subarray(i, Math.min(i + slice, pcm.length)));
        }
      } catch {
        // one failed line never blocks the session
      }
    }
  } finally {
    live.speaking = false;
  }
}

// ---- citation validation (Guardrail #2 — computed, never model-asserted) ----
export function validateArgument(
  raw: { claim?: string; aliases?: string[] },
  aliasMap: Map<string, EvidenceRef>
): Argument {
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a) => typeof a === 'string') : [];
  const resolved = aliases.map((a) => aliasMap.get(a.trim().toUpperCase())).filter(Boolean) as EvidenceRef[];
  return {
    claim: String(raw.claim || '').slice(0, 400),
    aliases,
    resolved,
    provenance: resolved.length > 0 ? 'cited' : 'conjecture',
  };
}

function aliasMapOf(chart: LoadedChart): Map<string, EvidenceRef> {
  return new Map(chart.aliases.map((a) => [a.alias.toUpperCase(), a]));
}

// ---- function (tool) definitions given to the managed model ----
const FUNCTION_DEFS = [
  {
    name: 'search_patient_evidence',
    description:
      'Search the patient chart for evidence. Returns evidence items each with an alias (like E3). You may ONLY cite aliases returned by this function. Call it before asserting anything patient-specific.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'clinical concepts to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'present_specialist_turn',
    description:
      "Present ONE specialist's turn. The system speaks spoken_line ALOUD IN THAT SPECIALIST'S OWN VOICE — never voice it yourself; after calling, give at most one short plain-English chair framing line and move to the next specialist. Call once per specialist, in turn order. Claims must cite aliases from search_patient_evidence.",
    parameters: {
      type: 'object',
      properties: {
        personaId: { type: 'string', description: 'the specialist persona id (e.g. pulmo, gastro, id)' },
        spoken_line: { type: 'string', description: "the specialist's spoken turn, first person, ≤45 words, plain English, citing a dated chart item" },
        claim: { type: 'string', description: 'their leading interpretation for the board' },
        aliases: { type: 'array', items: { type: 'string' } },
        contradiction: {
          type: 'object',
          properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
        },
        discriminator: { type: 'string' },
      },
      required: ['personaId', 'spoken_line', 'claim'],
    },
  },
  {
    name: 'submit_council_output',
    description:
      'AFTER all specialist turns are presented: submit the ranked differential (2-4 items, REQUIRED, non-empty) and your chair summary. Every evidence claim must carry aliases from search_patient_evidence. Claims without valid aliases will be labeled CONJECTURE automatically.',
    parameters: {
      type: 'object',
      properties: {
        contributions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              personaId: { type: 'string' },
              specialty: { type: 'string' },
              interpretation: {
                type: 'object',
                properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
                required: ['claim'],
              },
              contradiction: {
                type: 'object',
                properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
              },
              discriminator: { type: 'string' },
            },
            required: ['personaId', 'specialty', 'interpretation'],
          },
        },
        differential: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              display: { type: 'string' },
              rank: { type: 'number' },
              assessment: { type: 'string' },
              supporting: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
                },
              },
              contradicting: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
                },
              },
            },
            required: ['display', 'rank', 'assessment'],
          },
        },
        chair_summary: { type: 'string' },
      },
      required: ['contributions', 'differential', 'chair_summary'],
    },
  },
  {
    name: 'propose_workup',
    description:
      'Propose 2-4 next steps for the selected leading hypothesis — tests AND any specialist consultation/referral the direction warrants (standard pathways usually include one).',
    parameters: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              display: { type: 'string' },
              purpose: { type: 'string' },
              priority: { type: 'string', enum: ['now', 'next', 'later'] },
            },
            required: ['display', 'purpose', 'priority'],
          },
        },
      },
      required: ['options'],
    },
  },
  {
    name: 'get_benefits',
    description:
      'Run the live insurance eligibility check (Stedi test mode). Returns only facts the payer response contains. Call this after proposing the workup; then have Ms. Okafor (patient services) speak the coverage reality and any re-sequencing.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'submit_patient_plan',
    description:
      'Submit a short plain-language version of the confirmed plan, written for the patient (no jargon, honest about uncertainty and costs). Called once the clinician confirms.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
];

// ---- tool implementations (server side — validation + state, no generation) ----
async function runTool(name: string, args: any): Promise<unknown> {
  const chart = live.chart!;
  const amap = aliasMapOf(chart);

  if (name === 'search_patient_evidence') {
    const q = String(args.query || '');
    mutate((s) => { s.phase = 'retrieving-evidence'; s.activity = `searching chart: "${q.slice(0, 80)}"`; });
    const { mossSearch } = await import('./moss');
    const mossHits = await mossSearch(chart, q, 10);
    const hits = mossHits ?? searchEvidence(chart, q, 10);
    const source = mossHits ? 'Moss semantic search' : 'chart keyword search';
    mutate((s) => { s.activity = `${source}: ${hits.length} of ${chart.aliases.length} records for "${q.slice(0, 50)}"`; });
    // Chronological sweep: longitudinal charts hide old clues search queries never
    // reach. Always include the oldest records the search DIDN'T return, labeled.
    const hitAliases = new Set(hits.map((h) => h.alias));
    const olderHistory = chart.aliases
      .filter((a) => a.date && !hitAliases.has(a.alias))
      .sort((a, b) => (a.date! < b.date! ? -1 : 1))
      .slice(0, 4);
    return {
      evidence: hits.map((h) => ({ alias: h.alias, resourceType: h.resourceType, date: h.date, fact: h.fact })),
      oldest_history_not_in_results: olderHistory.map((h) => ({ alias: h.alias, resourceType: h.resourceType, date: h.date, fact: h.fact })),
      note: 'oldest_history_not_in_results = the deep archive your query missed — old clues often matter; cite by alias like any evidence.',
    };
  }

  if (name === 'present_specialist_turn') {
    const personaOf = (pid: string, spec = '') =>
      ROSTER.find((r) => r.id === pid) ||
      ROSTER.find((r) => r.name.toLowerCase() === String(pid).toLowerCase()) ||
      ROSTER.find((r) => r.specialty === spec) ||
      ROSTER.find((r) => String(pid).toLowerCase().includes(r.id));
    const p = personaOf(String(args.personaId || ''));
    if (!p) return { error: `unknown persona ${args.personaId} — valid ids: ${ROSTER.map((r) => r.id).join(', ')}` };
    const contribution: SpecialistContribution = {
      personaId: p.id,
      specialty: p.specialty,
      interpretation: validateArgument({ claim: args.claim, aliases: args.aliases }, amap),
      contradiction: args.contradiction ? validateArgument(args.contradiction, amap) : undefined,
      discriminator: args.discriminator ? String(args.discriminator).slice(0, 200) : undefined,
    };
    mutate((s) => {
      s.contributions = [...s.contributions.filter((c) => c.personaId !== p.id), contribution];
      s.activity = `${p.name} has the floor`;
    });
    if (p.voice) {
      live.pendingLines.push({ name: p.name, voice: p.voice, text: String(args.spoken_line || args.claim).slice(0, 500), personaId: p.id });
      setTimeout(() => void speakPendingLines(), 600);
    }
    return {
      ok: true,
      spoken_in_own_voice: true,
      provenance: contribution.interpretation.provenance,
      note: 'The line is being spoken in their voice now — do NOT repeat it. One short chair framing line, then the next specialist (or submit_council_output if all have spoken).',
    };
  }

  if (name === 'submit_council_output') {
    if (!Array.isArray(args.differential) || args.differential.length < 2) {
      return { error: 'differential must be a RANKED LIST of 2-4 items (leading + the alternatives being excluded, each with evidence aliases) — resubmit the full ranked differential.' };
    }
    const contributions: SpecialistContribution[] = (args.contributions || []).map((c: any) => ({
      personaId: String(c.personaId || ''),
      specialty: String(c.specialty || ''),
      interpretation: validateArgument(c.interpretation || {}, amap),
      contradiction: c.contradiction ? validateArgument(c.contradiction, amap) : undefined,
      discriminator: c.discriminator ? String(c.discriminator).slice(0, 200) : undefined,
    }));
    const differential: DifferentialItem[] = (args.differential || []).map((d: any, i: number) => ({
      id: `dx-${i + 1}`,
      display: String(d.display || '').slice(0, 120),
      rank: Number(d.rank) || i + 1,
      assessment: String(d.assessment || '').slice(0, 300),
      status: 'candidate' as const,
      supporting: (d.supporting || []).map((x: any) => validateArgument(x, amap)),
      contradicting: (d.contradicting || []).map((x: any) => validateArgument(x, amap)),
      lastChangedBy: 'council debate',
    }));
    const demoted = [
      ...contributions.map((c) => c.interpretation),
      ...differential.flatMap((d) => [...d.supporting, ...d.contradicting]),
    ].filter((a) => a.provenance === 'conjecture').length;

    // Specialist voices already played per-turn via present_specialist_turn.
    mutate((s) => {
      if (contributions.length > 0) s.contributions = contributions;
      s.differential = differential.sort((a, b) => a.rank - b.rank);
      // Never regress the phase if the session already advanced past the debate.
      if (['reasoning', 'retrieving-evidence', 'case-ready', 'listening'].includes(s.phase)) {
        s.phase = 'differential-ready';
      }
      s.activity = demoted > 0 ? `${demoted} uncited claim(s) demoted to conjecture` : 'all claims cited';
    });
    return { ok: true, conjecture_demotions: demoted, note: demoted > 0 ? 'Chair: acknowledge the demoted claims as conjecture.' : 'All claims validated.' };
  }

  if (name === 'propose_workup') {
    const CONSULT_RE = /consult|referral|specialist|clinic visit|evaluation by/i;
    mutate((s) => {
      s.workup = (args.options || []).slice(0, 4).map((o: any, i: number) => ({
        id: `opt-${i + 1}`,
        display: String(o.display || '').slice(0, 120),
        purpose: String(o.purpose || '').slice(0, 200),
        priority: ['now', 'next', 'later'].includes(o.priority) ? o.priority : 'next',
        selected: true,
      }));
      // Pathway floor (config, not generation): the standard pathway includes a
      // specialist consultation; if the model omitted it, append the case-config one
      // so the coverage/referral beat always has its anchor. Badged in UI.
      if (!s.workup.some((o) => CONSULT_RE.test(o.display))) {
        s.workup.push({
          id: `opt-${s.workup.length + 1}`,
          display: 'Cardiology consultation',
          purpose: 'Specialist evaluation for the leading direction (standard pathway step)',
          priority: 'next',
          selected: true,
          sequenceNote: 'added per standard pathway',
        });
      }
      s.phase = 'workup-ready';
      s.activity = undefined;
    });
    return { ok: true };
  }

  if (name === 'get_benefits') {
    mutate((s) => { s.phase = 'checking-benefits'; s.activity = 'live eligibility check (Stedi test mode)…'; });
    try {
      const { runEligibility } = await import('./stedi');
      const { facts } = await runEligibility(DEFAULT_CASE.stediScenario);
      mutate((s) => {
        const referral = facts.messages.find((m) => /referral/i.test(m));
        for (const opt of s.workup) {
          const isConsult = /consult|referral|specialist|clinic visit|evaluation by/i.test(opt.display);
          if (isConsult) {
            opt.benefit = facts;
            if (referral) {
              opt.sequenceNote = 'Re-sequenced: requires PCP referral first — scheduled behind it';
              opt.priority = 'next';
            }
          } else {
            opt.benefit = { ...facts, matched: false, copay: undefined, messages: [] };
            if (opt.priority !== 'now') opt.priority = 'now';
          }
        }
        s.phase = 'benefits-ready';
        s.activity = undefined;
      });
      // The reimbursement seat speaks the facts herself — composed ONLY from the
      // returned response, in her own voice, queued behind current speech.
      const okafor = ROSTER.find((r) => r.kind === 'reimbursement');
      if (okafor?.voice) {
        const referralMsg = facts.messages.find((m) => /referral/i.test(m));
        const line = [
          'Coverage check is back.',
          facts.planActive ? 'The plan is active.' : 'The plan shows inactive.',
          facts.copay ? `Specialist visits carry a ${facts.copay.replace('$', '')} dollar copay.` : '',
          facts.deductibleRemaining === '$0' ? 'The deductible is already met.' : '',
          facts.oopRemaining ? `${facts.oopRemaining.replace('$', '')} dollars left on the out-of-pocket max.` : '',
          referralMsg ? 'One gate: the payer requires a P C P referral before the specialist visit — I have re-sequenced the consult behind it. Labs proceed now.' : '',
          'Payer-reported figures, not guarantees.',
        ].filter(Boolean).join(' ');
        live.pendingLines.push({ name: okafor.name, voice: okafor.voice, text: line, personaId: okafor.id });
        setTimeout(() => void speakPendingLines(), 3000);
      }
      return {
        facts: {
          planActive: facts.planActive,
          specialistCopay: facts.copay,
          deductibleRemaining: facts.deductibleRemaining,
          outOfPocketRemaining: facts.oopRemaining,
          payerMessages: facts.messages,
          note: 'Ms. Okafor has ALREADY spoken these facts aloud — do NOT repeat the numbers; just move the discussion forward.',
        },
      };
    } catch (e: any) {
      mutate((s) => { s.phase = 'recoverable-error'; s.error = `Eligibility check failed: ${String(e.message || e).slice(0, 200)} — retry available`; s.activity = undefined; });
      return { error: 'eligibility check failed — tell the clinician it can be retried; do not invent coverage facts' };
    }
  }

  if (name === 'submit_patient_plan') {
    live.patientPlanText = String(args.text || '').slice(0, 2000);
    return { ok: true };
  }

  return { error: `unknown function ${name}` };
}

// ---- prompt ----
function councilPrompt(): string {
  const s = getState();
  const seated = s.seating!.seats.filter((x) => x.status === 'seated');
  const empty = s.seating!.seats.filter((x) => x.status === 'empty');
  const personas = seated
    .map((seat) => {
      const p = ROSTER.find((r) => r.id === seat.personaId);
      return p ? `- ${p.name} (${p.specialty}, id:${p.id}): ${p.style}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const specialistOrder = seated
    .map((seat) => ROSTER.find((r) => r.id === seat.personaId))
    .filter((p) => p?.kind === 'specialist')
    .map((p) => p!.name)
    .join(', then ');
  return [
    'You run a live AI panel consult as its entire cast (docs/DEMO_SPEC). SPOKEN VOICE: you speak ONLY as the chair/moderator — dry, fast, witty; max 2 sentences per turn except your final synthesis. NEVER prefix speech with any speaker label. BAD: "HOUSE: Good." GOOD: "Good." You ARE the voice.',
    `THE PANEL (role-play each in structured output):\n${personas}`,
    empty.length
      ? `EMPTY SEATS: ${empty.map((e) => e.specialty).join(', ')} — required by this case but unfilled. Say so on the record; NO ONE improvises missing expertise.`
      : '',
    'OPENING: The room assembles in silence and LISTENS. The clinician opens the conference aloud — they present their patient, their theory, and their question, ending with a handoff (e.g. "can you take a look?"). Do NOT speak before the clinician has presented. When they hand off, take the floor: run the chart searches, drive the debate, submit the structured output.',
    `RULES: (1) Decision support, not diagnosis — the panel argues, the clinician decides; never present a diagnosis as established. The human clinician is ${DEFAULT_CASE.clinicianName}; "Can you take a look?" hands you the floor. (2) Before ANY patient-specific claim, call search_patient_evidence — AT LEAST THREE searches from different angles (current symptoms; labs over the years; old intake/social history and notes — longitudinal records hide the good clues years back; also read oldest_history_not_in_results). Cite only returned aliases (E1, E2…) in tool JSON; uncited claims auto-label CONJECTURE. (3) THE CONFERENCE FLOW — turn order: ${specialistOrder}. For each specialist: say ONE short chair framing line aloud ("Lungs. Go."), then call present_specialist_turn for them — the system speaks their line IN THEIR OWN VOICE; never voice a specialist yourself, never repeat their line; optionally add one plain-English translation sentence. After ALL specialists have presented: call submit_council_output with the ranked differential (non-empty), then speak your synthesis. (4) PLAIN ENGLISH for a lay audience: everyday words first, at most one technical term per turn, introduced after the plain phrase ("look inside his lungs with a camera — a bronchoscopy"). (5) Challenge the weakest-cited claim before accepting it. (6) After the clinician selects the direction: propose_workup (tests AND any consult/treatment the pathway warrants), then get_benefits — the ADVOCATE has already spoken the returned figures; don't repeat them, connect the affordable plan to the safe plan. Never invent prices or coverage. (7) SPOKEN OUTPUT: after each tool call, ONE short line and hand the floor. NEVER read structured output, bullets, or lists aloud — the table shows the detail.`,
    `PATIENT (synthetic): ${s.patient?.name}, DOB ${s.patient?.dob}. Chief complaint: ${s.features?.chiefComplaint}.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildSettings(thinkModel: string) {
  const think: any = { provider: { type: 'open_ai', model: thinkModel }, prompt: councilPrompt().slice(0, 24000), functions: FUNCTION_DEFS };
  // NOTE: no temperature — gpt-5-mini hard-rejects non-default values (verified live today).
  // No greeting: the room assembles in silence while analysis runs — the first thing
  // the clinician HEARS is the chair opening the actual conference (Vijay, 3:24pm).
  return {
    type: 'Settings',
    audio: { input: { encoding: 'linear16', sample_rate: 24000 }, output: { encoding: 'linear16', sample_rate: 24000, container: 'none' } },
    agent: {
      language: 'en',
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think,
      speak: { provider: { type: 'deepgram', model: 'aura-2-apollo-en' } },
    },
  };
}

// ---- session lifecycle ----
export async function assemble(): Promise<void> {
  mutate((s) => { s.phase = 'reasoning'; s.activity = 'loading the chart from Medplum…'; });
  const chart = await loadChart();
  live.chart = chart;
  mutate((s) => { s.activity = `chart loaded — ${chart.aliases.length} records; deriving case features…`; });
  const { kickChartIndex } = await import('./moss');
  kickChartIndex(chart);
  const features = deriveFeatures(chart.resources, { age: chart.age, sex: chart.sex }, DEFAULT_CASE.chiefComplaint);
  const seating = decideSeating(features, ROSTER, DEFAULT_CASE.clinicianSpecialty, DEFAULT_CASE.seatFullRoster);
  mutate((s) => {
    s.patient = chart.banner;
    s.features = features;
    s.seating = seating;
    s.phase = 'reasoning';
    s.activity = 'the panel is convening…';
  });

  await openAgent();
}

// gpt-4o-mini: ~0.4s to first token vs gpt-5-mini's 7-15s — conversational feel wins
// (Vijay, 3:44pm). Structure/guardrails are code-enforced regardless of model depth.
async function openAgent(thinkModel = process.env.THINK_MODEL || 'gpt-4o-mini', isRetry = false): Promise<void> {
  closeAgent();
  const dgKey = key('DEEPGRAM_API_KEY');
  if (!dgKey) {
    mutate((s) => { s.phase = 'recoverable-error'; s.error = 'DEEPGRAM_API_KEY missing — voice/reasoning unavailable'; });
    return;
  }
  const ws = new WebSocket(DG_URL, { headers: { Authorization: `Token ${dgKey}` } });
  live.ws = ws;
  live.ready = false;

  ws.on('open', () => {
    try {
      const settings = buildSettings(thinkModel);
      console.log('[council] ws open — sending Settings', thinkModel, 'bytes:', JSON.stringify(settings).length);
      ws.send(JSON.stringify(settings));
    } catch (e) {
      console.error('[council] buildSettings threw:', e);
      mutate((s) => { s.phase = 'recoverable-error'; s.error = `Settings build failed: ${String(e).slice(0, 200)}`; });
    }
  });

  ws.on('message', async (data: any, isBinary: boolean) => {
    if (ws !== live.ws) return;
    if (isBinary) { pushAudio(Buffer.from(data)); return; }
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type !== 'ConversationText') console.log('[council] event:', msg.type, msg.code || msg.description || '');

    if (msg.type === 'SettingsApplied') {
      live.ready = true;
      // Headless session streams no mic audio — KeepAlive every 5s or Deepgram
      // closes with CLIENT_MESSAGE_TIMEOUT (verified the hard way).
      if (live.keepAlive) clearInterval(live.keepAlive);
      live.keepAlive = setInterval(() => {
        if (ws === live.ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 5000);
      // The room is seated and LISTENS. No canned presentation is injected
      // (AGENTS.md: never inject a stored transcript) — the clinician's actual
      // voice through the mic opens the conference and drives the debate.
      mutate((s) => { s.phase = 'listening'; s.activity = 'the panel is seated and listening — present your case'; });
      return;
    }
    if (msg.type === 'ConversationText') {
      const text = String(msg.content || '').replace(/^\s*(?:speaking as\s+)?(?:the\s+)?(?:chair|house(?:,?\s*m\.?d\.?)?)(?:\s*\([^)]{0,40}\))?\s*[:—-]+\s*/i, '');
      // Guard: models occasionally echo prompt fragments as assistant turns — keep
      // the spoken transcript short, human lines only.
      if (msg.role === 'assistant' && (text.length > 500 || /SEATED COUNCIL|RULES:|argument style|^\s*[-•(]|^\s*(Interpretation|Contradiction|Discriminator|Evidence)\b/i.test(text))) return;
      // Hide stage-direction injects (our composed instructions) from the visible dialog.
      if (msg.role !== 'assistant' && /submit_council_output|propose_workup|get_benefits|convene the council/i.test(text)) return;
      mutate((s) => {
        const role = msg.role === 'assistant' ? 'chair' : 'clinician';
        const last = s.transcript[s.transcript.length - 1];
        if (last && last.role === role && last.text === text) return; // dedupe repeats
        s.transcript.push({ role, personaId: role === 'chair' ? 'house' : undefined, text, at: Date.now() });
        if (role === 'clinician' && s.phase === 'listening') s.phase = 'reasoning';
      });
      return;
    }
    if (msg.type === 'FunctionCallRequest') {
      for (const fn of msg.functions || []) {
        let args = {};
        try { args = JSON.parse(fn.arguments || '{}'); } catch {}
        const result = await runTool(fn.name, args);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify(result) }));
        }
      }
      return;
    }
    if (msg.type === 'AgentThinking') {
      mutate((s) => { s.activity = 'the chair is thinking…'; });
      return;
    }
    if (msg.type === 'UserStartedSpeaking') {
      mutate((s) => { s.activity = 'hearing you…'; });
      return;
    }
    if (msg.type === 'AgentStartedSpeaking') {
      mutate((s) => { s.activity = 'the chair is speaking'; });
      return;
    }
    if (msg.type === 'AgentAudioDone') {
      mutate((s) => { s.activity = undefined; });
      void speakPendingLines();
      return;
    }
    if (msg.type === 'Warning') {
      // SLOW_THINK_REQUEST is routine for gpt-5-mini — surface as activity, not error.
      mutate((s) => { s.activity = 'the council is thinking — deep reasoning takes a few seconds…'; });
      if (String(msg.code || msg.description || '').includes('THINK_REQUEST_FAILED') && !isRetry) {
        openAgent(thinkModel === 'gpt-4o-mini' ? 'gpt-5-mini' : 'gpt-4o-mini', true);
      }
      return;
    }
    if (msg.type === 'Error') {
      if (!isRetry) {
        openAgent(thinkModel === 'gpt-4o-mini' ? 'gpt-5-mini' : 'gpt-4o-mini', true);
      } else {
        mutate((s) => { s.phase = 'recoverable-error'; s.error = `Agent error: ${String(msg.description || msg.message || 'unknown').slice(0, 200)} — retry available`; });
      }
    }
  });

  ws.on('error', (e: any) => {
    if (ws === live.ws) mutate((s) => { s.phase = 'recoverable-error'; s.error = `Voice session error: ${String(e.message || e).slice(0, 150)} — retry available`; });
  });

  ws.on('close', () => {
    // An unexpected drop must never look like a hang — announce it with a retry.
    if (ws === live.ws && live.ready) {
      live.ready = false;
      mutate((s) => {
        if (s.phase !== 'complete' && s.phase !== 'recoverable-error') {
          s.phase = 'recoverable-error';
          s.error = 'Voice session closed unexpectedly — retry re-assembles the council (board state is kept)';
        }
      });
    }
  });
}

export function inject(text: string): boolean {
  if (live.ws && live.ready && live.ws.readyState === WebSocket.OPEN) {
    live.ws.send(JSON.stringify({ type: 'InjectUserMessage', content: text.slice(0, 1500) }));
    return true;
  }
  return false;
}

export function clinicianSays(text: string): boolean {
  mutate((s) => { s.transcript.push({ role: 'clinician', text, at: Date.now() }); s.phase = 'reasoning'; });
  return inject(text);
}

export function selectHypothesis(id: string): void {
  mutate((s) => {
    s.selectedHypothesisId = id;
    for (const d of s.differential) d.status = d.id === id ? 'leading' : d.status === 'leading' ? 'candidate' : d.status;
    s.phase = 'hypothesis-selected';
  });
  const s = getState();
  const dx = s.differential.find((d) => d.id === id);
  inject(`The managing clinician selects "${dx?.display}" as the leading direction (not confirmed). Council: propose_workup for it — include the specialist consultation the standard pathway warrants (e.g. cardiology consult) as one option alongside the tests — then get_benefits, then Ms. Okafor speaks the coverage reality and any re-sequencing.`);
}

export function sendMicAudio(buf: Buffer): void {
  if (live.ws && live.ready && live.ws.readyState === WebSocket.OPEN) live.ws.send(buf);
}
// Bridge for the plain-JS ws relay in server.js (same process, different module graph).
g.__housemd_mic = sendMicAudio;

export function getPatientPlanText(): string {
  if (live.patientPlanText) return live.patientPlanText;
  // Deterministic fallback template — honest, plain, no invention.
  const s = getState();
  const dx = s.differential.find((d) => d.id === s.selectedHypothesisId);
  const opts = s.workup.filter((o) => o.selected);
  return [
    `Your care team met to discuss your symptoms. The leading possibility we are looking into is: ${dx?.display || 'still being evaluated'}. This is NOT a confirmed diagnosis — the next tests are how we find out.`,
    `Next steps: ${opts.map((o) => `${o.display} (${o.purpose})${o.sequenceNote ? ' — ' + o.sequenceNote : ''}`).join('; ')}.`,
    opts.some((o) => o.benefit?.copay) ? `What your insurance said: your plan is active; a specialist visit has a ${opts.find((o) => o.benefit?.copay)?.benefit?.copay} copay. Some tests did not return specific coverage information — the office will confirm before scheduling. These are estimates, not guarantees.` : 'Coverage details will be confirmed by the office before scheduling.',
    'Your doctor makes every decision with you. Bring questions — nothing here is set without your consent.',
  ].join('\n\n');
}

export function closeAgent(): void {
  live.ready = false;
  if (live.keepAlive) {
    clearInterval(live.keepAlive);
    live.keepAlive = null;
  }
  if (live.ws) {
    try { live.ws.close(); } catch {}
    live.ws = null;
  }
}
