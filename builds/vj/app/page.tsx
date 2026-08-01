'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Argument, SessionState } from '../src/shared/types';

// The council table. Decision support, not diagnosis: the council argues, the
// clinician decides — and clicks every consequential transition themselves.

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

// Chair speech: pull the PCM stream and play through Web Audio. `interrupted` flips
// when the session hears the clinician — we hard-flush the scheduled buffer so the
// chair actually shuts up when interrupted instead of playing out its backlog.
function useChairAudio(enabled: boolean, interrupted: boolean) {
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (interrupted) flushRef.current();
  }, [interrupted]);
  useEffect(() => {
    if (!enabled) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
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
          src.connect(ctx.destination);
          src.onended = () => scheduled.delete(src);
          scheduled.add(src);
          nextAt = Math.max(nextAt, ctx.currentTime + 0.15);
          src.start(nextAt);
          nextAt += ab.duration;
        }
      } catch {}
    })();
    return () => { stop = true; flushRef.current(); ctx.close(); };
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

// Presentation helpers (no logic): avatar initials + seat styling class per persona kind.
function initials(name?: string): string {
  if (!name) return '·';
  const words = name.replace(/\(.*?\)/g, '').split(/[\s,]+/).filter((w) => w && !/^(Dr|Ms|Mr|Mrs|M\.?D)\.?$/i.test(w));
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || name[0].toUpperCase();
}
function seatClass(seat: { status: string; personaId?: string }): string {
  if (seat.status === 'empty') return 'seat empty';
  if (seat.status === 'human') return 'seat human';
  if (seat.personaId === 'chair-house') return 'seat chair';
  if (seat.personaId === 'reimbursement') return 'seat reimb';
  return 'seat';
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

  if (!s) return <div className="footer-note">loading…</div>;

  const seats = s.seating?.seats || [];
  const n = seats.length;
  const canAssemble = s.phase === 'case-ready' || s.phase === 'recoverable-error';

  return (
    <>
      <div className="topstrip">
        <span className="name">house_md</span>
        <span className="subname">Council of Peers</span>
        {s.patient && (
          <>
            <span className="patient">{s.patient.name} · DOB {s.patient.dob}</span>
            <span className="badge syn">SYNTHETIC DATA</span>
            <span className="badge">{s.patient.payer}</span>
          </>
        )}
        <span className="badge phase">{s.phase}</span>
        {s.activity && <span className="activity">{s.activity}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setAudioOn((v) => !v)}>{audioOn ? '🔊 chair audio on' : '🔇 enable chair audio'}</button>
        <span className="tagline">the council argues, the clinician decides</span>
      </div>

      <div className="stage">
        <div className="table-wrap">
          <div className="table-surface" />
          {seats.map((seat, i) => {
            const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + 44 * Math.cos(angle);
            const y = 50 + 44 * Math.sin(angle);
            return (
              <div
                key={`${seat.specialty}-${seat.status}-${i}`}
                className={seatClass(seat)}
                style={{ left: `calc(${x}% - 79px)`, top: `calc(${y}% - 44px)` }}
                title={seat.reasons.join(' · ')}
              >
                <div className="avatar">
                  {seat.status === 'empty' ? '?' : seat.status === 'human' ? 'YOU' : initials(seat.personaName)}
                </div>
                <div className="who">{seat.status === 'empty' ? 'EMPTY SEAT' : seat.personaName}</div>
                <div className="spec">{seat.specialty.replace(/-/g, ' ')}</div>
                <div className="why">{seat.reasons[0]}</div>
              </div>
            );
          })}

          <div className="center">
            {s.phase === 'differential-ready' && !s.selectedHypothesisId && (
              <div className="yourmove">⚖️ The council rests — <strong>your call, doctor</strong>: select the leading diagnosis below.</div>
            )}
            {(s.phase === 'workup-ready' || s.phase === 'benefits-ready') && (
              <div className="yourmove">📋 <strong>Your move</strong>: review the plan and coverage, then <strong>Finalize → write to chart</strong>.</div>
            )}
            {s.differential.length === 0 && (
              <div className="placeholder">
                {s.phase === 'case-ready'
                  ? 'Load the case, then assemble the council.'
                  : 'The council is working — arguments land here with citations.'}
              </div>
            )}

            {s.differential.length > 0 && (
              <>
                <h3>Differential <span className="sub">every claim cited or labeled conjecture</span></h3>
                {s.differential.map((d) => (
                  <div key={d.id} className={`dx ${d.status === 'leading' ? 'leading' : ''}`}>
                    <div className="head">
                      <span className="rank">{d.rank}</span>
                      <span className="title">{d.display}</span>
                      <span style={{ flex: 1 }} />
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

            {s.workup.length > 0 && (
              <>
                <h3>Proposed workup <span className="sub">coverage attached where the payer answered</span></h3>
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
                            <div className="caveat">(reported by payer test response — estimate, not a guarantee)</div>
                          </>
                        ) : (
                          <span className="caveat">no service-specific benefit information returned</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {(created.length > 0 || s.createdResources.length > 0) && (
              <>
                <h3>Written to chart — click to inspect the real FHIR</h3>
                <div>
                  {[...created, ...s.createdResources].map((r) => (
                    <span key={r.id} className="chip support" onClick={() => openCite(r.resourceType, r.id)}>
                      {r.resourceType}/{r.id.slice(0, 8)}…
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rail">
          <div className="controls">
            <div className="rail-label">Chair’s bench</div>
            <div className="row">
              <button className="primary" disabled={!canAssemble} onClick={() => post('/api/session/assemble')}>
                🩺 Assemble council
              </button>
              <button onClick={() => { post('/api/session/reset'); setFinalized(null); }}>reset</button>
            </div>
            <button
              className={`primary ptt ${mic.state === 'live' ? 'talking' : ''}`}
              disabled={s.phase === 'case-ready'}
              onClick={mic.toggle}
            >
              {mic.state === 'live' ? '🔴 MIC LIVE — click to mute' : mic.state === 'muted' ? '🎙 Mic muted — click to speak' : '🎙 Enable mic'}
              <span className="hint">
                {mic.state === 'live' ? 'the council hears you — you can interrupt the chair' : 'one-time setup, then instant mute/unmute'}
              </span>
            </button>
            <div className="row">
              <input
                type="text"
                placeholder="…or type your interjection"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && text.trim()) { post('/api/session/say', { text }); setText(''); }
                }}
              />
              <button onClick={() => { if (text.trim()) { post('/api/session/say', { text }); setText(''); } }}>say</button>
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={
                  !s.selectedHypothesisId ||
                  s.workup.filter((o) => o.selected).length === 0 ||
                  !(s.phase === 'benefits-ready' || s.phase === 'workup-ready')
                }
                title={
                  !s.selectedHypothesisId
                    ? 'Select the leading diagnosis first'
                    : s.workup.length === 0
                      ? 'The council must propose a workup first'
                      : 'Write the confirmed plan to the chart'
                }
                onClick={finalize}
              >
                ✅ Finalize → write to chart
                <span className="hint">
                  {!s.selectedHypothesisId
                    ? 'locked — select the leading diagnosis first'
                    : s.workup.length === 0
                      ? 'locked — plan not proposed yet'
                      : 'diagnosis + plan agreed — ready to write'}
                </span>
              </button>
            </div>
            {finalized && <div className={finalized.startsWith('Wrote') ? 'activity' : 'errorbox'}>{finalized}</div>}
            {s.error && (
              <div className="errorbox">
                {s.error}{' '}
                <button onClick={() => post('/api/session/assemble')}>retry</button>
              </div>
            )}
            <div className="guide">
              <b>1</b> Assemble · <b>2</b> Council argues — listen · <b>3</b> Hold to speak (or type) ·{' '}
              <b>4</b> Select the leading dx · <b>5</b> Review coverage · <b>6</b> Finalize
            </div>
          </div>

          <div className="transcript" ref={transcriptRef}>
            {s.transcript.map((t, i) => (
              <div key={i} className={`turn ${t.role}`}>
                <div className="who">{t.role === 'chair' ? 'House, M.D. (chair)' : t.role}</div>
                <div className="said">{t.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {drawer && (
        <div className="drawer" onClick={() => setDrawer(null)}>
          <h3>{drawer.title} — raw FHIR</h3>
          <pre>{JSON.stringify(drawer.json, null, 2)}</pre>
          <div className="footer-note">click anywhere to close</div>
        </div>
      )}

      <div className="footer-note">
        Synthetic data only · decision support, not diagnosis · every citation opens a real record resource
      </div>
    </>
  );
}
