'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Argument, ConversationTurn, EvidenceRef, Seat, SessionState } from '../src/shared/types';

// The panel consult room. Decision support, not diagnosis: the panel argues, the
// clinician decides. One long table — House at the head, you at the foot with the
// microphone, experts along the sides. The flow IS the interface: convene, speak,
// listen, set the direction, write the plan to the chart.

type S = SessionState & { version: number };

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function useSession(): S | null {
  const [s, setS] = useState<S | null>(null);
  const lastVersion = useRef(-1);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/session', { cache: 'no-store' });
        const next: S = await r.json();
        // Only re-render when server state actually changed — polling without this
        // repaints the whole table every 700ms and feels randomly laggy.
        if (alive && next.version !== lastVersion.current) {
          lastVersion.current = next.version;
          setS(next);
        }
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 700);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return s;
}

// Panel speech: pull the PCM stream and play through Web Audio. An analyser taps
// the same graph and publishes live loudness as --audio-level, so the speaking
// seat's ring pulses with the actual voice. `interrupted` flips when the session
// hears the clinician — we hard-flush the scheduled buffer so the chair actually
// shuts up when interrupted instead of playing out its backlog.
function useChairAudio(enabled: boolean, interrupted: boolean) {
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (interrupted) flushRef.current();
  }, [interrupted]);
  useEffect(() => {
    if (!enabled) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const meter = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      document.documentElement.style.setProperty('--audio-level', Math.min(1, rms * 4).toFixed(3));
      raf = requestAnimationFrame(meter);
    };
    raf = requestAnimationFrame(meter);
    const scheduled = new Set<AudioBufferSourceNode>();
    let nextAt = 0;
    let stop = false;
    flushRef.current = () => {
      for (const src of scheduled) { try { src.stop(); } catch {} }
      scheduled.clear();
      nextAt = 0;
    };
    (async () => {
      try {
        const res = await fetch('/api/audio');
        const reader = res.body!.getReader();
        let carry = new Uint8Array(0);
        while (!stop) {
          const { done, value } = await reader.read();
          if (done) break;
          const buf = new Uint8Array(carry.length + value.length);
          buf.set(carry); buf.set(value, carry.length);
          const usable = buf.length - (buf.length % 2);
          carry = buf.slice(usable);
          const pcm = new Int16Array(buf.buffer.slice(0, usable));
          if (pcm.length === 0) continue;
          const f32 = new Float32Array(pcm.length);
          for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
          const ab = ctx.createBuffer(1, f32.length, 24000);
          ab.copyToChannel(f32, 0);
          const src = ctx.createBufferSource();
          src.buffer = ab;
          src.connect(analyser);
          src.onended = () => scheduled.delete(src);
          scheduled.add(src);
          nextAt = Math.max(nextAt, ctx.currentTime + 0.15);
          src.start(nextAt);
          nextAt += ab.duration;
        }
      } catch {}
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      document.documentElement.style.setProperty('--audio-level', '0');
      flushRef.current();
      ctx.close();
    };
  }, [enabled]);
}

// Always-on mic with instant mute/unmute. Setup (permission + WS + worklet) happens
// ONCE on first enable; after that the toggle just gates frames — zero latency, no
// lost first words. While unmuted, audio streams continuously to the session's
// nova-3 listen leg; its VAD handles turns and barge-in.
function useMic() {
  const ref = useRef<{ ws?: WebSocket; ctx?: AudioContext; stream?: MediaStream; live: boolean; muted: boolean }>({ live: false, muted: true });
  const [state, setState] = useState<'off' | 'muted' | 'live'>('off');
  const toggle = useCallback(async () => {
    const r = ref.current;
    if (r.live) {
      r.muted = !r.muted;
      setState(r.muted ? 'muted' : 'live');
      return;
    }
    try {
      const ws = new WebSocket(`ws://${location.host}/ws/voice`);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext({ sampleRate: 24000 });
      await ctx.resume(); // autoplay policy can leave it suspended → silent capture
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-capture');
      node.port.onmessage = (e) => {
        const cur = ref.current;
        if (!cur.ws || cur.ws.readyState !== 1) return;
        // CONTINUOUS stream: mute sends zero-frames instead of stopping — Deepgram's
        // turn detection breaks on stalled streams (>10s transcript delays), and
        // resuming mid-stream eats the first words. Unmute = pure flag flip.
        cur.ws.send(cur.muted ? new ArrayBuffer((e.data as ArrayBuffer).byteLength) : e.data);
      };
      src.connect(node);
      ws.onclose = () => { ref.current.live = false; ref.current.muted = true; setState('off'); };
      ref.current = { ws, ctx, stream, live: true, muted: false };
      setState('live');
    } catch {
      setState('off');
    }
  }, []);
  return { state, toggle };
}

// ---- Presentation helpers (no logic). Seat roles and labels read seat DATA, never
// the roster, so a persona/case swap reseats the room with zero code changes. ----

type SeatRole = 'chair' | 'human' | 'reimb' | 'empty' | 'specialist';
function seatRole(seat: Seat): SeatRole {
  if (seat.status === 'empty') return 'empty';
  if (seat.status === 'human') return 'human';
  if (seat.personaId === 'house' || seat.personaId === 'chair-house' || seat.reasons[0] === 'moderates every council') return 'chair';
  if (seat.specialty === 'reimbursement') return 'reimb';
  return 'specialist';
}

// Brief table names, DEMO_SPEC register: PULMO, GASTRO, I.D., ADVOCATE.
const SHORT_LABEL: Record<string, string> = {
  pulmonology: 'PULMO',
  gastroenterology: 'GASTRO',
  'infectious-disease': 'I.D.',
  reimbursement: 'ADVOCATE',
  'diagnostic-skeptic': 'SKEPTIC',
  cardiology: 'CARDIO',
  nephrology: 'NEPHRO',
  neurology: 'NEURO',
  'clinical-pharmacology': 'PHARM',
  endocrinology: 'ENDO',
  hematology: 'HEME',
};
function shortLabel(seat: Seat): string {
  if (seatRole(seat) === 'chair') {
    const surname = (seat.personaName || 'Chair').replace(/,.*$/, '').trim().split(/\s+/).pop();
    return (surname || 'CHAIR').toUpperCase();
  }
  return SHORT_LABEL[seat.specialty] || seat.specialty.split('-')[0].slice(0, 7).toUpperCase();
}

// Fixed panel strip — visual cast at the top of the room (avatars + brief labels).
const PANEL_STRIP: {
  label: string;
  avatar: string;
  personaIds: string[];
  specialties: string[];
  role: SeatRole;
}[] = [
  { label: 'HOUSE', avatar: '/avatars/house.png', personaIds: ['house', 'chair-house'], specialties: ['internal-medicine'], role: 'chair' },
  { label: 'SKEPTIC', avatar: '/avatars/skeptic.png', personaIds: ['skeptic'], specialties: ['diagnostic-skeptic'], role: 'specialist' },
  { label: 'CARDIO', avatar: '/avatars/cardiology.png', personaIds: ['cardiology'], specialties: ['cardiology'], role: 'specialist' },
  { label: 'NEPHRO', avatar: '/avatars/nephrology.png', personaIds: ['nephrology'], specialties: ['nephrology'], role: 'specialist' },
  { label: 'NEURO', avatar: '/avatars/neurology.png', personaIds: ['neurology'], specialties: ['neurology'], role: 'specialist' },
  { label: 'ENDO', avatar: '/avatars/endocrinology.png', personaIds: ['endocrinology'], specialties: ['endocrinology'], role: 'specialist' },
  { label: 'HEME', avatar: '/avatars/hematology.png', personaIds: ['hematology'], specialties: ['hematology'], role: 'specialist' },
  { label: 'ADVOCATE', avatar: '/avatars/reimbursement.png', personaIds: ['advocate'], specialties: ['reimbursement', 'patient-advocacy'], role: 'reimb' },
];

function panelSlotSpeaking(
  slot: typeof PANEL_STRIP[number],
  floorTurn: ConversationTurn | null,
  seats: Seat[]
): boolean {
  if (!floorTurn) return false;
  if (floorTurn.personaId && slot.personaIds.includes(floorTurn.personaId)) return true;
  if (floorTurn.role === 'chair' && slot.role === 'chair') return true;
  const seat = seats.find(
    (st) =>
      (st.personaId && slot.personaIds.includes(st.personaId)) ||
      slot.specialties.includes(st.specialty)
  );
  if (seat && floorTurn.personaId === seat.personaId) return true;
  return false;
}

function PanelSeat({ slot, speaking }: { slot: typeof PANEL_STRIP[number]; speaking: boolean }) {
  return (
    <div className={`seat ${slot.role}${speaking ? ' speaking' : ''}`}>
      <div className="seat-avatar">
        <Image src={slot.avatar} alt="" width={48} height={48} />
      </div>
      <span className="seat-label">{slot.label}</span>
    </div>
  );
}

const PHASE_STATUS: Partial<Record<S['phase'], string>> = {
  listening: 'the panel is listening…',
  reasoning: 'the panel is thinking…',
  'retrieving-evidence': 'reading the chart…',
  'checking-benefits': 'running the insurance…',
  'writing-fhir': 'writing to the chart…',
};

export default function Page() {
  const s = useSession();
  const [drawer, setDrawer] = useState<{ title: string; json: unknown } | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [finalized, setFinalized] = useState<string | null>(null);
  const [created, setCreated] = useState<{ resourceType: string; id: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const mic = useMic();
  useChairAudio(audioOn, s?.activity === 'hearing you…');

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 999999 });
  }, [s?.transcript.length]);

  const openCite = useCallback(async (rt: string, id: string) => {
    setDrawer({ title: `${rt}/${id}`, json: { loading: true } });
    const r = await fetch(`/api/resource/${rt}/${id}`);
    setDrawer({ title: `${rt}/${id}`, json: await r.json() });
  }, []);

  const finalize = useCallback(async () => {
    if (!s) return;
    const plan = await (await fetch('/api/session/plan-text')).json();
    const leading = s.differential.find((d) => d.id === s.selectedHypothesisId);
    const res = await post('/api/finalize', {
      sessionSummary: {
        patientId: s.patient?.medplumId || 'dev-local',
        leadingDx: leading?.display || '',
        differential: s.differential.map((d) => ({ display: d.display, assessment: d.assessment, rank: d.rank })),
        selectedOptions: s.workup.filter((o) => o.selected).map((o) => ({ display: o.display, purpose: o.purpose, sequenceNote: o.sequenceNote })),
        patientPlanText: plan.text,
      },
    });
    const data = await res.json();
    setFinalized(res.ok ? `Wrote ${data.created?.length ?? 0} resources to the chart.` : `Write-back failed: ${data.error}`);
    if (res.ok) setCreated(data.created || []);
  }, [s]);

  if (!s) return <div className="loading">loading…</div>;

  const seats = s.seating?.seats || [];
  const chairSeat = seats.find((st) => seatRole(st) === 'chair');
  const canConvene = s.phase === 'case-ready' || s.phase === 'recoverable-error';
  // Finalize is gated on the clinical flow: leading dx selected AND a proposed
  // workup with selected options AND the session in a plan-ready phase.
  const canFinalize =
    (s.phase === 'benefits-ready' || s.phase === 'workup-ready') &&
    !!s.selectedHypothesisId &&
    s.workup.some((o) => o.selected);
  const leading = s.differential.find((d) => d.status === 'leading');
  const allCreated = [...created, ...s.createdResources];

  // The record, cited live: every chart fact the debate has resolved so far,
  // deduped by alias — this is real Medplum data surfacing in real time.
  const evidence: EvidenceRef[] = [];
  {
    const seen = new Set<string>();
    const collect = (a?: Argument) =>
      a?.resolved.forEach((e) => { if (!seen.has(e.alias)) { seen.add(e.alias); evidence.push(e); } });
    s.contributions.forEach((c) => { collect(c.interpretation); collect(c.contradiction); });
    s.differential.forEach((d) => { d.supporting.forEach(collect); d.contradicting.forEach(collect); });
    evidence.sort((a, b) => Number(a.alias.replace(/\D/g, '')) - Number(b.alias.replace(/\D/g, '')));
  }
  const status = s.activity || PHASE_STATUS[s.phase] || '';
  const yourMove =
    s.phase === 'listening'
      ? mic.state === 'off'
        ? 'The panel is seated and listening — enable your mic and present your case.'
        : 'The panel is listening — present your case and ask your question.'
      : s.phase === 'differential-ready' && !s.selectedHypothesisId
        ? 'The panel rests — your call, doctor: set the leading direction below.'
        : s.phase === 'workup-ready' || s.phase === 'benefits-ready'
          ? 'Your move: review the plan and coverage, then write it to the chart.'
          : null;

  // Who has the floor: the seat behind the most recent non-clinician turn, if fresh.
  // Turns carrying internal tool names are orchestration echoes, not speech — hide them.
  const visibleTurns = s.transcript.filter(
    (t) => t.role !== 'system' && !/submit_council_output|propose_workup|get_benefits/.test(t.text)
  );
  const lastTurn = visibleTurns[visibleTurns.length - 1];
  const floorTurn = lastTurn && lastTurn.role !== 'clinician' && Date.now() - lastTurn.at < 8000 ? lastTurn : null;

  const chairShort = chairSeat ? shortLabel(chairSeat) : 'CHAIR';
  const shortById: Record<string, string> = {};
  for (const slot of PANEL_STRIP) {
    for (const id of slot.personaIds) shortById[id] = slot.label;
  }
  for (const seat of seats) if (seat.personaId) shortById[seat.personaId] = shortLabel(seat);
  const whoFor = (t: ConversationTurn): string => {
    if (t.role === 'clinician') return 'YOU';
    if (t.role === 'chair') return chairShort;
    if (t.personaId && shortById[t.personaId]) return shortById[t.personaId];
    return t.role === 'specialist' ? 'PANEL' : '·';
  };
  const saidFor = (t: ConversationTurn): string => {
    let text = t.text;
    if (t.role === 'specialist') {
      const i = text.indexOf(': ');
      if (i > 0 && i < 48) text = text.slice(i + 2);
    }
    if (t.role === 'chair') text = text.replace(/^(house[^:]{0,24}|chair)\s*:\s*/i, '');
    return text;
  };

  const convene = () => {
    setAudioOn(true); // the click is the user gesture the audio graph needs
    setFinalized(null);
    setCreated([]);
    void post('/api/session/assemble');
  };

  return (
    <div className="app">
      <header className="masthead">
        <span className="name">house_md</span>
        <span className="spacer" />
        {status && <span className="activity">{status}</span>}
        <button className="ghost" onClick={() => { post('/api/session/reset'); setFinalized(null); setCreated([]); }}>
          Reset
        </button>
      </header>

      <div className="main">
        <section className="chamber">
          <div className="experts">
            {PANEL_STRIP.map((slot) => (
              <PanelSeat
                key={slot.label}
                slot={slot}
                speaking={panelSlotSpeaking(slot, floorTurn, seats)}
              />
            ))}
          </div>

          <div className="whiteboard">
            {!s.patient && (
              <div className="wb-empty placeholder">
                Convene the panel — the patient’s record loads from Medplum and the case unfolds here.
              </div>
            )}
            {s.patient && (
              <>
                <div className="wb-patient">
                  <div className="case-name">{s.patient.name}</div>
                  <div className="case-meta">
                    {s.features ? `${s.features.age} · ${s.features.sex} · ` : ''}DOB {s.patient.dob}
                  </div>
                  {s.features?.chiefComplaint && <div className="case-cc">“{s.features.chiefComplaint}”</div>}
                </div>

                <div className="wb-body">
                {yourMove && <div className="yourmove">{yourMove}</div>}

                {evidence.length > 0 && (
                  <>
                    <div className="steps-label">From the record — cited live</div>
                    <div className="facts">
                      {evidence.map((e) => (
                        <button
                          key={e.alias}
                          className="fact"
                          title={e.display}
                          onClick={() => openCite(e.resourceType, e.resourceId)}
                        >
                          <span className="fact-alias">{e.alias}</span>
                          <span className="fact-text">{e.fact}</span>
                          {e.date && <span className="fact-date">{e.date.slice(0, 10)}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {leading && s.workup.length > 0 && (
                  <div className="leadline">
                    <span className="leadline-label">Leading</span> {leading.display}
                  </div>
                )}

                {s.workup.length === 0 && s.differential.length > 0 && (
                  <>
                    <div className="steps-label">The panel’s differential — set the direction</div>
                    {s.differential.map((d) => (
                      <button
                        key={d.id}
                        className={`dxrow${d.status === 'leading' ? ' leading' : ''}`}
                        disabled={d.status === 'leading'}
                        onClick={() => post('/api/session/select', { id: d.id })}
                      >
                        <span className="rank">{d.rank}</span>
                        <span className="dx-name">{d.display}</span>
                      </button>
                    ))}
                  </>
                )}

                {s.workup.map((o) => (
                  <div key={o.id} className="opt">
                    <div className="opt-head">
                      <span className="title">{o.display}</span>
                      <span className={`prio ${o.priority}`}>{o.priority}</span>
                    </div>
                    <div className="purpose">{o.purpose}</div>
                    {o.sequenceNote && <div className="seq">{o.sequenceNote}</div>}
                    {o.benefit && (
                      <div className="cov" title={o.benefit.messages.join(' · ') || undefined}>
                        {o.benefit.matched
                          ? [
                              `plan ${o.benefit.planActive ? 'active' : 'inactive'}`,
                              o.benefit.copay && `copay ${o.benefit.copay}`,
                              o.benefit.deductibleRemaining && `deductible left ${o.benefit.deductibleRemaining}`,
                            ].filter(Boolean).join(' · ')
                          : 'no benefit information returned'}
                      </div>
                    )}
                  </div>
                ))}

                {allCreated.length > 0 && (
                  <>
                    <div className="steps-label">Written to the chart</div>
                    <div>
                      {allCreated.map((r) => (
                        <span key={r.id} className="chip" onClick={() => openCite(r.resourceType, r.id)}>
                          {r.resourceType}/{r.id.slice(0, 8)}…
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {finalized && <div className={finalized.startsWith('Wrote') ? 'okline' : 'errorbox'}>{finalized}</div>}
                </div>
              </>
            )}
          </div>

          <div className="foot">
            {canConvene ? (
              <button className="convene" onClick={convene}>
                Convene the panel
                <span className="sub">the panel reads the chart and joins with live voices — then present your case</span>
              </button>
            ) : (
              <div className="foot-row">
                <button className={`ptt${mic.state === 'live' ? ' talking' : ''}`} onClick={mic.toggle}>
                  <span className="avatar">YOU</span>
                  <span className="ptt-text">
                    <span className="ptt-label">
                      {mic.state === 'live' ? 'Mic live — click to mute' : mic.state === 'muted' ? 'Mic muted — click to speak' : 'Enable your mic'}
                    </span>
                    <span className="ptt-sub">
                      {mic.state === 'live'
                        ? 'the panel hears you — speak to interrupt'
                        : mic.state === 'muted'
                          ? 'your seat, at the foot of the table'
                          : 'one-time setup, then instant mute/unmute'}
                    </span>
                  </span>
                </button>
                {canFinalize && (
                  <button className="write" onClick={finalize}>Write plan to chart</button>
                )}
              </div>
            )}
            {s.error && (
              <div className="errorbox">
                {s.error} <button onClick={() => post('/api/session/assemble')}>retry</button>
              </div>
            )}
          </div>
        </section>

        <aside className="rail">
          <section className="panel">
            <div className="panel-title">
              Live transcript
              {status && <span className="live-dot" title={status} />}
            </div>
            <div className="transcript" ref={transcriptRef}>
              {visibleTurns.length === 0 && (
                <div className="placeholder">
                  {s.phase === 'listening'
                    ? 'The panel is listening — your words land here as you speak.'
                    : 'The room is quiet. Convene the panel, then open with your theory and your question — the panel takes it from there.'}
                </div>
              )}
              {visibleTurns.map((t, i) => (
                <div key={i} className={`turn ${t.role}`}>
                  <div className="turn-who">{whoFor(t)}</div>
                  <div className="turn-said">{saidFor(t)}</div>
                </div>
              ))}
            </div>
          </section>

        </aside>
      </div>

      {drawer && (
        <div className="drawer" onClick={() => setDrawer(null)}>
          <h3>{drawer.title} — raw FHIR</h3>
          <pre>{JSON.stringify(drawer.json, null, 2)}</pre>
          <div className="footer-note">click anywhere to close</div>
        </div>
      )}
    </div>
  );
}
