import type { SessionState } from '@/domain/types';

export interface SpecialistLine {
  personaId: string;
  speaker: string;
  text: string;
}

const INTEGRATION_NAMES = ['medplum', 'deepgram', 'moss', 'stedi'] as const;
const OPERATION_STATES = new Set(['idle', 'working', 'ready', 'error']);

export function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionState>;
  const integrations = candidate.integrations;
  const hasRenderableIntegrations = Boolean(integrations && typeof integrations === 'object')
    && INTEGRATION_NAMES.every((name) => {
      const integration = integrations?.[name];
      return Boolean(integration
        && OPERATION_STATES.has(integration.state)
        && typeof integration.detail === 'string');
    });
  return typeof candidate.id === 'string'
    && typeof candidate.status === 'string'
    && hasRenderableIntegrations
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
