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
  const seats = value.seats.filter((seat) => seat.kind === 'specialist' && seat.persona);
  const normalize = (text?: string) => (text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const resolve = (personaId: string) => {
    const needle = normalize(personaId);
    return seats.find((seat) => [seat.persona!.id, seat.persona!.name, seat.label, seat.specialty].some((candidate) => normalize(candidate) === needle))
      ?? seats.find((seat) => needle.includes(normalize(seat.specialty)) || normalize(seat.specialty).includes(needle));
  };
  const candidates = value.contributions.flatMap((item) => {
    const seat = resolve(item.personaId);
    const text = item.leadingInterpretation.text.trim();
    return seat?.persona && text ? [{ item, seat, line: { personaId: seat.persona.id, speaker: seat.label, text } }] : [];
  });
  const cited = candidates.find(({ item, seat }) => item.leadingInterpretation.grounding === 'record-cited' && seat.specialty !== 'skeptic');
  const skeptic = candidates.find(({ seat }) => seat.specialty === 'skeptic');
  const ordered = [cited, skeptic, ...candidates].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const heard = new Set<string>();
  return ordered.flatMap(({ line }) => heard.has(line.personaId) ? [] : (heard.add(line.personaId), [line])).slice(0, 2);
}
