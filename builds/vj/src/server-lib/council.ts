import WebSocket from 'ws';
import { key } from './env';
import { loadChart, searchEvidence, type LoadedChart } from './chart';
import { getState, mutate, note, pushAudio } from './session';
import { decideSeating, deriveFeatures, emptySeats, seatedSpecialists } from '../council/seating';
import { ROSTER, SHORT_LABEL, personaById } from '../council/personas';
import { caseById, DEFAULT_CASE_ID, type CaseConfig } from '../case/cases';
import type { Argument, DifferentialItem, EvidenceRef, SpecialistContribution } from '../shared/types';

// The council brain: ONE headless Deepgram Voice Agent session (managed think model —
// the only LLM in the system). The model role-plays the whole council inside tool-call
// JSON; the server validates citations and renders. Server never generates arguments.
//
// The consult runs in two phases, and the split matters:
//   1. OPENING — the chart loads, the chair takes the floor and asks for the case.
//      Nobody else is in the room yet.
//   2. ASSEMBLY — the clinician presents; seat_panel then seats the panel from the
//      chart AND what they just said, and the room fills one chair at a time.
// Seating is computed in code (seating.ts, Guardrail #1). The model announces the
// panel; it does not choose it.

const DG_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const SAMPLE_RATE = 24000;
/** Beat between chairs landing during assembly — paced so the reveal reads. */
const SEAT_REVEAL_MS = 620;
const g = globalThis as any;

interface Live {
  ws: WebSocket | null;
  ready: boolean;
  chart: LoadedChart | null;
  patientPlanText: string;
  keepAlive: ReturnType<typeof setInterval> | null;
  pendingLines: { name: string; voice: string; text: string; personaId: string }[];
  speaking: boolean;
  seated: boolean;
  watchdog: ReturnType<typeof setInterval> | null;
  lastToolAt: number;
}
if (!g.__housemd_live) {
  g.__housemd_live = {
    ws: null,
    ready: false,
    chart: null,
    patientPlanText: '',
    keepAlive: null,
    pendingLines: [],
    speaking: false,
    seated: false,
    watchdog: null,
    lastToolAt: 0,
  } as Live;
}
const live: Live = g.__housemd_live;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The case this session is running. Everything patient-specific reads through here. */
function activeCase(): CaseConfig {
  return caseById(getState().caseId) || caseById(DEFAULT_CASE_ID)!;
}

const shortLabel = (specialty: string, fallback = 'PANEL') =>
  SHORT_LABEL[specialty] || specialty.split('-')[0].slice(0, 7).toUpperCase() || fallback;

// Audible council: TTS each pending specialist line in its persona's own Aura voice,
// pushed into the same PCM stream strictly AFTER the chair's audio is done — no
// overlapping speech. We hold each line for its own real duration so the seat
// highlight tracks actual playback rather than a guess.
async function speakPendingLines(): Promise<void> {
  if (live.speaking || live.pendingLines.length === 0) return;
  live.speaking = true;
  try {
    while (live.pendingLines.length > 0) {
      const line = live.pendingLines.shift()!;
      try {
        const res = await fetch(
          `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(line.voice)}&encoding=linear16&sample_rate=${SAMPLE_RATE}&container=none`,
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
        // linear16 mono: 2 bytes per sample. This is how long the room will hear them.
        const durationMs = (pcm.length / 2 / SAMPLE_RATE) * 1000;
        mutate((s) => {
          s.transcript.push({ role: 'specialist', personaId: line.personaId, text: `${line.name}: ${line.text}`, at: Date.now() });
          s.speakingPersonaId = line.personaId;
          s.activity = `${line.name} has the floor`;
        });
        // stream in ~200ms slices so playback starts promptly
        const slice = 9600;
        for (let i = 0; i < pcm.length; i += slice) {
          pushAudio(pcm.subarray(i, Math.min(i + slice, pcm.length)));
        }
        // Hold the floor for the length of the line, then hand it on. Without this
        // every queued line would "start" at once and the highlight would be a lie.
        await sleep(durationMs);
        mutate((s) => {
          if (s.speakingPersonaId === line.personaId) s.speakingPersonaId = undefined;
        });
      } catch {
        // one failed line never blocks the session
      }
    }
  } finally {
    live.speaking = false;
    mutate((s) => {
      if (s.activity?.endsWith('has the floor')) s.activity = undefined;
    });
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
    name: 'seat_panel',
    description:
      "Call this ONCE, the moment the clinician finishes presenting the case and hands you the floor. It seats the panel from the patient's record and what the clinician just said, and returns the cast with each specialist's lens and the turn order. You do not choose the panel — you announce it. Call this BEFORE any chart search.",
    parameters: { type: 'object', properties: {} },
  },
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
      "Present ONE specialist's turn. The system speaks spoken_line ALOUD IN THAT SPECIALIST'S OWN VOICE — never voice it yourself; after calling, give at most one short plain-English chair framing line and move to the next specialist. Call once per seated specialist, in the turn order seat_panel gave you. Claims must cite aliases from search_patient_evidence.",
    parameters: {
      type: 'object',
      properties: {
        personaId: { type: 'string', description: 'the specialist persona id from the seat_panel roster' },
        chair_line: {
          type: 'string',
          description:
            'YOUR one short line handing them the floor, ≤12 words ("Lungs. Go."). It is spoken in your voice immediately before theirs. Put it HERE — never speak it as plain text, which would end your turn and stall the consult.',
        },
        spoken_line: { type: 'string', description: "the specialist's spoken turn, first person, ≤45 words, plain English, citing a dated chart item" },
        claim: { type: 'string', description: 'their leading interpretation for the record' },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description:
            'REQUIRED and non-empty: the evidence aliases (E1, E7…) from search_patient_evidence that this claim rests on. A turn with no aliases is rejected — every specialist argues from the record.',
        },
        contradiction: {
          type: 'object',
          properties: { claim: { type: 'string' }, aliases: { type: 'array', items: { type: 'string' } } },
        },
        discriminator: { type: 'string' },
      },
      required: ['personaId', 'chair_line', 'spoken_line', 'claim', 'aliases'],
    },
  },
  {
    name: 'submit_council_output',
    description:
      'Call ONLY after EVERY seated specialist has had a present_specialist_turn — the call is rejected otherwise. Submits the ranked differential (2-4 items, REQUIRED) and your chair summary. Each differential item MUST carry `supporting` claims with evidence aliases from search_patient_evidence — reuse the aliases the specialists just cited. Anything uncited is labeled CONJECTURE automatically.',
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
      'Propose 2-4 next steps for the selected leading hypothesis — tests AND any specialist consultation, referral or treatment change the direction warrants.',
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
      "Run the live insurance eligibility check (Stedi test mode). Returns only facts the payer response contains. Call this after proposing the workup; the ADVOCATE then speaks the coverage reality and any re-sequencing in her own voice.",
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

// ---- assembly ----
// Seating is decided in one deterministic pass, then REVEALED on a paced timer so
// the room fills chair by chair while the chair speaks over it. The pacing lives on
// the server so a refresh mid-assembly still shows the room in the right state.
async function revealSeats(): Promise<void> {
  const seats = getState().seating?.seats || [];
  for (let i = 0; i < seats.length; i++) {
    await sleep(i === 0 ? 120 : SEAT_REVEAL_MS);
    mutate((s) => {
      const seat = s.seating?.seats[i];
      if (seat && !seat.arrivedAt) seat.arrivedAt = Date.now();
    });
  }
  mutate((s) => {
    if (s.phase === 'assembling') s.phase = 'reasoning';
  });
}

// Watchdog. The chair drives the debate by chaining tool calls; if it emits plain
// speech instead, its turn ends and nothing wakes it — the room just goes quiet
// mid-consult. Rather than trust the prompt alone, we notice the silence and nudge
// it back to the next specialist. Never invents content: it only says whose turn
// it is, which the orchestrator already knows.
function armDebateWatchdog(): void {
  if (live.watchdog) clearInterval(live.watchdog);
  live.watchdog = setInterval(() => {
    const s = getState();
    const stalled = Date.now() - live.lastToolAt > 14000;
    const midDebate = ['assembling', 'reasoning', 'retrieving-evidence'].includes(s.phase);
    if (!stalled || !midDebate || !live.ready || live.speaking) return;

    const spoken = new Set(s.contributions.map((c) => c.personaId));
    const next = seatedSpecialists(s.seating || { seats: [] })
      .filter((seat) => personaById(seat.personaId || '')?.kind === 'specialist')
      .find((seat) => !spoken.has(seat.personaId!));

    live.lastToolAt = Date.now(); // don't re-nudge until something has had time to happen
    if (next) {
      inject(`Continue the consult: call present_specialist_turn for ${personaById(next.personaId!)!.name} now, with your hand-off in chair_line. Do not reply in plain text.`);
    } else if (s.differential.length === 0 && s.contributions.length > 0) {
      inject('Every specialist has been heard. Call submit_council_output now with the ranked differential, carrying their evidence aliases onto it.');
    }
  }, 4000);
}

function disarmDebateWatchdog(): void {
  if (live.watchdog) clearInterval(live.watchdog);
  live.watchdog = null;
}

/** The clinician's own words this session — the second half of the seating input. */
function spokenPresentation(): string {
  return getState()
    .transcript.filter((t) => t.role === 'clinician')
    .map((t) => t.text)
    .join(' ')
    .slice(0, 2000);
}

// ---- tool implementations (server side — validation + state, no generation) ----
async function runTool(name: string, args: any): Promise<unknown> {
  const chart = live.chart!;
  const amap = aliasMapOf(chart);
  const cfg = activeCase();

  if (name === 'seat_panel') {
    if (live.seated) {
      return { error: 'The panel is already seated. Proceed with search_patient_evidence and the specialist turns.' };
    }
    live.seated = true;
    const presentation = spokenPresentation();
    const features = deriveFeatures(chart.resources, { age: chart.age, sex: chart.sex }, cfg.chiefComplaint, presentation);
    const seating = decideSeating(features, ROSTER, cfg.clinicianSpecialty);

    mutate((s) => {
      s.features = features;
      s.seating = seating;
      s.phase = 'assembling';
      s.activity = 'seating the panel…';
    });
    void revealSeats();

    const specialists = seatedSpecialists(seating).filter((seat) => {
      const p = seat.personaId ? personaById(seat.personaId) : undefined;
      return p?.kind === 'specialist';
    });
    const empty = emptySeats(seating);

    return {
      seated: specialists.map((seat) => {
        const p = personaById(seat.personaId!)!;
        return { personaId: p.id, name: p.name, specialty: p.specialty, lens: p.lens, seated_because: seat.reasons[0] };
      }),
      empty_seats: empty.map((seat) => ({ specialty: seat.specialty, needed_because: seat.reasons[0] })),
      turn_order: specialists.map((seat) => personaById(seat.personaId!)!.name),
      advocate: { personaId: 'advocate', name: 'ADVOCATE', role: 'coverage and cost — called last, after the workup' },
      note:
        'The room is filling now, one chair at a time. Say ONE short line naming who you have pulled in and why, in your own voice.' +
        (empty.length
          ? ` You MUST also say out loud that ${empty.map((e) => e.specialty).join(' and ')} is required by this case and is NOT in the room, and that nobody will improvise it.`
          : '') +
        ' Then start searching the chart. Do NOT read this JSON aloud.',
    };
  }

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
    // Guardrail #1 has teeth only if it binds the model too: a specialist who was
    // not seated for this case does not get the floor.
    const seat = getState().seating?.seats.find((st) => st.personaId === p.id);
    if (!seat) {
      return {
        error: `${p.name} is not seated for this case. Seated specialists only: ${(getState().seating?.seats || [])
          .filter((st) => st.status === 'seated' && st.personaId && st.personaId !== 'house')
          .map((st) => st.personaId)
          .join(', ')}`,
      };
    }
    // Cited-or-conjecture, enforced at the door rather than after the fact. A
    // specialist turn that rests on nothing in the record is sent back — the
    // panel's whole claim to be reading THIS chart lives here.
    const claimed = validateArgument({ claim: args.claim, aliases: args.aliases }, amap);
    if (claimed.resolved.length === 0) {
      const onRecord = [...new Set(getState().contributions.flatMap((c) => c.interpretation.resolved.map((e) => e.alias)))];
      return {
        error: `${p.name}'s claim carries no valid evidence alias. Search the chart for what supports their angle, then resubmit this turn with aliases from the results.`,
        hint: 'aliases must be codes returned by search_patient_evidence, like ["E7","E19"]',
        ...(onRecord.length ? { aliases_already_on_the_record: onRecord } : {}),
      };
    }
    const contribution: SpecialistContribution = {
      personaId: p.id,
      specialty: p.specialty,
      interpretation: claimed,
      contradiction: args.contradiction ? validateArgument(args.contradiction, amap) : undefined,
      discriminator: args.discriminator ? String(args.discriminator).slice(0, 200) : undefined,
    };
    mutate((s) => {
      s.contributions = [...s.contributions.filter((c) => c.personaId !== p.id), contribution];
      // The scribe writes the point down as it is made, with its citations intact.
      note(s, {
        kind: 'position',
        dedupeKey: `pos-${p.id}`,
        speaker: p.name,
        personaId: p.id,
        text: contribution.interpretation.claim,
        detail: contribution.discriminator,
        cites: contribution.interpretation.resolved,
        provenance: contribution.interpretation.provenance,
      });
      if (contribution.contradiction?.claim) {
        note(s, {
          kind: 'position',
          dedupeKey: `pos-${p.id}-against`,
          speaker: p.name,
          personaId: p.id,
          text: `Against: ${contribution.contradiction.claim}`,
          cites: contribution.contradiction.resolved,
          provenance: contribution.contradiction.provenance,
        });
      }
    });
    // The chair's hand-off and the specialist's answer are queued together, in that
    // order, so the room hears "Lungs. Go." — "Sixteen days of steroids…" as one
    // exchange. Queuing the chair line here rather than letting the model speak it
    // is what keeps the consult moving: plain speech ends the model's turn.
    const chair = ROSTER.find((r) => r.kind === 'chair');
    const chairLine = String(args.chair_line || '').trim();
    if (chairLine && chair?.voice) {
      live.pendingLines.push({ name: chair.name, voice: chair.voice, text: chairLine.slice(0, 120), personaId: chair.id });
    }
    if (p.voice) {
      live.pendingLines.push({ name: p.name, voice: p.voice, text: String(args.spoken_line || args.claim).slice(0, 500), personaId: p.id });
      setTimeout(() => void speakPendingLines(), 400);
    }
    const remaining = seatedSpecialists(getState().seating || { seats: [] })
      .filter((seat) => personaById(seat.personaId || '')?.kind === 'specialist')
      .filter((seat) => !getState().contributions.some((c) => c.personaId === seat.personaId));
    return {
      ok: true,
      spoken_in_own_voice: true,
      provenance: contribution.interpretation.provenance,
      still_to_speak: remaining.map((seat) => ({ personaId: seat.personaId, name: personaById(seat.personaId!)!.name })),
      note: remaining.length
        ? `Their line is being spoken now — do NOT repeat it. Immediately call present_specialist_turn for ${personaById(remaining[0].personaId!)!.name} next, with your hand-off in chair_line. Do not speak plain text in between.`
        : 'Their line is being spoken now. Every specialist has been heard — call submit_council_output next, carrying their aliases onto the differential.',
    };
  }

  if (name === 'submit_council_output') {
    // Turn order is enforced HERE, not in the prompt. DEMO_SPEC §9: predictability
    // comes from the orchestrator, the prompts and the timing budget — not from
    // scripting. A chair that races to the differential after one voice gets sent
    // back for the rest of the panel.
    const spoken = new Set(getState().contributions.map((c) => c.personaId));
    const silent = seatedSpecialists(getState().seating || { seats: [] })
      .filter((seat) => personaById(seat.personaId || '')?.kind === 'specialist')
      .filter((seat) => !spoken.has(seat.personaId!));
    if (silent.length > 0) {
      return {
        error: `Not yet — ${silent.map((s) => personaById(s.personaId!)!.name).join(', ')} ${silent.length === 1 ? 'has' : 'have'} not been heard. Call present_specialist_turn for each of them first, in order, then submit.`,
        still_to_speak: silent.map((s) => ({ personaId: s.personaId, name: personaById(s.personaId!)!.name })),
      };
    }
    if (!Array.isArray(args.differential) || args.differential.length < 2) {
      return { error: 'differential must be a RANKED LIST of 2-4 items (leading + the alternatives being excluded, each with evidence aliases) — resubmit the full ranked differential.' };
    }
    // A differential where nothing carries a citation is a story, not a reading of
    // this chart. The specialists cited; the ranking must inherit those citations.
    const anyCited = (args.differential || []).some(
      (d: any) => Array.isArray(d.supporting) && d.supporting.some((x: any) => Array.isArray(x.aliases) && x.aliases.length > 0)
    );
    if (!anyCited) {
      return {
        error:
          'Every differential item needs `supporting` claims carrying evidence aliases (E1, E2…) from search_patient_evidence — the same ones the specialists just cited. Resubmit with citations, or the whole ranking is labelled CONJECTURE.',
        aliases_already_on_the_record: [...new Set(getState().contributions.flatMap((c) => c.interpretation.resolved.map((e) => e.alias)))],
      };
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
      if (['reasoning', 'retrieving-evidence', 'assembling', 'case-ready', 'listening', 'opening'].includes(s.phase)) {
        s.phase = 'differential-ready';
      }
      s.activity = demoted > 0 ? `${demoted} uncited claim(s) demoted to conjecture` : 'all claims cited';

      // Minutes: the ranked differential, and every distinct chart fact it rests on.
      for (const d of s.differential) {
        note(s, {
          kind: 'direction',
          dedupeKey: `dx-${d.id}`,
          speaker: 'HOUSE',
          text: `${d.rank}. ${d.display}`,
          detail: d.assessment,
          cites: d.supporting.flatMap((a) => a.resolved),
          provenance: d.supporting.some((a) => a.provenance === 'cited') ? 'cited' : 'conjecture',
        });
      }
      const seen = new Set(s.notepad.filter((n) => n.kind === 'evidence').map((n) => n.id));
      for (const d of s.differential) {
        for (const a of [...d.supporting, ...d.contradicting]) {
          for (const e of a.resolved) {
            if (seen.has(`ev-${e.alias}`)) continue;
            seen.add(`ev-${e.alias}`);
            note(s, {
              kind: 'evidence',
              dedupeKey: `ev-${e.alias}`,
              text: e.fact,
              detail: e.date ? `${e.resourceType} · ${e.date.slice(0, 10)}` : e.resourceType,
              cites: [e],
              provenance: 'cited',
            });
          }
        }
      }
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
      // Pathway floor: the standard pathway includes a specialist consultation. If
      // the model omitted one, add the consult for whichever specialty this case
      // actually seated — never a hardcoded specialty.
      if (!s.workup.some((o) => CONSULT_RE.test(o.display))) {
        const lead = seatedSpecialists(s.seating || { seats: [] }).find(
          (seat) => personaById(seat.personaId || '')?.kind === 'specialist'
        );
        const specialty = (lead?.specialty || 'internal medicine').replace(/-/g, ' ');
        s.workup.push({
          id: `opt-${s.workup.length + 1}`,
          display: `${specialty.charAt(0).toUpperCase()}${specialty.slice(1)} consultation`,
          purpose: 'Specialist evaluation for the leading direction (standard pathway step)',
          priority: 'next',
          selected: true,
          sequenceNote: 'added per standard pathway',
        });
      }
      s.phase = 'workup-ready';
      s.activity = undefined;
      for (const o of s.workup) {
        note(s, {
          kind: 'plan',
          dedupeKey: `plan-${o.id}`,
          speaker: 'HOUSE',
          text: o.display,
          detail: o.purpose,
          priority: o.priority,
          cites: [],
        });
      }
    });
    return { ok: true };
  }

  if (name === 'get_benefits') {
    mutate((s) => { s.phase = 'checking-benefits'; s.activity = 'live eligibility check (Stedi test mode)…'; });
    try {
      const { runEligibility } = await import('./stedi');
      const { facts } = await runEligibility(cfg.stediScenario);
      mutate((s) => {
        s.benefits = facts;
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
        note(s, {
          kind: 'coverage',
          dedupeKey: 'coverage',
          speaker: 'ADVOCATE',
          personaId: 'advocate',
          text: [
            facts.planActive ? 'Plan active' : 'Plan shows inactive',
            facts.copay && `specialist copay ${facts.copay}`,
            facts.deductibleRemaining && `deductible remaining ${facts.deductibleRemaining}`,
            facts.oopRemaining && `out-of-pocket remaining ${facts.oopRemaining}`,
          ]
            .filter(Boolean)
            .join(' · '),
          detail: facts.messages.join(' · ') || 'Payer-reported figures, not guarantees.',
          cites: [],
        });
        for (const o of s.workup) {
          if (o.sequenceNote) {
            note(s, { kind: 'plan', dedupeKey: `plan-${o.id}`, speaker: 'HOUSE', text: o.display, detail: `${o.purpose} — ${o.sequenceNote}`, priority: o.priority, cites: [] });
          }
        }
      });
      // The advocate speaks the facts herself — composed ONLY from the returned
      // response, in her own voice, queued behind current speech.
      const advocate = ROSTER.find((r) => r.kind === 'reimbursement');
      if (advocate?.voice) {
        const referralMsg = facts.messages.find((m) => /referral/i.test(m));
        const line = [
          'Coverage check is back.',
          facts.planActive ? 'The plan is active.' : 'The plan shows inactive.',
          facts.copay ? `Specialist visits carry a ${facts.copay.replace('$', '')} dollar copay.` : '',
          facts.deductibleRemaining === '$0' ? 'The deductible is already met.' : facts.deductibleRemaining ? `${facts.deductibleRemaining.replace('$', '')} dollars left on the deductible.` : '',
          facts.oopRemaining ? `${facts.oopRemaining.replace('$', '')} dollars left on the out-of-pocket max.` : '',
          referralMsg ? 'One gate: the payer requires a P C P referral before the specialist visit — I have re-sequenced the consult behind it. Labs proceed now.' : '',
          'Payer-reported figures, not guarantees.',
        ].filter(Boolean).join(' ');
        live.pendingLines.push({ name: advocate.name, voice: advocate.voice, text: line, personaId: advocate.id });
        setTimeout(() => void speakPendingLines(), 3000);
      }
      return {
        facts: {
          planActive: facts.planActive,
          specialistCopay: facts.copay,
          deductibleRemaining: facts.deductibleRemaining,
          outOfPocketRemaining: facts.oopRemaining,
          payerMessages: facts.messages,
          note: 'The ADVOCATE has ALREADY spoken these facts aloud — do NOT repeat the numbers; just move the discussion forward.',
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
// Case-agnostic and panel-agnostic on purpose. The chair does not know who is on the
// panel when this is written, because the panel does not exist until the clinician
// has spoken. seat_panel supplies the cast, their lenses and the turn order.
function councilPrompt(): string {
  const s = getState();
  const cfg = activeCase();
  const bench = ROSTER.filter((r) => r.kind === 'specialist')
    .map((p) => `- ${p.name} (${p.specialty}, id:${p.id}) — lens: ${p.lens} · manner: ${p.style}`)
    .join('\n');
  const chair = ROSTER.find((r) => r.kind === 'chair')!;
  const advocate = ROSTER.find((r) => r.kind === 'reimbursement')!;

  return [
    `You run a live AI panel consult as its entire cast. SPOKEN VOICE: you speak ONLY as the chair — ${chair.style} NEVER prefix speech with a speaker label. BAD: "HOUSE: Good." GOOD: "Good." You ARE the voice.`,

    `THE OPENING — do this first and then STOP: greet the clinician in ONE short sentence and ask them to tell you about the case. Nothing else. The room is empty; there is no panel yet and you have not read anything. Do not speculate, do not list, do not ask a second question. Then wait in silence for them to present.`,

    `THE HANDOFF: the clinician (${cfg.clinicianName}) presents their patient, their theory and their question, and hands you the floor with a phrase like "can you take a look?". The MOMENT they hand off, call seat_panel. It returns the cast, each specialist's lens, and the turn order.`,

    `THE BENCH (who can be seated — seat_panel decides which of them actually are, from the record and what the clinician said; you never pick):\n${bench}\nPlus ${advocate.name} (id:${advocate.id}) for coverage and cost, called last.`,

    `RULES:
(1) Decision support, not diagnosis — the panel argues, the clinician decides. Never present a diagnosis as established.
(2) Before ANY patient-specific claim, call search_patient_evidence — AT LEAST THREE searches from different angles: the current presentation; labs and studies across the years; old intake, social history and nursing notes. Longitudinal records hide the good clues years back, and nursing notes hold what physician notes skip. Read oldest_history_not_in_results every time. Cite only returned aliases (E1, E2…) in tool JSON; uncited claims auto-label CONJECTURE.
(3) TURN ORDER comes from seat_panel. Work through the seated specialists one at a time with present_specialist_turn, putting your hand-off ("Lungs. Go.") in its chair_line argument — the system speaks your line and then theirs, in their own voice. Never voice a specialist yourself and never repeat their line.
(3a) CRITICAL MECHANIC: once the panel is seated, do not emit plain speech between tool calls. Chain the calls back to back — each one's result tells you who is still to speak. Plain speech ends your turn and the room goes silent waiting for you. Everything you want said mid-debate goes in chair_line.
(4) Each specialist argues through THEIR OWN LENS, from what the searches actually returned. They have no prior knowledge of this patient. If the record does not support a specialist's usual angle, they say so — that is a real finding, not a failure.
(5) EMPTY SEATS: if seat_panel reports one, say out loud which expertise this case needs and does not have, and that nobody will improvise it.
(6) PLAIN ENGLISH for a lay audience: everyday words first, at most one technical term per turn, introduced after the plain phrase ("look inside his lungs with a camera — a bronchoscopy").
(7) Challenge the weakest-cited claim before accepting it.
(8) EVERY seated specialist speaks before you rank anything. Only once they all have: submit_council_output, carrying the aliases they cited forward onto the differential items. Then speak your synthesis — answer the clinician's ORIGINAL question directly, name the leading possibility and what is urgent, in two or three sentences. Do NOT recite the ranked list aloud; the notepad shows it.
(9) After the clinician selects a direction: propose_workup, then get_benefits. The ADVOCATE speaks the returned figures herself — don't repeat them; connect the affordable plan to the safe plan. Never invent prices or coverage.
(10) SPOKEN OUTPUT: after each tool call, ONE short line, then hand the floor on. NEVER read structured output, bullets, lists or JSON aloud — the screen shows the detail.
(11) CRITICAL: tool calls go ONLY through the function-calling channel. NEVER write JSON, braces, or tool arguments in spoken text. If you catch yourself starting a "{", stop and make the function call instead.`,

    `PATIENT (synthetic): ${s.patient?.name}, DOB ${s.patient?.dob}. You have NOT read the chart yet — search it.`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildSettings(thinkModel: string) {
  const think: any = { provider: { type: 'open_ai', model: thinkModel }, prompt: councilPrompt().slice(0, 24000), functions: FUNCTION_DEFS };
  // NOTE: no temperature — gpt-5-mini hard-rejects non-default values (verified live).
  return {
    type: 'Settings',
    audio: { input: { encoding: 'linear16', sample_rate: SAMPLE_RATE }, output: { encoding: 'linear16', sample_rate: SAMPLE_RATE, container: 'none' } },
    agent: {
      language: 'en',
      listen: { provider: { type: 'deepgram', model: 'nova-3' } },
      think,
      speak: { provider: { type: 'deepgram', model: ROSTER.find((r) => r.kind === 'chair')?.voice || 'aura-2-odysseus-en' } },
      // The chair opens the room: one line asking for the case, then silence. The
      // panel does not exist yet — it is seated from what the clinician says next.
      greeting: 'Right. Tell me about your patient.',
    },
  };
}

// ---- session lifecycle ----
/** Phase 1: load the record and open the room. No panel is seated yet — that waits
 *  on the clinician, because what they say is half of the seating input. */
export async function assemble(caseId?: string): Promise<void> {
  mutate((s) => {
    if (caseId && caseId !== s.caseId) {
      s.caseId = caseId;
      s.seating = undefined;
      s.features = undefined;
    }
    s.phase = 'opening';
    s.activity = 'loading the chart from Medplum…';
  });
  const cfg = activeCase();
  const chart = await loadChart(cfg);
  live.chart = chart;
  live.seated = false;
  mutate((s) => {
    s.patient = chart.banner;
    s.activity = `chart loaded — ${chart.aliases.length} records`;
  });
  const { kickChartIndex } = await import('./moss');
  kickChartIndex(chart);
  void loadBenefits();

  await openAgent();
}

/** Pull eligibility once when the chart opens, so coverage is on the provider page
 *  before the consult starts and the advocate speaks from the same parsed result. */
export async function loadBenefits(): Promise<void> {
  try {
    const { runEligibility } = await import('./stedi');
    const { facts } = await runEligibility(activeCase().stediScenario);
    mutate((s) => { s.benefits = facts; });
  } catch {
    // The provider page renders "coverage unavailable" — never a fabricated benefit.
  }
}

// gpt-4o-mini: ~0.4s to first token vs gpt-5-mini's 7-15s — conversational feel wins.
// Structure/guardrails are code-enforced regardless of model depth.
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
      // The chair greets and asks for the case; the room stays empty until the
      // clinician answers. Their words are half the seating input.
      live.lastToolAt = Date.now();
      armDebateWatchdog();
      mutate((s) => { s.phase = 'listening'; s.activity = 'the chair is asking for your case'; });
      return;
    }
    if (msg.type === 'ConversationText') {
      const text = String(msg.content || '').replace(/^\s*(?:speaking as\s+)?(?:the\s+)?(?:chair|house(?:,?\s*m\.?d\.?)?)(?:\s*\([^)]{0,40}\))?\s*[:—-]+\s*/i, '');
      // Guard: models occasionally echo prompt fragments as assistant turns — keep
      // the spoken transcript short, human lines only.
      if (msg.role === 'assistant' && (text.length > 500 || /SEATED COUNCIL|RULES:|THE BENCH|argument style|^\s*[-•({[]|^\s*(Interpretation|Contradiction|Discriminator|Evidence)\b|"(aliases|personaId|spoken_line|claim|differential|rank)"\s*:|[{}\[\]]\s*$/i.test(text))) return;
      // Hide stage-direction injects (our composed instructions) from the visible dialog.
      if (msg.role !== 'assistant' && /submit_council_output|propose_workup|get_benefits|seat_panel|convene the council/i.test(text)) return;
      mutate((s) => {
        const role = msg.role === 'assistant' ? 'chair' : 'clinician';
        const last = s.transcript[s.transcript.length - 1];
        if (last && last.role === role && last.text === text) return; // dedupe repeats
        s.transcript.push({ role, personaId: role === 'chair' ? 'house' : undefined, text, at: Date.now() });
      });
      return;
    }
    if (msg.type === 'FunctionCallRequest') {
      live.lastToolAt = Date.now();
      for (const fn of msg.functions || []) {
        let args = {};
        try { args = JSON.parse(fn.arguments || '{}'); } catch {}
        const result = await runTool(fn.name, args);
        live.lastToolAt = Date.now();
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
      mutate((s) => { s.activity = 'hearing you…'; s.speakingPersonaId = undefined; });
      return;
    }
    if (msg.type === 'AgentStartedSpeaking') {
      mutate((s) => { s.activity = 'the chair is speaking'; s.speakingPersonaId = 'house'; });
      return;
    }
    if (msg.type === 'AgentAudioDone') {
      mutate((s) => {
        s.activity = undefined;
        if (s.speakingPersonaId === 'house') s.speakingPersonaId = undefined;
      });
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
          s.error = 'Voice session closed unexpectedly — retry re-opens the room (the notepad is kept)';
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
  mutate((s) => { s.transcript.push({ role: 'clinician', text, at: Date.now() }); });
  return inject(text);
}

export function selectHypothesis(id: string): void {
  mutate((s) => {
    s.selectedHypothesisId = id;
    for (const d of s.differential) d.status = d.id === id ? 'leading' : d.status === 'leading' ? 'candidate' : d.status;
    s.phase = 'hypothesis-selected';
    const dx = s.differential.find((d) => d.id === id);
    if (dx) {
      note(s, {
        kind: 'direction',
        dedupeKey: 'direction-selected',
        speaker: 'YOU',
        text: `Direction set: ${dx.display}`,
        detail: 'Selected by the managing clinician — not a confirmed diagnosis.',
        cites: [],
      });
    }
  });
  const s = getState();
  const dx = s.differential.find((d) => d.id === id);
  inject(
    `The managing clinician selects "${dx?.display}" as the leading direction (not confirmed). Call propose_workup for it — include the specialist consultation or treatment change the standard pathway warrants alongside the tests — then get_benefits.`
  );
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
    opts.some((o) => o.benefit?.copay)
      ? `What your insurance said: your plan is active; a specialist visit has a ${opts.find((o) => o.benefit?.copay)?.benefit?.copay} copay. Some tests did not return specific coverage information — the office will confirm before scheduling. These are estimates, not guarantees.`
      : 'Coverage details will be confirmed by the office before scheduling.',
    'Your doctor makes every decision with you. Bring questions — nothing here is set without your consent.',
  ].join('\n\n');
}

export function closeAgent(): void {
  live.ready = false;
  live.pendingLines = [];
  disarmDebateWatchdog();
  if (live.keepAlive) {
    clearInterval(live.keepAlive);
    live.keepAlive = null;
  }
  if (live.ws) {
    try { live.ws.close(); } catch {}
    live.ws = null;
  }
}
