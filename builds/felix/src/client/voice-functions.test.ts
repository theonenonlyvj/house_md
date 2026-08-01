import { describe, expect, it } from 'vitest';
import { isSessionState, specialistLinesFor } from './voice-functions';
import type { SessionState } from '@/domain/types';

const claim = { text: 'Amyloid pattern is plausible.', citations: ['E1'], resolvedResourceIds: ['DiagnosticReport/1'], grounding: 'record-cited' as const };
const state = {
  id: 'demo-session',
  status: 'debating',
  integrations: {},
  seats: [
    { id: 'chair', label: 'House, M.D.', specialty: 'chair', kind: 'chair', reason: '', persona: { id: 'house' } },
    { id: 'skeptic', label: 'Dr. Rowan Vale', specialty: 'skeptic', kind: 'specialist', reason: '', persona: { id: 'skeptic', name: 'Dr. Rowan Vale' } },
    { id: 'cardiology', label: 'Dr. Sofia Reyes', specialty: 'cardiology', kind: 'specialist', reason: '', persona: { id: 'cardiology' } },
    { id: 'neurology', label: 'Dr. Micah Okafor', specialty: 'neurology', kind: 'specialist', reason: '', persona: { id: 'neurology' } },
  ],
  contributions: [
    { id: 'chair', personaId: 'house', leadingInterpretation: claim },
    { id: 'cardiology', personaId: 'Cardiology', leadingInterpretation: claim },
    { id: 'neurology', personaId: 'neurology', leadingInterpretation: { ...claim, text: 'Neuropathy broadens the pattern.' } },
    { id: 'skeptic', personaId: 'Dr. Rowan Vale', leadingInterpretation: { ...claim, text: 'Hypertension remains a credible alternative.' } },
  ],
  differential: [],
  workup: [],
} as unknown as SessionState;

describe('voice function response routing', () => {
  it('does not mistake consult context for renderable session state', () => {
    expect(isSessionState({ personas: [], evidence: [], emptySeats: [] })).toBe(false);
    expect(specialistLinesFor('consult_council', { personas: [] })).toEqual([]);
  });

  it('queues at most two seated specialists and excludes the chair', () => {
    expect(isSessionState(state)).toBe(true);
    expect(specialistLinesFor('update_differential', state)).toEqual([
      { personaId: 'cardiology', speaker: 'Dr. Sofia Reyes', text: 'Amyloid pattern is plausible.' },
      { personaId: 'skeptic', speaker: 'Dr. Rowan Vale', text: 'Hypertension remains a credible alternative.' },
    ]);
  });
});
