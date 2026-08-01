// Offline tests for the Stedi 271 parser + error branch (fixtures allowed in tests only,
// PLAN-FINAL §5). Fixture rows are trimmed verbatim from stedi-poc/resp_uhc.json.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  StediEligibilityError,
  assertNoPayerErrors,
  parseBenefitFacts,
  runEligibility,
} from './stedi';

vi.mock('./env', () => ({ key: () => 'test-key-never-real', envKeys: () => ({}) }));

// ---------- Fixtures (uhc-shaped, values from the saved real mock response) ----------

const uhcFixture = {
  payer: { name: 'UNITEDHEALTHCARE' },
  planStatus: [
    { statusCode: '1', status: 'Active Coverage', planDetails: 'Gold Plan HMO', serviceTypeCodes: ['30'] },
  ],
  benefitsInformation: [
    // Plan-level active row carrying the payer's referral message verbatim.
    {
      code: '1',
      name: 'Active Coverage',
      serviceTypeCodes: ['30'],
      inPlanNetworkIndicatorCode: 'W',
      additionalInformation: [{ description: 'PCP TO SUBMIT A SPECIALIST REFERRAL' }],
    },
    // Deductible — in-network individual Remaining → $0.
    {
      code: 'C',
      name: 'Deductible',
      serviceTypeCodes: ['30'],
      benefitAmount: '0',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevel: 'Individual',
      coverageLevelCode: 'IND',
      timeQualifier: 'Remaining',
      timeQualifierCode: '29',
    },
    // OOP decoys: family remaining and individual calendar-year must NOT win.
    {
      code: 'G',
      name: 'Out of Pocket (Stop Loss)',
      serviceTypeCodes: ['30'],
      benefitAmount: '2200',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevelCode: 'FAM',
      timeQualifier: 'Remaining',
      timeQualifierCode: '29',
    },
    {
      code: 'G',
      name: 'Out of Pocket (Stop Loss)',
      serviceTypeCodes: ['30'],
      benefitAmount: '1500',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevelCode: 'IND',
      timeQualifier: 'Calendar Year',
      timeQualifierCode: '23',
    },
    // OOP — in-network individual Remaining → $850.
    {
      code: 'G',
      name: 'Out of Pocket (Stop Loss)',
      serviceTypeCodes: ['30'],
      benefitAmount: '850',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevelCode: 'IND',
      timeQualifier: 'Remaining',
      timeQualifierCode: '29',
    },
    // Copay — the service-specific $15 in-network SPECIALIST visit row (the headline fact).
    {
      code: 'B',
      name: 'Co-Payment',
      serviceTypeCodes: ['96'],
      benefitAmount: '15',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevelCode: 'IND',
      timeQualifier: 'Visit',
      timeQualifierCode: '27',
      additionalInformation: [{ description: 'SPECIALIST' }],
    },
    // Copay decoy: SPECIALIST + OUTPATIENT MATERNITY $0 must not beat the plain row.
    {
      code: 'B',
      name: 'Co-Payment',
      serviceTypeCodes: ['96'],
      benefitAmount: '0',
      inPlanNetworkIndicatorCode: 'Y',
      coverageLevelCode: 'IND',
      timeQualifier: 'Visit',
      timeQualifierCode: '27',
      additionalInformation: [{ description: 'SPECIALIST' }, { description: 'OUTPATIENT MATERNITY' }],
    },
  ],
  errors: [],
};

const inactiveFixture = {
  payer: { name: 'UNITEDHEALTHCARE' },
  planStatus: [{ statusCode: '6', status: 'Inactive', serviceTypeCodes: ['30'] }],
  benefitsInformation: [{ code: '6', name: 'Inactive', serviceTypeCodes: ['30'] }],
  errors: [],
};

// AAA rejection — arrives with HTTP 200 (stedi-poc README, verified live).
const aaaFixture = {
  payer: { name: 'UNITEDHEALTHCARE' },
  subscriber: {
    memberId: 'UHCAAA75',
    aaaErrors: [
      {
        code: '75',
        description: 'Subscriber/Insured Not Found',
        followupAction: 'Please Correct and Resubmit',
        possibleResolutions: 'Confirm the member ID and resubmit',
      },
    ],
  },
  errors: [],
};

const topLevelErrorFixture = {
  errors: [{ code: '42', description: 'Unable to respond at current time' }],
};

const expectedUhcFacts = {
  payer: 'UNITEDHEALTHCARE',
  planActive: true,
  copay: '$15',
  deductibleRemaining: '$0',
  oopRemaining: '$850',
  network: 'in-network',
  messages: ['PCP TO SUBMIT A SPECIALIST REFERRAL'],
  matched: true,
};

const okFetch = (payload: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as unknown as Response);

afterEach(() => vi.unstubAllGlobals());

// ---------- Parsing ----------

describe('parseBenefitFacts', () => {
  it('projects the uhc 271 into the exact BenefitFacts the plan asserts (§4.2)', () => {
    expect(parseBenefitFacts(uhcFixture)).toEqual(expectedUhcFacts);
  });

  it('marks the inactive plan inactive with no invented amounts', () => {
    const facts = parseBenefitFacts(inactiveFixture);
    expect(facts.planActive).toBe(false);
    expect(facts.matched).toBe(false); // UI must say "no benefit information returned"
    expect(facts.copay).toBeUndefined();
    expect(facts.deductibleRemaining).toBeUndefined();
    expect(facts.oopRemaining).toBeUndefined();
  });
});

// ---------- Error branch: rejections arrive HTTP 200 ----------

describe('assertNoPayerErrors', () => {
  it('accepts the clean uhc response', () => {
    expect(() => assertNoPayerErrors(uhcFixture)).not.toThrow();
  });

  it('throws a typed error on subscriber.aaaErrors', () => {
    let caught: unknown;
    try {
      assertNoPayerErrors(aaaFixture);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StediEligibilityError);
    const e = caught as StediEligibilityError;
    expect(e.kind).toBe('aaa');
    expect(e.message).toContain('75');
    expect(e.message).toContain('Subscriber/Insured Not Found');
    expect(e.details).toHaveLength(1);
  });

  it('throws a typed error on top-level errors[]', () => {
    expect(() => assertNoPayerErrors(topLevelErrorFixture)).toThrowError(StediEligibilityError);
    try {
      assertNoPayerErrors(topLevelErrorFixture);
    } catch (err) {
      expect((err as StediEligibilityError).kind).toBe('payer-error');
    }
  });
});

// ---------- Full adapter with stubbed fetch (offline) ----------

describe('runEligibility', () => {
  it('returns facts + raw for a clean 271', async () => {
    vi.stubGlobal('fetch', okFetch(uhcFixture));
    const { facts, raw } = await runEligibility('uhc');
    expect(facts).toEqual(expectedUhcFacts);
    expect(raw).toEqual(uhcFixture);
  });

  it('REJECTS an aaaErrors payload even though HTTP status is 200', async () => {
    vi.stubGlobal('fetch', okFetch(aaaFixture));
    await expect(runEligibility('uhc')).rejects.toBeInstanceOf(StediEligibilityError);
    await expect(runEligibility('uhc')).rejects.toMatchObject({ kind: 'aaa' });
  });

  it('rejects unknown scenario keys without calling the network', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    await expect(runEligibility('nope')).rejects.toMatchObject({ kind: 'config' });
    expect(spy).not.toHaveBeenCalled();
  });
});
