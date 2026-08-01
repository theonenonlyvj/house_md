import { describe, expect, it } from 'vitest';
import { projectWorkup } from './coverage';

describe('coverage projection', () => {
  it('re-sequences a referral-gated consult and attaches only supported facts', () => {
    const items = [
      { id: 'screen', label: 'Screen', rationale: 'First', kind: 'lab' as const, sequence: 1, selected: true, benefits: [] },
      { id: 'consult', label: 'Cardiology', rationale: 'Then', kind: 'consult' as const, sequence: 2, selected: true, benefits: [] },
    ];
    const workup = projectWorkup(items, { status: 'active', payer: 'UHC', checkedAt: new Date().toISOString(), referralRequired: true, message: 'PCP TO SUBMIT A SPECIALIST REFERRAL', specialistCopay: 15 });
    const consult = workup.find((item) => item.id === 'consult')!;
    expect(consult.referralGate).toBe(true);
    expect(consult.benefits.map((fact) => fact.value)).toContain('$15');
    expect(consult.sequence).toBeGreaterThan(workup.find((item) => item.id === 'screen')!.sequence);
  });
});
