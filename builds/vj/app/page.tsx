'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Argument, ConversationTurn, Seat, SessionState } from '../src/shared/types';

// The council table. Decision support, not diagnosis: the council argues, the
// clinician decides — and clicks every consequential transition themselves.
// Layout: House at the head, specialists flank the table, the clinician's seat
// at the foot IS the push-to-talk control. Right rail: transcript + plan.

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

// Chair speech: pull the PCM stream and play through Web Audio.
function useChairAudio(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
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
          src.connect(ctx.destination);
          nextAt = Math.max(nextAt, ctx.currentTime + 0.05);
          src.start(nextAt);
          nextAt += ab.duration;
        }
      } catch {}
    })();
    return () => { stop = true; ctx.close(); };
  }, [enabled]);
}

// Push-to-talk: hold → mic PCM (24k linear16 via worklet) → /ws/voice → the live
// council session's listen leg (nova-3). Release to stop. You are at the table.
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

// Presentation helpers (no logic): avatar initials + seat role per persona/seat data.
// Role detection reads seat data, never the roster — personas stay swappable.
function initials(name?: string): string {
  if (!name) return '·';
  const words = name.replace(/\(.*?\)/g, '').split(/[\s,]+/).filter((w) => w && !/^(Dr|Ms|Mr|Mrs|M\.?D)\.?$/i.test(w));
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || name[0].toUpperCase();
}

type SeatRole = 'chair' | 'human' | 'reimb' | 'empty' | 'specialist';
function seatRole(seat: Seat): SeatRole {
  if (seat.status === 'empty') return 'empty';
  if (seat.status === 'human') return 'human';
  if (seat.personaId === 'chair-house' || seat.reasons[0] === 'moderates every council') return 'chair';
  if (seat.specialty === 'reimbursement') return 'reimb';
  return 'specialist';
}

function SeatCard({ seat, speaking }: { seat: Seat; speaking: boolean }) {
  const role = seatRole(seat);
  const shortName = seat.personaName?.replace(/\s*\(.*?\)/g, '');
  return (
    <div
      className={`seat ${role}${speaking ? ' speaking' : ''}`}
      title={[seat.personaName, ...seat.reasons].filter(Boolean).join(' · ')}
    >
      <div className="avatar">{role === 'empty' ? '?' : initials(seat.personaName)}</div>
      <div className="meta">
        <div className="who">{role === 'empty' ? 'Empty seat' : shortName}</div>
        <div className="spec">{seat.specialty.replace(/-/g, ' ')}</div>
        <div className="why">{seat.reasons[0]}</div>
      </div>
    </div>
  );
}

function ClaimLine({ a, onCite }: { a: Argument; onCite: (rt: string, id: string) => void }) {
  return (
    <div className="claim">
      {a.claim}{' '}
      {a.provenance === 'cited' ? (
        a.resolved.map((e) => (
          <span key={e.alias} className="chip support" title={e.fact} onClick={() => onCite(e.resourceType, e.resourceId)}>
            {e.alias} · {e.resourceType}
          </span>
        ))
      ) : (
        <span className="chip conjecture">CONJECTURE — not established in this patient</span>
      )}
    </div>
  );
}

export default function Page() {
  const s = useSession();
  const [text, setText] = useState('');
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
  const sideSeats = seats.filter((st) => st !== chairSeat && st.status !== 'human');
  const half = Math.ceil(sideSeats.length / 2);
  const leftSeats = sideSeats.slice(0, half);
  const rightSeats = sideSeats.slice(half);
  const canAssemble = s.phase === 'case-ready' || s.phase === 'recoverable-error';
  const canFinalize = s.phase === 'benefits-ready' || s.phase === 'workup-ready';
  const leading = s.differential.find((d) => d.status === 'leading');
  const allCreated = [...created, ...s.createdResources];

  // Who has the floor: the seat behind the most recent non-clinician turn, if fresh.
  const lastTurn = s.transcript[s.transcript.length - 1];
  const floorTurn = lastTurn && lastTurn.role !== 'clinician' && Date.now() - lastTurn.at < 8000 ? lastTurn : null;
  const hasFloor = (seat: Seat) =>
    !!floorTurn &&
    (seat.personaId === floorTurn.personaId || (floorTurn.role === 'chair' && seatRole(seat) === 'chair'));

  const chairName = chairSeat?.personaName || 'Chair';
  const turnParts = (t: ConversationTurn): { who: string; said: string } => {
    if (t.role === 'specialist') {
      const i = t.text.indexOf(': ');
      if (i > 0 && i < 48) return { who: t.text.slice(0, i), said: t.text.slice(i + 2) };
      return { who: 'specialist', said: t.text };
    }
    if (t.role === 'chair') return { who: chairName, said: t.text };
    if (t.role === 'clinician') return { who: 'You', said: t.text };
    return { who: 'system', said: t.text };
  };

  return (
    <div className="app">
      <header className="masthead">
        <span className="name">house_md</span>
        <span className="subname">Council of Peers</span>
        {s.patient && (
          <>
            <span className="patient">{s.patient.name} · DOB {s.patient.dob}</span>
            <span className="badge syn">Synthetic data</span>
            <span className="badge">{s.patient.payer}</span>
          </>
        )}
        <span className="badge phase">{s.phase.replace(/-/g, ' ')}</span>
        {s.activity && <span className="activity">{s.activity}</span>}
        <span className="spacer" />
        <button onClick={() => setAudioOn((v) => !v)}>{audioOn ? '🔊 Chair audio on' : '🔇 Enable chair audio'}</button>
      </header>

      <div className="main">
        <section className="chamber">
          <div className="head-row">
            {chairSeat && <SeatCard seat={chairSeat} speaking={hasFloor(chairSeat)} />}
          </div>

          <div className="table-zone">
            <div className="table-surface" />
            <div className="side">
              {leftSeats.map((seat, i) => (
                <SeatCard key={`l-${seat.specialty}-${i}`} seat={seat} speaking={hasFloor(seat)} />
              ))}
            </div>

            <div className="board">
              {s.differential.length === 0 && s.contributions.length === 0 && (
                <div className="placeholder">
                  {s.phase === 'case-ready'
                    ? 'The table is set. Assemble the council to begin.'
                    : 'The council is working — arguments land here with citations.'}
                </div>
              )}

              {s.differential.length > 0 && (
                <>
                  <h3>Living differential <span className="sub">every claim cited or labeled conjecture</span></h3>
                  {s.differential.map((d) => (
                    <div key={d.id} className={`dx ${d.status === 'leading' ? 'leading' : ''}`}>
                      <div className="head">
                        <span className="rank">{d.rank}</span>
                        <span className="title">{d.display}</span>
                        <span className="spacer" />
                        {s.phase !== 'case-ready' && (
                          <button disabled={d.status === 'leading'} onClick={() => post('/api/session/select', { id: d.id })}>
                            {d.status === 'leading' ? 'leading' : 'select as leading'}
                          </button>
                        )}
                      </div>
                      <div className="assessment">{d.assessment}</div>
                      {d.supporting.map((a, i) => <ClaimLine key={`s${i}`} a={a} onCite={openCite} />)}
                      {d.contradicting.map((a, i) => (
                        <div key={`c${i}`} className="claim">
                          <span className="chip contra">against</span> <ClaimLine a={a} onCite={openCite} />
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}

              {s.contributions.length > 0 && (
                <>
                  <h3>Council positions</h3>
                  {s.contributions.map((c, i) => (
                    <div key={i} className="dx">
                      <div className="head"><span className="title">{c.specialty.replace(/-/g, ' ')}</span></div>
                      <ClaimLine a={c.interpretation} onCite={openCite} />
                      {c.contradiction && (
                        <div className="claim"><span className="chip contra">but</span> <ClaimLine a={c.contradiction} onCite={openCite} /></div>
                      )}
                      {c.discriminator && <div className="claim">→ discriminator: {c.discriminator}</div>}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="side">
              {rightSeats.map((seat, i) => (
                <SeatCard key={`r-${seat.specialty}-${i}`} seat={seat} speaking={hasFloor(seat)} />
              ))}
            </div>
          </div>

          <div className="dock">
            <div className="dock-row">
              <div className="dock-group">
                <button className={canAssemble ? 'primary' : ''} disabled={!canAssemble} onClick={() => post('/api/session/assemble')}>
                  🩺 Assemble council
                </button>
                <button onClick={() => { post('/api/session/reset'); setFinalized(null); setCreated([]); }}>Reset</button>
              </div>

              <button
                className={`ptt${ptt.talking ? ' talking' : ''}`}
                disabled={s.phase === 'case-ready'}
                onPointerDown={ptt.start}
                onPointerUp={ptt.stop}
                onPointerLeave={ptt.stop}
              >
                <span className="avatar">YOU</span>
                <span className="ptt-text">
                  <span className="ptt-label">{ptt.talking ? '🎙 Listening — release when done' : '🎙 Hold to speak to the council'}</span>
                  <span className="ptt-sub">your seat, at the foot of the table</span>
                </span>
              </button>

              <div className="dock-group grow">
                <input
                  type="text"
                  placeholder="…or type your interjection"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && text.trim()) { post('/api/session/say', { text }); setText(''); }
                  }}
                />
                <button onClick={() => { if (text.trim()) { post('/api/session/say', { text }); setText(''); } }}>Say</button>
                <button className={canFinalize ? 'primary' : ''} disabled={!canFinalize} onClick={finalize}>
                  ✅ Finalize → chart
                </button>
              </div>
            </div>
            {finalized && <div className={finalized.startsWith('Wrote') ? 'okline' : 'errorbox'}>{finalized}</div>}
            {s.error && (
              <div className="errorbox">
                {s.error}{' '}
                <button onClick={() => post('/api/session/assemble')}>retry</button>
              </div>
            )}
            <div className="smallprint">
              <b>1</b> Assemble · <b>2</b> Listen · <b>3</b> Hold to speak · <b>4</b> Select leading dx · <b>5</b> Review plan ·{' '}
              <b>6</b> Finalize&ensp;—&ensp;synthetic data only · decision support, not diagnosis: the council argues, the clinician decides
            </div>
          </div>
        </section>

        <aside className="rail">
          <section className="panel">
            <div className="panel-title">
              Live transcript
              {s.activity && <span className="live-dot" title={s.activity} />}
            </div>
            <div className="transcript" ref={transcriptRef}>
              {s.transcript.length === 0 && <div className="placeholder">The room is quiet — assemble the council.</div>}
              {s.transcript.map((t, i) => {
                const p = turnParts(t);
                return (
                  <div key={i} className={`turn ${t.role}`}>
                    <div className="turn-who">{p.who}</div>
                    <div className="turn-said">{p.said}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Plan &amp; next steps</div>
            <div className="panel-body">
              {leading && (
                <div className="leadline">
                  <span className="leadline-label">Leading</span> {leading.display}
                </div>
              )}
              {s.workup.length === 0 && (
                <div className="placeholder">Orders and coverage land here once the council proposes a workup.</div>
              )}
              {s.workup.map((o) => (
                <div key={o.id} className="opt">
                  <div className="title">{o.display} <span className="badge">{o.priority}</span></div>
                  <div className="purpose">{o.purpose}</div>
                  {o.sequenceNote && <div className="seq">⇄ {o.sequenceNote}</div>}
                  {o.benefit && (
                    <div className="ben">
                      <div className="ben-label">Coverage facts</div>
                      {o.benefit.matched ? (
                        <>
                          plan {o.benefit.planActive ? 'ACTIVE' : 'INACTIVE'}
                          {o.benefit.copay && <> · copay <span className="money">{o.benefit.copay}</span></>}
                          {o.benefit.deductibleRemaining && <> · deductible left <span className="money">{o.benefit.deductibleRemaining}</span></>}
                          {o.benefit.oopRemaining && <> · OOP left <span className="money">{o.benefit.oopRemaining}</span></>}
                          {o.benefit.messages.map((m, i) => <div key={i}>payer: “{m}”</div>)}
                          <div className="caveat">(payer test response — estimate, not a guarantee)</div>
                        </>
                      ) : (
                        <span className="caveat">no service-specific benefit information returned</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {allCreated.length > 0 && (
                <>
                  <div className="written-label">Written to chart — click to inspect the FHIR</div>
                  <div>
                    {allCreated.map((r) => (
                      <span key={r.id} className="chip support" onClick={() => openCite(r.resourceType, r.id)}>
                        {r.resourceType}/{r.id.slice(0, 8)}…
                      </span>
                    ))}
                  </div>
                </>
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
