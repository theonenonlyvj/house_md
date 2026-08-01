import type { AgentSettingsObject } from '@deepgram/agents';

const claim = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    citations: { type: 'array', items: { type: 'string' } },
    generalReasoning: { type: 'boolean' },
  },
  required: ['text'],
};

const functions = [
  {
    name: 'search_patient_evidence',
    description: 'Search the current patient’s Moss index. Call this before making patient-specific claims.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'consult_council',
    description: 'Return seated persona instructions, empty seats, and evidence aliases. Use only aliases E1, E2, etc. in citations.',
    parameters: { type: 'object', properties: { specialty_ids: { type: 'array', items: { type: 'string' } } }, required: ['specialty_ids'] },
  },
  {
    name: 'update_differential',
    description: 'Persist structured specialist contributions and the newly ranked differential. Every patient-specific claim needs evidence aliases; use generalReasoning true only for general medical reasoning.',
    parameters: {
      type: 'object',
      properties: {
        contributions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              personaId: { type: 'string' },
              challenged: { type: 'boolean' },
              leadingInterpretation: claim,
              strongestSupport: claim,
              contradiction: claim,
              discriminatingStep: claim,
            },
            required: ['personaId', 'leadingInterpretation', 'strongestSupport', 'contradiction', 'discriminatingStep'],
          },
        },
        differential: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              rank: { type: 'number' },
              confidence: { type: 'string', enum: ['leading', 'considering', 'lower'] },
              movement: { type: 'string', enum: ['up', 'down', 'new', 'same'] },
              rationale: claim,
            },
            required: ['id', 'label', 'rank', 'confidence', 'movement', 'rationale'],
          },
        },
      },
      required: ['contributions', 'differential'],
    },
  },
  {
    name: 'propose_workup',
    description: 'Persist the workup derived from the current differential. Put light-chain screening before any ATTR-directed scintigraphy. Do not invent billing or terminology codes.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              rationale: { type: 'string' },
              kind: { type: 'string', enum: ['lab', 'consult', 'imaging', 'other'] },
              sequence: { type: 'number' },
              selected: { type: 'boolean' },
              dependsOn: { type: 'array', items: { type: 'string' } },
            },
            required: ['id', 'label', 'rationale', 'kind', 'sequence'],
          },
        },
      },
      required: ['items'],
    },
  },
];

const prompt = `You are House, M.D., chair of a clinician-led differential council. This is decision support, not diagnosis; the managing clinician decides. Speak in one or two short sentences while detailed reasoning goes to tool calls.

Workflow after the clinician presents and explicitly assembles the room:
1. Call search_patient_evidence with a query derived only from their words.
2. Call consult_council with relevant seated specialties.
3. Independently create each specialist’s contribution in the required shape, then call update_differential. Cite only aliases returned by consult_council. Unsupported patient claims will be demoted by the coordinator.
4. Briefly call out any empty seat. Challenge the lowest-cited or invalid claim only when warranted; never stage a quota.
5. Ask the clinician to select the leading hypothesis.
6. When redirected to planning, call propose_workup. Keep AL versus ATTR unresolved and sequence light-chain screening before PYP scintigraphy.
Never invent codes, coverage facts, record facts, or integration success. Never describe a hypothesis as confirmed.`;

export const AGENT_SETTINGS = {
  language: 'en',
  listen: {
    provider: {
      version: 'v1',
      type: 'deepgram',
      model: 'nova-3',
      keyterms: ['amyloidosis', 'immunofixation', 'proteinuria', 'carpal tunnel', 'Tc-99m-PYP'],
    },
  },
  think: {
    provider: { type: 'open_ai', model: 'gpt-4o-mini' },
    prompt,
    functions,
  },
  speak: { provider: { type: 'deepgram', model: 'aura-2-apollo-en' } },
  greeting: 'The room is ready. Present the case, then assemble the council.',
} satisfies AgentSettingsObject;
