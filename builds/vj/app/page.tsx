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
  }, [s]);

  if (!s) return <div className="footer-note">loading…</div>;

  const seats = s.seating?.seats || [];
  const n = seats.length;
  const canAssemble = s.phase === 'case-ready' || s.phase === 'recoverable-error';

  return (
    <>
      <div className="topstrip">
        <span className="name">house_md</span>
        {s.patient && (
          <>
            <span>{s.patient.name} · DOB {s.patient.dob}</span>
            <span className="badge syn">SYNTHETIC DATA</span>
            <span className="badge">{s.patient.payer}</span>
          </>
        )}
        <span className="badge phase">{s.phase}</span>
        {s.activity && <span className="activity">{s.activity}</span>}
        <span style={{ flex: 1 }} />
        <button onClick={() => setAudioOn((v) => !v)}>{audioOn ? '🔊 chair audio on' : '🔇 enable chair audio'}</button>
        <span className="badge">the council argues, the clinician decides</span>
      </div>

      <div className="stage">
        <div className="table-wrap">
          {seats.map((seat, i) => {
            const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + 44 * Math.cos(angle);
            const y = 50 + 44 * Math.sin(angle);
            return (
              <div
                key={`${seat.specialty}-${seat.status}-${i}`}
                className={`seat ${seat.status}`}
                style={{ left: `calc(${x}% - 74px)`, top: `calc(${y}% - 30px)` }}
                title={seat.reasons.join(' · ')}
              >
                <div className="who">{seat.status === 'empty' ? 'EMPTY SEAT' : seat.personaName}</div>
                <div className="spec">{seat.specialty.replace(/-/g, ' ')}</div>
                <div className="why">{seat.reasons[0]}</div>
              </div>
            );
          })}

          <div className="center">
            {s.differential.length === 0 && (
              <div style={{ color: 'var(--muted)' }}>
                {s.phase === 'case-ready'
                  ? 'Load the case, then assemble the council.'
                  : 'The council is working — arguments land here with citations.'}
              </div>
            )}

            {s.differential.length > 0 && (
              <>
                <h3>Differential — every claim cited or labeled conjecture</h3>
                {s.differential.map((d) => (
                  <div key={d.id} className={`dx ${d.status === 'leading' ? 'leading' : ''}`}>
                    <div className="head">
                      <span className="rank">#{d.rank}</span>
                      <span className="title">{d.display}</span>
                      <span style={{ flex: 1 }} />
                      {s.phase !== 'case-ready' && (
                        <button disabled={d.status === 'leading'} onClick={() => post('/api/session/select', { id: d.id })}>
                          {d.status === 'leading' ? 'leading' : 'select as leading'}
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: 13 }}>{d.assessment}</div>
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
                <h3>Proposed workup — coverage attached where the payer answered</h3>
                {s.workup.map((o) => (
                  <div key={o.id} className="opt">
                    <div className="title">{o.display} <span className="badge">{o.priority}</span></div>
                    <div style={{ fontSize: 13 }}>{o.purpose}</div>
                    {o.sequenceNote && <div className="seq">⇄ {o.sequenceNote}</div>}
                    {o.benefit && (
                      <div className="ben">
                        {o.benefit.matched ? (
                          <>
                            plan {o.benefit.planActive ? 'ACTIVE' : 'INACTIVE'}
                            {o.benefit.copay && <> · copay <span className="money">{o.benefit.copay}</span></>}
                            {o.benefit.deductibleRemaining && <> · deductible left <span className="money">{o.benefit.deductibleRemaining}</span></>}
                            {o.benefit.oopRemaining && <> · OOP left <span className="money">{o.benefit.oopRemaining}</span></>}
                            {o.benefit.messages.map((m, i) => <div key={i}>payer: “{m}”</div>)}
                            <div>(reported by payer test response — estimate, not a guarantee)</div>
                          </>
                        ) : (
                          <>no service-specific benefit information returned</>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {s.createdResources.length > 0 && (
              <>
                <h3>Written to chart</h3>
                {s.createdResources.map((r) => (
                  <span key={r.id} className="chip support" onClick={() => openCite(r.resourceType, r.id)}>
                    {r.resourceType}/{r.id}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="rail">
          <div className="controls">
            <div className="row">
              <button className="primary" disabled={!canAssemble} onClick={() => post('/api/session/assemble')}>
                🩺 Assemble council
              </button>
              <button onClick={() => { post('/api/session/reset'); setFinalized(null); }}>reset</button>
            </div>
            <button
              className={`primary ptt ${ptt.talking ? 'talking' : ''}`}
              disabled={s.phase === 'case-ready'}
              onPointerDown={ptt.start}
              onPointerUp={ptt.stop}
              onPointerLeave={ptt.stop}
            >
              {ptt.talking ? '🎙 LISTENING — release when done' : '🎙 HOLD to speak to the council'}
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
                disabled={!(s.phase === 'benefits-ready' || s.phase === 'workup-ready')}
                onClick={finalize}
              >
                ✅ Finalize → write to chart
              </button>
            </div>
            {finalized && <div className={finalized.startsWith('Wrote') ? 'activity' : 'errorbox'}>{finalized}</div>}
            {s.error && (
              <div className="errorbox">
                {s.error}{' '}
                <button onClick={() => post('/api/session/assemble')}>retry</button>
              </div>
            )}
          </div>

          <div className="transcript" ref={transcriptRef}>
            {s.transcript.map((t, i) => (
              <div key={i} className={`turn ${t.role}`}>
                <div className="who">{t.role === 'chair' ? 'House, M.D. (chair)' : t.role}</div>
                <div>{t.text}</div>
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
