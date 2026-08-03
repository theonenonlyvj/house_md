'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { EvidenceRef, NoteEntry, Seat, SessionState } from '../src/shared/types';

// The consult room. Decision support, not diagnosis: the panel argues, the
// clinician decides.
//
// The flow IS the interface, and it runs in two acts. First the room is empty and
// the chair asks for the case — you talk. Then the panel is seated from the record
// and from what you just said, and the chairs land one at a time. After that it is
// a conference: whoever holds the floor is lit, the scribe's pad fills with the
// points and the plan, and the transcript runs down the right.

type S = SessionState & { version: number };

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// Session state arrives over SSE, so the room repaints on the event rather than on
// a poll tick. The speaking highlight in particular needs event timing.
function useSession(): S | null {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    const src = new EventSource('/api/session/stream');
    src.onmessage = (e) => {
      try {
        setS(JSON.parse(e.data));
      } catch {}
    };
    // EventSource reconnects on its own; a hard failure still leaves the last
    // known state on screen rather than blanking the room mid-consult.
    return () => src.close();
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
    void ctx.resume().catch(() => {});
    const unlock = () => { void ctx.resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
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
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.documentElement.style.setProperty('--audio-level', '0');
      flushRef.current();
      ctx.close();
    };
  }, [enabled]);
}

// Always-on mic with instant mute/unmute. Setup (permission + WS + worklet) happens
// ONCE on first enable; after that the toggle just gates frames — zero latency, no
// lost first words.
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
      await ctx.resume();
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-capture');
      node.port.onmessage = (e) => {
        const cur = ref.current;
        if (!cur.ws || cur.ws.readyState !== 1) return;
        // CONTINUOUS stream: mute sends zero-frames instead of stopping — Deepgram's
        // turn detection breaks on stalled streams, and resuming mid-stream eats the
        // first words. Unmute is a pure flag flip.
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

// ---- presentation helpers (no logic; seat roles read seat DATA, never the roster) ----

type SeatRole = 'chair' | 'human' | 'reimb' | 'empty' | 'specialist';
function seatRole(seat: Seat): SeatRole {
  if (seat.status === 'empty') return 'empty';
  if (seat.status === 'human') return 'human';
  if (seat.personaId === 'house' || seat.specialty === 'internal-medicine') return 'chair';
  if (seat.specialty === 'reimbursement' || seat.specialty === 'patient-advocacy') return 'reimb';
  return 'specialist';
}

const SHORT_LABEL: Record<string, string> = {
  'internal-medicine': 'HOUSE',
  'diagnostic-skeptic': 'SKEPTIC',
  pulmonology: 'PULMO',
  gastroenterology: 'GASTRO',
  'infectious-disease': 'I.D.',
  cardiology: 'CARDIO',
  nephrology: 'NEPHRO',
  neurology: 'NEURO',
  endocrinology: 'ENDO',
  hematology: 'HEME',
  'clinical-pharmacology': 'PHARM',
  rheumatology: 'RHEUM',
  reimbursement: 'ADVOCATE',
  'patient-advocacy': 'ADVOCATE',
};
const AVATAR: Record<string, string> = {
  'internal-medicine': '/avatars/house.png',
  'diagnostic-skeptic': '/avatars/skeptic.png',
  pulmonology: '/avatars/cardiology.png',
  gastroenterology: '/avatars/nephrology.png',
  'infectious-disease': '/avatars/endocrinology.png',
  cardiology: '/avatars/cardiology.png',
  nephrology: '/avatars/nephrology.png',
  neurology: '/avatars/neurology.png',
  endocrinology: '/avatars/endocrinology.png',
  hematology: '/avatars/hematology.png',
  'clinical-pharmacology': '/avatars/clin-pharm.png',
  rheumatology: '/avatars/skeptic.png',
  reimbursement: '/avatars/reimbursement.png',
  'patient-advocacy': '/avatars/reimbursement.png',
};
const shortLabel = (seat: Seat) =>
  SHORT_LABEL[seat.specialty] || seat.specialty.split('-')[0].slice(0, 7).toUpperCase();

const PHASE_STATUS: Partial<Record<S['phase'], string>> = {
  opening: 'opening the room…',
  listening: 'the panel is listening…',
  assembling: 'the panel is arriving…',
  reasoning: 'the panel is thinking…',
  'retrieving-evidence': 'reading the chart…',
  'checking-benefits': 'running the insurance…',
  'writing-fhir': 'writing to the chart…',
};

function PanelSeat({
  seat,
  speaking,
  onCite,
}: {
  seat: Seat;
  speaking: boolean;
  onCite?: () => void;
}) {
  const role = seatRole(seat);
  // `arriving` runs the entry animation once, on the render where the seat first
  // has a landing time. Server-paced, so it tracks the chair's actual voice.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setArriving(false), 560);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`seat ${role}${speaking ? ' speaking' : ''}${arriving ? ' arriving' : ''}`}
      title={seat.reasons[0]}
      onClick={onCite}
    >
      <div className="seat-avatar">
        <Image src={AVATAR[seat.specialty] || '/avatars/house.png'} alt="" width={60} height={60} />
      </div>
      <span className="seat-label">{shortLabel(seat)}</span>
      {role === 'empty' ? (
        <span className="seat-stamp">NO ONE AVAILABLE</span>
      ) : (
        <span className="seat-why">{seat.reasons[0]}</span>
      )}
    </div>
  );
}

function Cites({ cites, onOpen }: { cites: EvidenceRef[]; onOpen: (e: EvidenceRef) => void }) {
  if (cites.length === 0) return null;
  const seen = new Set<string>();
  const unique = cites.filter((c) => (seen.has(c.alias) ? false : (seen.add(c.alias), true)));
  return (
    <span className="cites">
      {unique.map((c) => (
        <button
          key={c.alias}
          className="cite"
          title={`${c.display}${c.date ? ` · ${c.date.slice(0, 10)}` : ''} — open raw FHIR`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(c);
          }}
        >
          {c.alias}
        </button>
      ))}
    </span>
  );
}

function Note({ n, onCite }: { n: NoteEntry; onCite: (e: EvidenceRef) => void }) {
  return (
    <div className={`note ${n.kind}`}>
      <div className="note-who">{n.speaker || ''}</div>
      <div className="note-main">
        <div className="note-text">
          {n.text}
          {n.priority && <span className={`prio ${n.priority}`}>{n.priority}</span>}
          <Cites cites={n.cites} onOpen={onCite} />
          {n.provenance === 'conjecture' && <span className="conjecture">CONJECTURE</span>}
        </div>
        {n.detail && <div className="note-detail">{n.detail}</div>}
      </div>
    </div>
  );
}

export default function Page() {
  const s = useSession();
  const [drawer, setDrawer] = useState<{ title: string; json: unknown } | null>(null);
  const [finalized, setFinalized] = useState<string | null>(null);
  const [created, setCreated] = useState<{ resourceType: string; id: string }[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<HTMLDivElement>(null);
  const mic = useMic();
  useChairAudio(true, s?.activity === 'hearing you…');

  // The transcript is a stream — always ride the bottom.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [s?.transcript.length]);
  // The notepad is a document. Follow new entries only while the reader is already
  // at the bottom; if they have scrolled up to re-read a point, leave them there.
  useEffect(() => {
    const el = padRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [s?.notepad.length]);

  // Arriving from the provider app auto-opens the room once.
  const convened = useRef(false);
  useEffect(() => {
    if (!convened.current && s?.phase === 'case-ready' && typeof location !== 'undefined' && location.search.includes('convene=1')) {
      convened.current = true;
      void post('/api/session/assemble');
    }
  }, [s?.phase]);

  // Speak-first: the chair asks for the case, so arm the mic as soon as the room
  // is listening. Mute stays manual.
  const micArmed = useRef(false);
  useEffect(() => {
    if (s?.phase === 'listening' || s?.phase === 'opening') {
      if (!micArmed.current && mic.state === 'off') {
        micArmed.current = true;
        void mic.toggle();
      }
    }
  }, [s?.phase, mic.state, mic.toggle]);

  const openCite = useCallback(async (rt: string, id: string) => {
    setDrawer({ title: `${rt}/${id}`, json: { loading: true } });
    const r = await fetch(`/api/resource/${rt}/${id}`);
    setDrawer({ title: `${rt}/${id}`, json: await r.json() });
  }, []);
  const openEvidence = useCallback((e: EvidenceRef) => openCite(e.resourceType, e.resourceId), [openCite]);

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

  // When the panel rests and the call is the clinician's, put the choice in front of
  // them — the pad may have scrolled well past it while the debate ran.
  const needsDirection = !!s && s.differential.length > 0 && !s.selectedHypothesisId && s.workup.length === 0;
  useEffect(() => {
    if (needsDirection) directionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [needsDirection]);

  if (!s) return <div className="loading">opening the room…</div>;

  const seats = s.seating?.seats || [];
  // Only seats the chair has actually named are in the room yet.
  const arrived = seats.filter((st) => st.arrivedAt && st.status !== 'human');
  const canConvene = s.phase === 'case-ready' || s.phase === 'recoverable-error';
  const canFinalize =
    (s.phase === 'benefits-ready' || s.phase === 'workup-ready') &&
    !!s.selectedHypothesisId &&
    s.workup.some((o) => o.selected);
  const allCreated = [...created, ...s.createdResources];

  const status = s.activity || PHASE_STATUS[s.phase] || '';
  const awaitingDirection = needsDirection;
  const yourMove =
    s.phase === 'listening' || s.phase === 'opening'
      ? mic.state === 'off'
        ? 'Enable your mic and tell the panel about your patient.'
        : 'Present your case — end with “can you take a look?”'
      : awaitingDirection
        ? 'Your call, doctor: set the leading direction.'
        : s.phase === 'workup-ready' || s.phase === 'benefits-ready'
          ? 'Review the plan, then write it to the chart.'
          : null;

  const visibleTurns = s.transcript.filter(
    (t) => t.role !== 'system' && !/submit_council_output|propose_workup|get_benefits|seat_panel/.test(t.text)
  );
  const shortById: Record<string, string> = {};
  for (const seat of seats) if (seat.personaId) shortById[seat.personaId] = shortLabel(seat);
  const whoFor = (t: (typeof visibleTurns)[number]): string => {
    if (t.role === 'clinician') return 'YOU';
    if (t.role === 'chair') return 'HOUSE';
    if (t.personaId && shortById[t.personaId]) return shortById[t.personaId];
    return t.role === 'specialist' ? 'PANEL' : '·';
  };
  const saidFor = (t: (typeof visibleTurns)[number]): string => {
    let text = t.text;
    if (t.role === 'specialist') {
      const i = text.indexOf(': ');
      if (i > 0 && i < 48) text = text.slice(i + 2);
    }
    if (t.role === 'chair') text = text.replace(/^(house[^:]{0,24}|chair)\s*:\s*/i, '');
    return text;
  };

  // The pad has two halves: what the panel established, and what it wants done.
  const keyPoints = s.notepad.filter((n) => n.kind === 'position' || n.kind === 'evidence' || n.kind === 'direction');
  const planNotes = s.notepad.filter((n) => n.kind === 'plan' || n.kind === 'coverage');

  return (
    <div className="app">
      <header className="masthead">
        <span className="name">house_md</span>
        {s.patient && (
          <span className="patient">
            {s.patient.name}
            <span className="pmeta">
              {s.features ? `${s.features.age}y · ${s.features.sex}` : `DOB ${s.patient.dob}`}
            </span>
            <span className="badge syn">Synthetic</span>
          </span>
        )}
        <span className="spacer" />
        {status && <span className="activity">{status}</span>}
        <a className="ghost" href="/launch" style={{ textDecoration: 'none' }}>
          <button className="ghost">Back to chart</button>
        </a>
        <button
          className="ghost"
          onClick={() => { post('/api/session/reset'); setFinalized(null); setCreated([]); }}
        >
          Reset
        </button>
      </header>

      <div className="main">
        <section className="chamber">
          <div className="panelstage">
            <div className="stagehead">
              <span className="stagelabel">The panel</span>
              {arrived.length > 0 && (
                <span className="stagenote">
                  {arrived.filter((x) => x.status === 'seated').length} seated
                  {arrived.some((x) => x.status === 'empty') ? ' · 1 seat unfilled' : ''}
                </span>
              )}
            </div>

            {arrived.length === 0 ? (
              <div className="waiting">
                <div className="cue">
                  {s.phase === 'case-ready'
                    ? 'The room is empty.'
                    : 'The chair is listening. Tell it about your patient.'}
                </div>
                <div className="cuesub">
                  {s.phase === 'case-ready'
                    ? 'convene from the chart to open the room'
                    : 'the panel is seated from the record and from what you say'}
                </div>
              </div>
            ) : (
              <div className={`seats${s.speakingPersonaId ? ' hasfloor' : ''}`}>
                {arrived.map((seat) => (
                  <PanelSeat
                    key={`${seat.specialty}-${seat.personaId || 'empty'}`}
                    seat={seat}
                    speaking={!!seat.personaId && s.speakingPersonaId === seat.personaId}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="notepad">
            <div className="padhead">
              <span className="padtitle">Notepad</span>
              <span className="padcount">
                {s.notepad.length === 0 ? 'nothing on the record yet' : `${s.notepad.length} entries`}
              </span>
            </div>
            <div className="padbody" ref={padRef}>
              {s.notepad.length === 0 && (
                <p className="padempty placeholder">
                  The scribe writes here as the panel argues — every point they establish, every
                  chart fact they cite, and the plan as it takes shape.
                </p>
              )}

              {keyPoints.length > 0 && <div className="padsection">Key points</div>}
              {keyPoints.map((n) => (
                <Note key={n.id} n={n} onCite={openEvidence} />
              ))}

              {awaitingDirection && (
                <>
                  <div className="padsection" ref={directionRef}>Set the direction</div>
                  <div className="dxblock">
                    {s.differential.map((d) => (
                      <button
                        key={d.id}
                        className={`dxrow${d.status === 'leading' ? ' leading' : ''}`}
                        disabled={d.status === 'leading'}
                        onClick={() => post('/api/session/select', { id: d.id })}
                      >
                        <span className="rank">{d.rank}</span>
                        <span>
                          <span className="dx-name">{d.display}</span>
                          {d.assessment && <div className="dx-why">{d.assessment}</div>}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {planNotes.length > 0 && <div className="padsection">The plan</div>}
              {planNotes.map((n) => (
                <Note key={n.id} n={n} onCite={openEvidence} />
              ))}

              {allCreated.length > 0 && (
                <>
                  <div className="padsection">Written to the chart</div>
                  <div className="dxblock">
                    <div>
                      {allCreated.map((r) => (
                        <span key={r.id} className="chip" onClick={() => openCite(r.resourceType, r.id)}>
                          {r.resourceType}/{r.id.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="foot">
            {canConvene ? (
              <button className="convene" onClick={() => { setFinalized(null); setCreated([]); void post('/api/session/assemble'); }}>
                Open the room
              </button>
            ) : (
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
                        ? 'your seat at the table'
                        : 'one-time setup, then instant mute'}
                  </span>
                </span>
              </button>
            )}
            {yourMove && <span className="yourmove">{yourMove}</span>}
            <span className="spacer" />
            {canFinalize && (
              <button className="write" onClick={finalize}>
                Write plan to chart
              </button>
            )}
            {finalized && <span className={finalized.startsWith('Wrote') ? 'okline' : 'errorbox'}>{finalized}</span>}
            {s.error && (
              <span className="errorbox">
                {s.error}
                <button onClick={() => post('/api/session/assemble')}>retry</button>
              </span>
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
                <p className="placeholder">
                  {s.phase === 'case-ready'
                    ? 'The room is quiet. Open it, and the chair will ask you for the case.'
                    : 'Your words land here as you speak.'}
                </p>
              )}
              {visibleTurns.map((t, i) => (
                <div
                  key={i}
                  // Only the LAST turn can be the one being spoken. Matching on
                  // personaId alone lit up every past turn by the same voice.
                  className={`turn ${t.role}${
                    i === visibleTurns.length - 1 && t.personaId && s.speakingPersonaId === t.personaId
                      ? ' speaking'
                      : ''
                  }`}
                >
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
