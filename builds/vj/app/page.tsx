'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationTurn, Seat, SessionState } from '../src/shared/types';

// The panel consult room. Decision support, not diagnosis: the panel argues, the
// clinician decides. One long table — House at the head, you at the foot with the
// microphone, experts along the sides. The flow IS the interface: convene, speak,
// listen, set the direction, write the plan to the chart.

type S = SessionState & { version: number };

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function useSession(): S | null {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/session', { cache: 'no-store' });
        if (alive) setS(await r.json());
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
// seat's ring pulses with the actual voice.
function useChairAudio(enabled: boolean) {
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
    let nextAt = 0;
    let stop = false;
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
          nextAt = Math.max(nextAt, ctx.currentTime + 0.05);
          src.start(nextAt);
          nextAt += ab.duration;
        }
      } catch {}
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      document.documentElement.style.setProperty('--audio-level', '0');
      ctx.close();
    };
  }, [enabled]);
}

// Push-to-talk: hold → mic PCM (24k linear16 via worklet) → /ws/voice → the live
// panel session's listen leg (nova-3). Release to stop. You are at the table.
function usePushToTalk() {
  const ref = useRef<{ ws?: WebSocket; ctx?: AudioContext; stream?: MediaStream }>({});
  const [talking, setTalking] = useState(false);
  const start = useCallback(async () => {
    if (ref.current.ws) return;
    try {
      const ws = new WebSocket(`ws://${location.host}/ws/voice`);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext({ sampleRate: 24000 });
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-capture');
      node.port.onmessage = (e) => { if (ws.readyState === 1) ws.send(e.data); };
      src.connect(node);
      ref.current = { ws, ctx, stream };
      setTalking(true);
    } catch {
      setTalking(false);
    }
  }, []);
  const stop = useCallback(() => {
    const { ws, ctx, stream } = ref.current;
    stream?.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    setTimeout(() => ws?.close(), 400);
    ref.current = {};
    setTalking(false);
  }, []);
  return { talking, start, stop };
}

// ---- Presentation helpers (no logic). Seat roles and labels read seat DATA, never
// the roster, so a persona/case swap reseats the room with zero code changes. ----

type SeatRole = 'chair' | 'human' | 'reimb' | 'empty' | 'specialist';
function seatRole(seat: Seat): SeatRole {
  if (seat.status === 'empty') return 'empty';
  if (seat.status === 'human') return 'human';
  if (seat.personaId === 'chair-house' || seat.reasons[0] === 'moderates every council') return 'chair';
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

function SeatPill({ seat, speaking }: { seat: Seat; speaking: boolean }) {
  const role = seatRole(seat);
  return (
    <div
      className={`seat ${role}${speaking ? ' speaking' : ''}`}
      title={[seat.personaName, seat.specialty.replace(/-/g, ' '), ...seat.reasons].filter(Boolean).join(' · ')}
    >
      {shortLabel(seat)}
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
  useChairAudio(audioOn);
  const ptt = usePushToTalk();

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
  const sideSeats = seats.filter((st) => st !== chairSeat && st.status !== 'human' && st.status !== 'empty');
  const half = Math.ceil(sideSeats.length / 2);
  const leftSeats = sideSeats.slice(0, half);
  const rightSeats = sideSeats.slice(half);
  const canConvene = s.phase === 'case-ready' || s.phase === 'recoverable-error';
  const canFinalize = s.phase === 'benefits-ready' || s.phase === 'workup-ready';
  const leading = s.differential.find((d) => d.status === 'leading');
  const allCreated = [...created, ...s.createdResources];
  const status = s.activity || PHASE_STATUS[s.phase] || '';

  // Who has the floor: the seat behind the most recent non-clinician turn, if fresh.
  // Turns carrying internal tool names are orchestration echoes, not speech — hide them.
  const visibleTurns = s.transcript.filter(
    (t) => t.role !== 'system' && !/submit_council_output|propose_workup|get_benefits/.test(t.text)
  );
  const lastTurn = visibleTurns[visibleTurns.length - 1];
  const floorTurn = lastTurn && lastTurn.role !== 'clinician' && Date.now() - lastTurn.at < 8000 ? lastTurn : null;
  const hasFloor = (seat: Seat) =>
    !!floorTurn &&
    (seat.personaId === floorTurn.personaId || (floorTurn.role === 'chair' && seatRole(seat) === 'chair'));

  const chairShort = chairSeat ? shortLabel(chairSeat) : 'CHAIR';
  const shortById: Record<string, string> = {};
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
        {s.patient && <span className="patient">{s.patient.name}</span>}
        <span className="badge syn" title="Synthetic patient — decision support, not diagnosis: the panel argues, the clinician decides.">
          Synthetic · decision support, not diagnosis
        </span>
        <span className="spacer" />
        {status && <span className="activity">{status}</span>}
        <button className="ghost" onClick={() => setAudioOn((v) => !v)}>{audioOn ? 'Mute' : 'Unmute'}</button>
        <button className="ghost" onClick={() => { post('/api/session/reset'); setFinalized(null); setCreated([]); }}>
          Reset
        </button>
      </header>

      <div className="main">
        <section className="chamber">
          <div className="head-row">
            {chairSeat && <SeatPill seat={chairSeat} speaking={hasFloor(chairSeat)} />}
          </div>

          <div className="table-row">
            <div className="side left">
              {leftSeats.map((seat, i) => (
                <SeatPill key={`l-${seat.specialty}-${i}`} seat={seat} speaking={hasFloor(seat)} />
              ))}
            </div>

            <div className="table-surface">
              {s.patient && (
                <div className="case-card">
                  <div className="case-name">{s.patient.name}</div>
                  {s.features?.chiefComplaint && <div className="case-cc">{s.features.chiefComplaint}</div>}
                </div>
              )}
            </div>

            <div className="side right">
              {rightSeats.map((seat, i) => (
                <SeatPill key={`r-${seat.specialty}-${i}`} seat={seat} speaking={hasFloor(seat)} />
              ))}
            </div>
          </div>

          <div className="foot">
            {canConvene ? (
              <button className="convene" onClick={convene}>
                Convene the panel
                <span className="sub">the panel reads the chart and joins with live voices — then present your case</span>
              </button>
            ) : (
              <div className="foot-row">
                <button
                  className={`ptt${ptt.talking ? ' talking' : ''}`}
                  onPointerDown={ptt.start}
                  onPointerUp={ptt.stop}
                  onPointerLeave={ptt.stop}
                >
                  <span className="avatar">YOU</span>
                  <span className="ptt-text">
                    <span className="ptt-label">{ptt.talking ? 'Listening — release when done' : 'Hold to speak'}</span>
                    <span className="ptt-sub">your seat, at the foot of the table</span>
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
                  The room is quiet. Convene the panel, then open with your theory and your question — the panel takes it from there.
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

          <section className="panel">
            <div className="panel-title">Next steps</div>
            <div className="panel-body">
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

              {s.differential.length === 0 && s.workup.length === 0 && allCreated.length === 0 && (
                <div className="placeholder">The panel’s plan lands here.</div>
              )}
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
