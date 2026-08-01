import { describe, expect, it } from 'vitest';
import { validateClaim } from './citations';

const evidence = [{ alias: 'E1', resourceId: 'Observation/abc', resourceType: 'Observation', title: 'Finding', summary: 'Finding' }];

describe('citation validator', () => {
  it('resolves aliases to record references', () => expect(validateClaim({ text: 'Supported', citations: ['e1'] }, evidence).grounding).toBe('record-cited'));
  it('demotes invalid aliases to conjecture', () => expect(validateClaim({ text: 'Unsupported', citations: ['E9'] }, evidence).grounding).toBe('conjecture'));
  it('preserves explicitly general reasoning', () => expect(validateClaim({ text: 'General', generalReasoning: true }, evidence).grounding).toBe('general-reasoning'));
});
