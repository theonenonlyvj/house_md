import type { SessionState } from '@/domain/types';

export interface SpecialistLine {
  personaId: string;
  speaker: string;
  text: string;
}

export function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionState>;
  return typeof candidate.id === 'string'
    && typeof candidate.status === 'string'
    && Boolean(candidate.integrations && typeof candidate.integrations === 'object')
    && Array.isArray(candidate.seats)
    && Array.isArray(candidate.contributions)
    && Array.isArray(candidate.differential)
    && Array.isArray(candidate.workup);
}

export function specialistLinesFor(action: string, value: unknown): SpecialistLine[] {
  if (action !== 'update_differential' || !isSessionState(value)) return [];
  const audible = new Map(
    value.seats
      .filter((seat) => seat.kind === 'specialist' && seat.persona)
      .map((seat) => [seat.persona!.id, seat.label]),
  );
  return value.contributions
    .flatMap((item) => {
      const speaker = audible.get(item.personaId);
      const text = item.leadingInterpretation.text.trim();
      return speaker && text ? [{ personaId: item.personaId, speaker, text }] : [];
    })
    .slice(0, 2);
}
