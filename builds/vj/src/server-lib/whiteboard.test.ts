import { describe, expect, it } from 'vitest';
import { brief, sanitize } from './whiteboard';
import type { SessionState } from '../shared/types';

describe('whiteboard', () => {
  it('strips active markup from model SVG and unwraps fences', () => {
    const out = sanitize('```svg\n<svg width="10"><script>alert(1)</script><rect onclick="x()" fill="red"/><image href="http://evil/x.png"/></svg>\n```');
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).not.toMatch(/script|onclick|evil/i);
    expect(out).toContain('fill="red"');
  });

  it('rejects a non-SVG response instead of injecting it', () => {
    expect(() => sanitize('sorry, I cannot draw that')).toThrow();
  });

  it('carries citation aliases and conjecture labels into the brief', () => {
    const s = {
      phase: 'differential-ready',
      transcript: [],
      contributions: [],
      workup: [],
      createdResources: [],
      differential: [
        {
          id: 'd1', display: 'Cardiorenal syndrome', rank: 1, assessment: 'fits volume overload', status: 'leading',
          supporting: [{ claim: 'creatinine rising', aliases: ['E1'], provenance: 'cited', resolved: [{ alias: 'E1', resourceType: 'Observation', resourceId: 'x', display: '', fact: '' }] }],
          contradicting: [{ claim: 'no prior CHF', aliases: [], provenance: 'conjecture', resolved: [] }],
        },
      ],
    } as unknown as SessionState;
    const b = brief(s);
    expect(b).toContain('DX1 Cardiorenal syndrome');
    expect(b).toContain('[E1]');
    expect(b).toContain('CONJECTURE');
  });
});
