'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Claim, CreatedResource, EvidenceItem, IntegrationName, Seat, SessionState, WorkupItem } from '@/domain/types';

const SESSION_ID = 'demo-session';

export default function LivingDifferentialPage() {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [voice, setVoice] = useState<'offline' | 'connecting' | 'ready' | 'listening' | 'speaking' | 'error'>('offline');
  const [caption, setCaption] = useState('Connect the managed voice agent to present the case.');
  const [drawer, setDrawer] = useState<{ title: string; value: unknown } | null>(null);
  const [activePersona, setActivePersona] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<{ context: AudioContext; stream: MediaStream; node: AudioWorkletNode } | null>(null);
  const playbackRef = useRef<{ context: AudioContext; cursor: number }>({ context: null as unknown as AudioContext, cursor: 0 });
  const listeningRef = useRef(false);
  const specialistQueueRef = useRef<Array<{ personaId: string; text: string }>>([]);
  const specialistAudioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/session?id=${SESSION_ID}`, { cache: 'no-store' });
    const value = await response.json();
    if (!response.ok && !value.id) throw new Error(value.error || 'Unable to load session');
    setState(value);
    if (value.error) setError(value.error);
    return value as SessionState;
  }, []);

  useEffect(() => { refresh().catch((reason) => setError(reason.message)); }, [refresh]);
  useEffect(() => () => { socketRef.current?.close(); stopCapture(captureRef); }, []);

  const api = useCallback(async (path: string, body: object) => {
    setBusy(path);
    setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: SESSION_ID, ...body }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Request failed');
      setState(value);
      return value as SessionState;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    } finally {
      setBusy('');
    }
  }, []);

  const flushSpecialists = useCallback(() => {
    specialistQueueRef.current = [];
    if (specialistAudioRef.current) {
      specialistAudioRef.current.pause();
      specialistAudioRef.current.src = '';
      specialistAudioRef.current = null;
    }
    setActivePersona('');
  }, []);

  const playSpecialists = useCallback(async () => {
    while (specialistQueueRef.current.length) {
      const line = specialistQueueRef.current.shift()!;
      setActivePersona(line.personaId);
      setVoice('speaking');
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(line) });
      if (!response.ok) { setError((await response.json()).error ?? 'Specialist voice failed.'); break; }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      specialistAudioRef.current = audio;
      await new Promise<void>((resolve) => { audio.onended = () => resolve(); audio.onerror = () => resolve(); audio.play().catch(() => resolve()); });
      URL.revokeObjectURL(url);
      if (specialistAudioRef.current === audio) specialistAudioRef.current = null;
    }
    setActivePersona('');
    setVoice('ready');
  }, []);

  const connectVoice = useCallback(() => {
    socketRef.current?.close();
    setVoice('connecting');
    setCaption('Opening the managed Deepgram room…');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/agent`);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'start', sessionId: SESSION_ID }));
    socket.onmessage = async (message) => {
      if (message.data instanceof ArrayBuffer) { playPcm(message.data, playbackRef); setVoice('speaking'); return; }
      const payload = JSON.parse(String(message.data));
      if (payload.type === 'status') {
        if (payload.state === 'ready') { setVoice('ready'); setCaption('Room connected. Hold to present the case.'); }
        else if (payload.state === 'connecting') setVoice('connecting');
        else if (payload.state === 'error') { setVoice('error'); setError(payload.detail); }
      }
      if (payload.type === 'function') {
        const next = await refresh();
        if (payload.name === 'update_differential') specialistQueueRef.current = next.contributions.slice(0, 2).map((item) => ({ personaId: item.personaId, text: item.leadingInterpretation.text }));
      }
      if (payload.type === 'dg') {
        const event = payload.event;
        if (event.type === 'ConversationText') {
          const text = event.content ?? event.text ?? '';
          if (text) setCaption(text);
          if (event.role === 'user' && text) setState((current) => current ? { ...current, transcript: text } : current);
        }
        if (event.type === 'UserStartedSpeaking') { flushPlayback(playbackRef); flushSpecialists(); setVoice('listening'); }
        if (event.type === 'AgentStartedSpeaking') setVoice('speaking');
        if (event.type === 'AgentAudioDone') { if (specialistQueueRef.current.length) void playSpecialists(); else setVoice('ready'); }
        if (event.type === 'Error') { setVoice('error'); setError(event.description ?? event.message ?? 'Deepgram agent error'); }
      }
    };
    socket.onerror = () => { setVoice('error'); setError('The Deepgram relay could not connect.'); };
    socket.onclose = () => setVoice((current) => current === 'error' ? current : 'offline');
  }, [flushSpecialists, playSpecialists, refresh]);

  const beginTalk = useCallback(async (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (voice !== 'ready' && voice !== 'listening') return;
    try {
      if (!captureRef.current) captureRef.current = await createCapture((pcm) => { if (listeningRef.current && socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(pcm); });
      listeningRef.current = true;
      flushPlayback(playbackRef);
      flushSpecialists();
      setVoice('listening');
      setCaption('Listening… release when finished.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [flushSpecialists, voice]);

  const endTalk = useCallback(() => { listeningRef.current = false; setVoice('ready'); setCaption('Processing the clinician’s presentation…'); }, []);

  const feedPrerecorded = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || voice !== 'ready') { setError('Connect the Deepgram room before sending prerecorded audio.'); return; }
    setBusy('prerecorded');
    setVoice('listening');
    setCaption('Streaming clinically reviewed audio in real time…');
    try {
      const response = await fetch('/case-presentation.wav', { cache: 'no-store' });
      if (!response.ok) throw new Error('Prerecorded WAV is unavailable.');
      const pcm = await decodeToPcm24k(await response.arrayBuffer());
      const frame = 960;
      for (let offset = 0; offset < pcm.length; offset += frame) {
        socket.send(pcm.slice(offset, Math.min(offset + frame, pcm.length)).buffer);
        await delay(40);
      }
      const silence = new Int16Array(frame);
      for (let index = 0; index < 38; index += 1) { socket.send(silence.buffer); await delay(40); }
      setCaption('Audio delivered through Deepgram. Waiting for the live transcript…');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); setVoice('ready'); }
  }, [voice]);

  const assemble = useCallback(async () => {
    const transcript = state?.transcript?.trim();
    if (!transcript) { setError('Present the case through Deepgram first; no stored transcript will be substituted.'); return; }
    const next = await api('/api/session/assemble', { presentation: transcript });
    const empty = next.seats.filter((seat) => seat.kind === 'empty').map((seat) => seat.specialty).join(', ');
    socketRef.current?.send(JSON.stringify({ type: 'inject', content: `The clinician clicked Assemble council. Begin the evidence search and council debate now.${empty ? ` Explicitly call out the empty ${empty} seat.` : ''}` }));
  }, [api, state?.transcript]);

  const selectDx = useCallback(async (id: string) => {
    await api('/api/session/selection', { type: 'hypothesis', itemId: id });
    socketRef.current?.send(JSON.stringify({ type: 'inject', content: 'The clinician selected the leading hypothesis and is ready to discuss a discriminating workup. Call propose_workup now.' }));
  }, [api]);

  const checkCoverage = useCallback(async () => {
    const next = await api('/api/session/coverage', {});
    if (next.coverage) socketRef.current?.send(JSON.stringify({ type: 'inject', content: `The live Stedi response is now on the board. State only these returned facts: ${next.coverage.message ?? 'no referral message'}; specialist copay ${next.coverage.specialistCopay == null ? 'not returned' : `$${next.coverage.specialistCopay}`}; remaining individual deductible ${next.coverage.deductibleRemaining == null ? 'not returned' : `$${next.coverage.deductibleRemaining}`}; remaining individual out-of-pocket ${next.coverage.oopRemaining == null ? 'not returned' : `$${next.coverage.oopRemaining}`}. Explain the visible sequencing change without calling coverage a guarantee.` }));
  }, [api]);

  if (!state) return <main className="loading-shell" aria-busy="true"><div className="loading-line" /><p>Loading the synthetic patient record from Medplum…</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="identity">
          <span className="mark" aria-hidden="true">h</span>
          <div><h1>Living Differential</h1><p>The council argues. The clinician decides.</p></div>
        </div>
        <div className="patient-strip">
          {state.patient ? <><strong>{state.patient.display}</strong><span>{state.patient.age} · {state.patient.sex}</span><span className="test-badge">Synthetic patient</span><span className="payer-badge">UHC · test data</span></> : <><strong>Patient unavailable</strong><span className="test-badge">No fixture substituted</span></>}
        </div>
        <div className={`session-state state-${state.status}`}>{labelStatus(state.status)}</div>
      </header>

      <section className="integration-bar" aria-label="Integration status">
        {(Object.keys(state.integrations) as IntegrationName[]).map((name) => <Integration key={name} name={name} state={state.integrations[name]} />)}
      </section>

      {error && <div className="error-banner" role="alert"><div><strong>Action could not complete</strong><span>{error}</span></div><button onClick={() => { setError(''); refresh(); }}>Retry state</button></div>}

      <section className="council-room" aria-label="Virtual council table">
        <div className="seats" aria-label="Council seats">
          {state.seats.length ? state.seats.map((seat, index) => <CouncilSeat key={seat.id} seat={{ ...seat, active: seat.persona?.id === activePersona }} index={index} />) : <UnassembledSeats />}
        </div>

        <article className="table-surface">
          <header className="board-header">
            <div><h2>Shared reasoning surface</h2><p>{state.patient ? `${state.patient.resourceCount} current FHIR resources · every citation opens the source JSON` : 'Waiting for a real Medplum patient record'}</p></div>
            {state.status === 'presenting' && <button className="primary" disabled={!state.transcript || busy !== ''} onClick={assemble}>{busy.includes('assemble') ? 'Assembling…' : 'Assemble council'}</button>}
          </header>

          <section className="board-region evidence-region" aria-labelledby="evidence-title">
            <div className="region-heading"><h3 id="evidence-title">Evidence retrieval</h3>{state.evidenceSearch && <span className="search-proof">Moss searched {state.evidenceSearch.scanned} records → {state.evidenceSearch.hits} hits</span>}</div>
            {state.evidence.length ? <div className="evidence-list">{state.evidence.map((item) => <Evidence key={item.alias} item={item} open={() => setDrawer({ title: `${item.alias} · ${item.resourceId}`, value: item.raw })} />)}</div> : <EmptyLine text={state.seats.length ? 'The chair will search the current record before the first argument.' : 'Present the case, then assemble the council to retrieve evidence.'} />}
          </section>

          <section className="board-region differential-region" aria-labelledby="differential-title">
            <div className="region-heading"><h3 id="differential-title">Ranked differential</h3><span className="guardrail">Cited or conjecture · enforced</span></div>
            {state.differential.length ? <ol className="differential-list">{state.differential.map((item) => <li key={item.id} className={item.selected ? 'selected-dx' : ''}>
              <button className="rank-button" onClick={() => selectDx(item.id)} aria-pressed={item.selected}><span className="rank">{item.rank}</span><span><strong>{item.label}</strong><ClaimLine claim={item.rationale} /></span><span className={`movement movement-${item.movement}`}>{movementLabel(item.movement)}</span></button>
            </li>)}</ol> : <EmptyLine text="The live council’s structured tool call will place and re-rank hypotheses here." />}
            {state.contributions.length > 0 && <div className="argument-stream">{state.contributions.slice(0, 3).map((item) => <div key={item.id}><strong>{state.seats.find((seat) => seat.persona?.id === item.personaId)?.label ?? item.personaId}</strong><ClaimLine claim={item.leadingInterpretation} />{item.challenged && <span className="challenge-chip">Chair challenged</span>}</div>)}</div>}
          </section>

          <section className="board-region workup-region" aria-labelledby="workup-title">
            <div className="region-heading"><h3 id="workup-title">Proposed workup</h3>{state.workup.length > 0 && !state.coverage && <button className="secondary" disabled={busy !== ''} onClick={checkCoverage}>{busy.includes('coverage') ? 'Checking Stedi…' : 'Check live eligibility'}</button>}</div>
            {state.workup.length ? <ol className="workup-list">{state.workup.map((item) => <Workup key={item.id} item={item} toggle={(selected) => api('/api/session/selection', { type: 'workup', itemId: item.id, selected })} />)}</ol> : <EmptyLine text="Select a leading hypothesis to ask the council for a discriminating workup." />}
            {state.coverage && <div className="coverage-note"><strong>{state.coverage.payer} · {state.coverage.plan ?? 'plan name not returned'}</strong><span>Eligibility checked {new Date(state.coverage.checkedAt).toLocaleTimeString()} · reported facts, not a guarantee of payment</span>{state.coverage.oopRemaining != null && <span>Individual in-network OOP remaining: ${state.coverage.oopRemaining} reported at plan level; no workup total calculated.</span>}</div>}
          </section>

          <section className="board-region resource-region" aria-labelledby="resource-title">
            <div className="region-heading"><h3 id="resource-title">Chart documentation</h3>{state.workup.length > 0 && state.status !== 'finalized' && <button className="primary" disabled={busy !== '' || !state.differential.some((item) => item.selected)} onClick={() => api('/api/session/finalize', {})}>{busy.includes('finalize') ? 'Writing FHIR…' : 'Finalize proposed plan'}</button>}</div>
            {state.createdResources.length ? <div className="resource-list">{state.createdResources.map((item) => <ResourceButton key={item.key} item={item} open={() => setDrawer({ title: item.reference, value: item.resource })} />)}</div> : <EmptyLine text="Explicit confirmation writes one ClinicalImpression and selected draft ServiceRequests." />}
          </section>
        </article>
      </section>

      <footer className="voice-dock">
        <div className={`voice-orb voice-${voice}`} aria-hidden="true"><span /></div>
        <div className="caption"><strong>{voiceLabel(voice)}</strong><p>{caption}</p></div>
        <div className="voice-actions">
          {voice === 'offline' || voice === 'error' ? <button className="primary" onClick={connectVoice}>Connect voice room</button> : <>
            <button className="secondary" disabled={voice !== 'ready' || busy !== ''} onClick={feedPrerecorded}>{busy === 'prerecorded' ? 'Streaming audio…' : 'Play reviewed case audio'}</button>
            <button className="talk-button" disabled={voice !== 'ready' && voice !== 'listening'} onPointerDown={beginTalk} onPointerUp={endTalk} onPointerCancel={endTalk}>Hold to present</button>
          </>}
        </div>
      </footer>

      {drawer && <JsonDrawer title={drawer.title} value={drawer.value} close={() => setDrawer(null)} />}
    </main>
  );
}

function Integration({ name, state }: { name: IntegrationName; state: SessionState['integrations'][IntegrationName] }) {
  return <div className={`integration integration-${state.state}`} title={state.detail}><span className="status-dot" /><strong>{name[0].toUpperCase() + name.slice(1)}</strong><span>{state.state === 'working' ? 'working' : state.state}</span></div>;
}

function CouncilSeat({ seat, index }: { seat: Seat; index: number }) {
  return <div className={`council-seat seat-${seat.kind} seat-position-${index % 8}${seat.active ? ' seat-active' : ''}`} title={seat.reason} style={{ '--seat-index': index } as CSSProperties}>
    <div className="seat-avatar">{seat.kind === 'empty' ? '—' : initials(seat.label)}</div><div><strong>{seat.label}</strong><span>{seat.specialty.replace('-', ' ')}</span><p>{seat.reason}</p></div>
  </div>;
}

function UnassembledSeats() {
  return <><div className="council-seat placeholder-seat seat-position-0"><div className="seat-avatar">H</div><div><strong>Chair</strong><span>Waiting</span></div></div><div className="council-seat placeholder-seat seat-position-4"><div className="seat-avatar">You</div><div><strong>Managing clinician</strong><span>Present the case</span></div></div></>;
}

function Evidence({ item, open }: { item: EvidenceItem; open: () => void }) {
  return <button className="evidence-item" onClick={open}><span className="alias">{item.alias}</span><span><strong>{item.title}</strong><span>{item.summary}</span></span><span className="source-type">{item.resourceType}</span></button>;
}

function ClaimLine({ claim }: { claim: Claim }) {
  return <span className={`claim claim-${claim.grounding}`}><span>{claim.text}</span><span className="claim-meta">{claim.grounding === 'record-cited' ? claim.citations.join(' · ') : claim.grounding === 'general-reasoning' ? 'General reasoning' : `Conjecture · ${claim.demotionReason}`}</span></span>;
}

function Workup({ item, toggle }: { item: WorkupItem; toggle: (value: boolean) => void }) {
  return <li className={item.referralGate ? 'referral-gated' : ''}><label><input type="checkbox" checked={item.selected} onChange={(event) => toggle(event.target.checked)} /><span className="sequence">{item.sequence}</span><span className="workup-copy"><strong>{item.label}</strong><span>{item.rationale}</span><span className="benefit-row">{item.benefits.map((fact) => <span key={`${fact.label}-${fact.value}`} className={`benefit benefit-${fact.qualifier}`}>{fact.label}: {fact.value}</span>)}</span></span></label></li>;
}

function ResourceButton({ item, open }: { item: CreatedResource; open: () => void }) {
  return <button onClick={open}><span className="resource-icon">{item.resource.resourceType === 'ClinicalImpression' ? 'CI' : 'SR'}</span><span><strong>{item.label}</strong><span>{item.reference} · open raw JSON</span></span></button>;
}

function EmptyLine({ text }: { text: string }) { return <div className="empty-line"><span /><p>{text}</p></div>; }

function JsonDrawer({ title, value, close }: { title: string; value: unknown; close: () => void }) {
  return <div className="drawer-backdrop" role="presentation" onMouseDown={close}><aside className="json-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}><header><div><h2 id="drawer-title">{title}</h2><p>FHIR R4 resource from the current session</p></div><button onClick={close} aria-label="Close raw JSON">Close</button></header><pre>{JSON.stringify(value, null, 2)}</pre></aside></div>;
}

async function createCapture(onPcm: (buffer: ArrayBuffer) => void) {
  const context = new AudioContext({ sampleRate: 24_000 });
  await context.audioWorklet.addModule('/worklet.js');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-capture');
  node.port.onmessage = (event) => onPcm(event.data);
  source.connect(node);
  node.connect(context.destination);
  return { context, stream, node };
}

function stopCapture(ref: { current: { context: AudioContext; stream: MediaStream; node: AudioWorkletNode } | null }) { const capture = ref.current; if (!capture) return; capture.stream.getTracks().forEach((track) => track.stop()); capture.node.disconnect(); capture.context.close(); ref.current = null; }

function playPcm(array: ArrayBuffer, ref: { current: { context: AudioContext; cursor: number } }) {
  if (!ref.current.context) ref.current = { context: new AudioContext({ sampleRate: 24_000 }), cursor: 0 };
  const { context } = ref.current;
  const pcm = new Int16Array(array);
  const buffer = context.createBuffer(1, pcm.length, 24_000);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 0x8000;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const start = Math.max(context.currentTime, ref.current.cursor);
  source.start(start);
  ref.current.cursor = start + buffer.duration;
}

function flushPlayback(ref: { current: { context: AudioContext; cursor: number } }) { if (ref.current.context) { ref.current.context.close(); ref.current = { context: null as unknown as AudioContext, cursor: 0 }; } }
async function decodeToPcm24k(data: ArrayBuffer) { const sourceContext = new AudioContext(); const decoded = await sourceContext.decodeAudioData(data.slice(0)); const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 24_000), 24_000); const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(); const rendered = await offline.startRendering(); await sourceContext.close(); const floats = rendered.getChannelData(0); const pcm = new Int16Array(floats.length); for (let index = 0; index < floats.length; index += 1) pcm[index] = Math.max(-1, Math.min(1, floats[index])) * 0x7fff; return pcm; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const labelStatus = (status: SessionState['status']) => ({ loading: 'Loading record', presenting: 'Awaiting presentation', assembled: 'Council assembled', debating: 'Differential active', planning: 'Plan in review', finalized: 'Chart documented', error: 'Integration attention' }[status]);
const voiceLabel = (voice: string) => ({ offline: 'Voice room offline', connecting: 'Connecting Deepgram', ready: 'Room ready', listening: 'Listening to clinician', speaking: 'Chair speaking', error: 'Voice needs attention' }[voice]);
const movementLabel = (movement: string) => ({ up: '↑ moved up', down: '↓ moved down', new: '+ entered', same: '— stable' }[movement]);
