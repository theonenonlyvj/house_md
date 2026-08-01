'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { AgentMicrophone, AgentPlayer, AgentSession, type FunctionCallRequestMessage } from '@deepgram/agents';
import { AGENT_SETTINGS } from '@/client/voice-agent';
import { isSessionState, specialistLinesFor, type SpecialistLine } from '@/client/voice-functions';
import type { Claim, CreatedResource, EvidenceItem, IntegrationName, Seat, SessionState, WorkupItem } from '@/domain/types';

const SESSION_ID = 'demo-session';
const INTEGRATION_NAMES: IntegrationName[] = ['medplum', 'deepgram', 'moss', 'stedi'];

export default function LivingDifferentialPage() {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [voice, setVoice] = useState<'offline' | 'connecting' | 'ready' | 'listening' | 'speaking' | 'error'>('offline');
  const [caption, setCaption] = useState('Connect the managed voice agent to present the case.');
  const [drawer, setDrawer] = useState<{ title: string; value: unknown } | null>(null);
  const [activePersona, setActivePersona] = useState('');
  const sessionRef = useRef<AgentSession | null>(null);
  const microphoneRef = useRef<AgentMicrophone | null>(null);
  const playerRef = useRef<AgentPlayer | null>(null);
  const specialistQueueRef = useRef<SpecialistLine[]>([]);
  const specialistPlaybackRef = useRef(false);
  const specialistEpochRef = useRef(0);
  const chairSpeakingRef = useRef(false);
  const processingFallbackRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/session?id=${SESSION_ID}`, { cache: 'no-store' });
    const value = await response.json() as unknown;
    const responseError = value && typeof value === 'object' && 'error' in value ? String(value.error) : '';
    if (!response.ok) throw new Error(responseError || 'Unable to load session');
    if (!isSessionState(value)) throw new Error('Session API returned an invalid state payload.');
    setState(value);
    if (value.error) setError(value.error);
    return value;
  }, []);

  useEffect(() => { refresh().catch((reason) => setError(reason.message)); }, [refresh]);
  useEffect(() => () => {
    if (processingFallbackRef.current !== null) window.clearTimeout(processingFallbackRef.current);
    microphoneRef.current?.stop();
    sessionRef.current?.disconnect();
    playerRef.current?.dispose();
  }, []);

  const api = useCallback(async (path: string, body: object) => {
    setBusy(path);
    setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: SESSION_ID, ...body }) });
      const value = await response.json() as unknown;
      const responseError = value && typeof value === 'object' && 'error' in value ? String(value.error) : '';
      if (!response.ok) throw new Error(responseError || 'Request failed');
      if (!isSessionState(value)) throw new Error(`${path} returned an invalid session state.`);
      setState(value);
      return value;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      throw reason;
    } finally {
      setBusy('');
    }
  }, []);

  const flushSpecialists = useCallback(() => {
    specialistEpochRef.current += 1;
    specialistQueueRef.current = [];
    playerRef.current?.interrupt();
    setActivePersona('');
  }, []);

  const clearProcessingFallback = useCallback(() => {
    if (processingFallbackRef.current !== null) {
      window.clearTimeout(processingFallbackRef.current);
      processingFallbackRef.current = null;
    }
  }, []);

  const playSpecialists = useCallback(async () => {
    if (specialistPlaybackRef.current || chairSpeakingRef.current) return;
    const player = playerRef.current;
    if (!player) return;
    const epoch = specialistEpochRef.current;
    let deferredToChair = false;
    specialistPlaybackRef.current = true;
    try {
      while (specialistQueueRef.current.length && specialistEpochRef.current === epoch) {
        const line = specialistQueueRef.current.shift()!;
        setActivePersona(line.personaId);
        setVoice('speaking');
        setCaption(`${line.speaker}: ${line.text}`);
        const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(line) });
        if (!response.ok) {
          const value = await response.json().catch(() => ({ error: 'Specialist voice failed.' })) as { error?: string };
          throw new Error(value.error ?? 'Specialist voice failed.');
        }
        const pcm = await response.arrayBuffer();
        if (pcm.byteLength === 0) throw new Error('Specialist voice returned empty audio.');
        if (chairSpeakingRef.current) {
          specialistQueueRef.current.unshift(line);
          setActivePersona('');
          deferredToChair = true;
          break;
        }
        player.queue(pcm);
        await delay(Math.ceil(player.getRemainingPlaybackTime() * 1_000) + 75);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      specialistPlaybackRef.current = false;
      if (specialistEpochRef.current === epoch && !deferredToChair) {
        setActivePersona('');
        setVoice('ready');
        setCaption('Council voices complete. The clinician remains in control.');
      }
    }
  }, []);

  const handleFunctionCalls = useCallback(async (message: FunctionCallRequestMessage, session: AgentSession) => {
    for (const call of message.functions ?? []) {
      let args: Record<string, unknown> = {};
      try {
        const candidate = (call as { arguments?: string; input?: unknown }).arguments ?? (call as { input?: unknown }).input;
        const raw = typeof candidate === 'string' ? candidate : JSON.stringify(candidate ?? {});
        args = JSON.parse(raw || '{}') as Record<string, unknown>;
      } catch {
        session.sendFunctionCallResponse(call.id, call.name, JSON.stringify({ error: 'Tool arguments were not valid JSON.' }));
        continue;
      }

      try {
        const evidenceSearch = call.name === 'search_patient_evidence';
        const response = await fetch(evidenceSearch ? '/api/session/evidence' : '/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evidenceSearch
            ? { id: SESSION_ID, query: args.query }
            : { id: SESSION_ID, action: call.name, payload: args }),
        });
        const value = await response.json() as unknown;
        const apiError = value && typeof value === 'object' && 'error' in value ? String(value.error) : '';
        if (!response.ok) throw new Error(apiError || `${call.name} failed`);
        let result = value;
        if (evidenceSearch) {
          if (!isSessionState(value)) throw new Error('Evidence search returned an invalid session state.');
          setState(value);
          result = {
            query: value.evidenceSearch?.query,
            scanned: value.evidenceSearch?.scanned,
            hits: value.evidence.map(({ alias, resourceType, title, summary, date }) => ({ alias, resourceType, title, summary, date })),
          };
        } else if (isSessionState(value)) {
          setState(value);
          const lines = specialistLinesFor(call.name, value);
          if (lines.length) {
            specialistQueueRef.current = lines;
            // Deepgram can emit AgentAudioDone before the structured tool call.
            // This fallback complements the event path without overlapping the chair.
            window.setTimeout(() => void playSpecialists(), 4_000);
          }
        }
        session.sendFunctionCallResponse(call.id, call.name, JSON.stringify(result));
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        session.sendFunctionCallResponse(call.id, call.name, JSON.stringify({ error: message }));
      }
    }
  }, [playSpecialists]);

  const connectVoice = useCallback(async () => {
    clearProcessingFallback();
    microphoneRef.current?.stop();
    microphoneRef.current = null;
    sessionRef.current?.disconnect();
    playerRef.current?.dispose();
    chairSpeakingRef.current = false;
    setVoice('connecting');
    setError('');
    setCaption('Opening a direct Deepgram voice session…');

    const player = new AgentPlayer({ sampleRate: 24_000 });
    const session = new AgentSession({
      auth: {
        tokenFactory: async () => {
          const response = await fetch('/api/deepgram-token', { cache: 'no-store' });
          if (!response.ok) {
            const value = await response.json().catch(() => ({ error: 'Unable to get a Deepgram access token.' })) as { error?: string };
            throw new Error(value.error || 'Unable to get a Deepgram access token.');
          }
          return response.text();
        },
      },
      agent: AGENT_SETTINGS,
      audio: { input: { encoding: 'linear16', sampleRate: 24_000 }, output: { encoding: 'linear16', sampleRate: 24_000 } },
      keepAliveInterval: 8_000,
      reconnect: { enabled: true, maxAttempts: 4 },
    });
    playerRef.current = player;
    sessionRef.current = session;

    session.on('settings-applied', () => { setVoice('ready'); setCaption('Room connected. Hold to present the case.'); });
    session.on('audio', (chunk) => { clearProcessingFallback(); player.queue(chunk); setVoice('speaking'); });
    session.on('conversation-text', (message) => {
      const text = message.content ?? '';
      if (text) { clearProcessingFallback(); setCaption(text); }
      if (message.role === 'user' && text) setState((current) => current ? { ...current, transcript: text } : current);
    });
    session.on('user-started-speaking', () => { chairSpeakingRef.current = false; flushSpecialists(); setVoice('listening'); });
    session.on('agent-started-speaking', () => { clearProcessingFallback(); chairSpeakingRef.current = true; setVoice('speaking'); });
    session.on('agent-audio-done', () => {
      chairSpeakingRef.current = false;
      const playbackDelay = Math.ceil(player.getRemainingPlaybackTime() * 1_000);
      window.setTimeout(() => {
        if (sessionRef.current !== session) return;
        if (specialistQueueRef.current.length) void playSpecialists();
        else setVoice('ready');
      }, playbackDelay);
    });
    session.on('function-call-request', (message) => { clearProcessingFallback(); void handleFunctionCalls(message, session); });
    session.on('error', (message) => {
      setVoice('error');
      setError(('description' in message && message.description) || 'Deepgram agent error');
    });
    session.on('sdk-error', (reason) => { setVoice('error'); setError(reason.message); });
    session.on('reconnecting', () => { setVoice('connecting'); setCaption('Reconnecting directly to Deepgram…'); });
    session.on('disconnected', () => setVoice((current) => current === 'error' ? current : 'offline'));

    try {
      await session.connect();
    } catch (reason) {
      setVoice('error');
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [clearProcessingFallback, flushSpecialists, handleFunctionCalls, playSpecialists]);

  const beginTalk = useCallback(async (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearProcessingFallback();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (voice !== 'ready' && voice !== 'listening') return;
    try {
      const session = sessionRef.current;
      if (!session) throw new Error('Connect the Deepgram room first.');
      if (!microphoneRef.current) {
        microphoneRef.current = new AgentMicrophone((pcm) => session.sendAudio(pcm), { sampleRate: 24_000 });
        await microphoneRef.current.start();
      } else {
        microphoneRef.current.unmute();
      }
      flushSpecialists();
      setVoice('listening');
      setCaption('Listening… release when finished.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [clearProcessingFallback, flushSpecialists, voice]);

  const endTalk = useCallback(() => {
    microphoneRef.current?.mute();
    setVoice('ready');
    setCaption('Processing the clinician’s presentation…');
    clearProcessingFallback();
    const session = sessionRef.current;
    processingFallbackRef.current = window.setTimeout(() => {
      processingFallbackRef.current = null;
      if (sessionRef.current !== session || chairSpeakingRef.current || specialistPlaybackRef.current) return;
      setVoice((current) => {
        if (current === 'ready' || current === 'listening') setCaption('Room ready. Hold to present or play the reviewed case audio.');
        return current === 'listening' ? 'ready' : current;
      });
    }, 5_000);
  }, [clearProcessingFallback]);

  const feedPrerecorded = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || voice !== 'ready') { setError('Connect the Deepgram room before sending prerecorded audio.'); return; }
    setBusy('prerecorded');
    setVoice('listening');
    setCaption('Streaming clinically reviewed audio in real time…');
    try {
      const response = await fetch('/case-presentation.wav', { cache: 'no-store' });
      if (!response.ok) throw new Error('Prerecorded WAV is unavailable.');
      const pcm = await decodeToPcm24k(await response.arrayBuffer());
      const frame = 960;
      for (let offset = 0; offset < pcm.length; offset += frame) {
        const chunk = pcm.slice(offset, Math.min(offset + frame, pcm.length));
        session.sendAudio(chunk.buffer as ArrayBuffer);
        await delay(40);
      }
      const silence = new Int16Array(frame);
      for (let index = 0; index < 38; index += 1) { session.sendAudio(silence.buffer as ArrayBuffer); await delay(40); }
      setCaption('Audio delivered through Deepgram. Waiting for the live transcript…');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); setVoice('ready'); }
  }, [voice]);

  const assemble = useCallback(async () => {
    const transcript = state?.transcript?.trim();
    if (!transcript) { setError('Present the case through Deepgram first; no stored transcript will be substituted.'); return; }
    const next = await api('/api/session/assemble', { presentation: transcript });
    const empty = next.seats.filter((seat) => seat.kind === 'empty').map((seat) => seat.specialty).join(', ');
    sessionRef.current?.injectUserMessage(`The clinician clicked Assemble council. Begin the evidence search and council debate now.${empty ? ` Explicitly call out the empty ${empty} seat.` : ''}`);
  }, [api, state?.transcript]);

  const selectDx = useCallback(async (id: string) => {
    await api('/api/session/selection', { type: 'hypothesis', itemId: id });
    sessionRef.current?.injectUserMessage('The clinician selected the leading hypothesis and is ready to discuss a discriminating workup. Call propose_workup now.');
  }, [api]);

  const checkCoverage = useCallback(async () => {
    const next = await api('/api/session/coverage', {});
    if (next.coverage) sessionRef.current?.injectUserMessage(`The live Stedi response is now on the board. State only these returned facts: ${next.coverage.message ?? 'no referral message'}; specialist copay ${next.coverage.specialistCopay == null ? 'not returned' : `$${next.coverage.specialistCopay}`}; remaining individual deductible ${next.coverage.deductibleRemaining == null ? 'not returned' : `$${next.coverage.deductibleRemaining}`}; remaining individual out-of-pocket ${next.coverage.oopRemaining == null ? 'not returned' : `$${next.coverage.oopRemaining}`}. Explain the visible sequencing change without calling coverage a guarantee.`);
  }, [api]);

  if (!state) return <main className="loading-shell" aria-busy="true"><div className="loading-line" /><p>Loading the synthetic patient record from Medplum…</p></main>;
  if (!isSessionState(state)) return <main className="loading-shell" role="alert"><div className="loading-line" /><p>The session response was invalid. Reload to reconnect safely.</p></main>;
  const activeSpeaker = state.seats.find((seat) => seat.persona?.id === activePersona)?.label;

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
        {INTEGRATION_NAMES.map((name) => <Integration key={name} name={name} state={state.integrations[name]} />)}
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
        <div className="caption"><strong>{activeSpeaker ? `${activeSpeaker} speaking` : voiceLabel(voice)}</strong><p>{caption}</p></div>
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

async function decodeToPcm24k(data: ArrayBuffer) { const sourceContext = new AudioContext(); const decoded = await sourceContext.decodeAudioData(data.slice(0)); const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 24_000), 24_000); const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(); const rendered = await offline.startRendering(); await sourceContext.close(); const floats = rendered.getChannelData(0); const pcm = new Int16Array(floats.length); for (let index = 0; index < floats.length; index += 1) pcm[index] = Math.max(-1, Math.min(1, floats[index])) * 0x7fff; return pcm; }
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const labelStatus = (status: SessionState['status']) => ({ loading: 'Loading record', presenting: 'Awaiting presentation', assembled: 'Council assembled', debating: 'Differential active', planning: 'Plan in review', finalized: 'Chart documented', error: 'Integration attention' }[status]);
const voiceLabel = (voice: string) => ({ offline: 'Voice room offline', connecting: 'Connecting Deepgram', ready: 'Room ready', listening: 'Listening to clinician', speaking: 'Chair speaking', error: 'Voice needs attention' }[voice]);
const movementLabel = (movement: string) => ({ up: '↑ moved up', down: '↓ moved down', new: '+ entered', same: '— stable' }[movement]);
