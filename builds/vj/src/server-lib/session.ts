import type { SessionState } from '../shared/types';

// One demo session, held in server memory. globalThis keeps it stable across Next
// dev-mode module reloads (custom server = one process).

const initial = (): SessionState => ({
  phase: 'case-ready',
  transcript: [],
  contributions: [],
  differential: [],
  workup: [],
  createdResources: [],
});

type AudioSink = (buf: Buffer) => void;

interface Store {
  state: SessionState;
  audioSinks: Set<AudioSink>;
  version: number;
}

const g = globalThis as any;
if (!g.__housemd) {
  g.__housemd = { state: initial(), audioSinks: new Set(), version: 0 } satisfies Store;
}
const store: Store = g.__housemd;

export const getState = (): SessionState & { version: number } => ({ ...store.state, version: store.version });

export function mutate(fn: (s: SessionState) => void): void {
  fn(store.state);
  store.version++;
}

export function resetSession(): void {
  store.state = initial();
  store.version++;
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
