import type { EvidenceRef, NoteEntry, NoteKind, SessionState } from '../shared/types';
import { DEFAULT_CASE_ID } from '../case/cases';

// One demo session, held in server memory. globalThis keeps it stable across Next
// dev-mode module reloads (custom server = one process).

const initial = (caseId = DEFAULT_CASE_ID): SessionState => ({
  caseId,
  phase: 'case-ready',
  transcript: [],
  contributions: [],
  differential: [],
  workup: [],
  notepad: [],
  createdResources: [],
});

type AudioSink = (buf: Buffer) => void;
type ChangeListener = () => void;

interface Store {
  state: SessionState;
  audioSinks: Set<AudioSink>;
  changeListeners: Set<ChangeListener>;
  version: number;
}

const g = globalThis as any;
if (!g.__housemd) {
  g.__housemd = {
    state: initial(),
    audioSinks: new Set(),
    changeListeners: new Set(),
    version: 0,
  } satisfies Store;
}
const store: Store = g.__housemd;
// Older module instances (dev reload) may predate changeListeners.
if (!store.changeListeners) store.changeListeners = new Set();

export const getState = (): SessionState & { version: number } => ({ ...store.state, version: store.version });

export function mutate(fn: (s: SessionState) => void): void {
  fn(store.state);
  store.version++;
  for (const listener of store.changeListeners) {
    try {
      listener();
    } catch {
      store.changeListeners.delete(listener);
    }
  }
}

/** SSE subscribers: called on every state change so the room repaints on the event,
 *  not on a poll tick. Returns an unsubscribe. */
export function onChange(fn: ChangeListener): () => void {
  store.changeListeners.add(fn);
  return () => store.changeListeners.delete(fn);
}

export function resetSession(caseId?: string): void {
  store.state = initial(caseId ?? store.state.caseId);
  store.version++;
  for (const listener of store.changeListeners) {
    try {
      listener();
    } catch {
      store.changeListeners.delete(listener);
    }
  }
}

// ---- notepad ----
// One append point so every note carries its citations and lands in conversation
// order. `dedupeKey` lets a re-submitted claim replace its earlier line instead of
// stacking a near-duplicate — the pad is minutes, not a log file.

let noteSeq = 0;

export function note(
  s: SessionState,
  entry: {
    kind: NoteKind;
    text: string;
    detail?: string;
    speaker?: string;
    personaId?: string;
    cites?: EvidenceRef[];
    provenance?: 'cited' | 'conjecture';
    priority?: 'now' | 'next' | 'later';
    dedupeKey?: string;
  }
): void {
  const id = entry.dedupeKey || `n${++noteSeq}`;
  const next: NoteEntry = {
    id,
    kind: entry.kind,
    text: entry.text.slice(0, 300),
    detail: entry.detail?.slice(0, 300),
    speaker: entry.speaker,
    personaId: entry.personaId,
    cites: entry.cites || [],
    provenance: entry.provenance,
    priority: entry.priority,
    at: Date.now(),
  };
  const existing = s.notepad.findIndex((n) => n.id === id);
  if (existing >= 0) s.notepad[existing] = { ...next, at: s.notepad[existing].at };
  else s.notepad.push(next);
}

export const addAudioSink = (fn: AudioSink) => store.audioSinks.add(fn);
export const removeAudioSink = (fn: AudioSink) => store.audioSinks.delete(fn);
export function pushAudio(buf: Buffer): void {
  for (const sink of store.audioSinks) {
    try {
      sink(buf);
    } catch {
      store.audioSinks.delete(sink);
    }
  }
}
