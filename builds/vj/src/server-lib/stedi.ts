// Stedi eligibility adapter — coverage lane (PLAN-FINAL §2 Act 3, §4.2, §6 Stedi bullet).
// Lifted from stedi-poc/server.mjs restCheck(); request bodies inlined verbatim from
// stedi-poc/scenarios.mjs. CRITICAL: payer rejections (aaaErrors / errors[]) arrive as
// HTTP 200 — they are detected and thrown as StediEligibilityError so the UI shows the
// designed visible-failure state with retry. An error payload is NEVER parsed as benefits.

import { key } from './env';
import type { BenefitFacts } from '../shared/types';

const ELIGIBILITY_URL =
  'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3';
const TIMEOUT_MS = 20_000;

export type StediErrorKind =
  | 'config' // bad scenario key / missing API key
  | 'network' // fetch failure or 20s timeout
  | 'http' // non-2xx from Stedi
  | 'bad-response' // 200 but unusable body
  | 'aaa' // subscriber/dependent aaaErrors[] (arrives HTTP 200)
  | 'payer-error'; // top-level errors[] (arrives HTTP 200)

export class StediEligibilityError extends Error {
  readonly kind: StediErrorKind;
  readonly details: string[];
  constructor(kind: StediErrorKind, message: string, details: string[] = []) {
    super(message);
    this.name = 'StediEligibilityError';
    this.kind = kind;
    this.details = details;
  }
}

// ---------- Known-good request bodies (verbatim from stedi-poc/scenarios.mjs) ----------

const PROVIDER = { organizationName: 'Provider Name', npi: '1999999984' };
const MED = { serviceTypeCodes: ['30'] };

const SCENARIOS: Record<string, unknown> = {
  // Richest response: "Gold Plan HMO", 30+ benefit rows incl. $15 specialist copay.
  uhc: {
    tradingPartnerServiceId: '87726',
    provider: PROVIDER,
    subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19710101', memberId: 'UHC123456' },
    encounter: MED,
  },
  // planStatus 6 (Inactive) — the "not covered" contrast.
  'uhc-inactive': {
    tradingPartnerServiceId: '87726',
    provider: PROVIDER,
    subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19710101', memberId: 'UHCINACTIVE' },
    encounter: MED,
  },
  // AAA 75 "Subscriber not found" — drives the visible-failure + retry state in dev.
  uhcaaa75: {
    tradingPartnerServiceId: '87726',
    provider: { organizationName: 'Medical Provider', npi: '1999999984' },
    subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19900101', memberId: 'UHCAAA75' },
    encounter: MED,
  },
};

// ---------- 271 response shape (only the fields we consume; all optional) ----------

interface AaaError {
  code?: string;
  description?: string;
  followupAction?: string;
  possibleResolutions?: string;
}

interface BenefitRow {
  code?: string;
  name?: string;
  benefitAmount?: string;
  benefitPercent?: string;
  serviceTypeCodes?: string[];
  inPlanNetworkIndicatorCode?: string; // 'Y' | 'N' | 'W'
  coverageLevel?: string;
  coverageLevelCode?: string; // 'IND' | 'FAM'
  timeQualifier?: string; // 'Remaining' | 'Calendar Year' | 'Visit' | ...
  timeQualifierCode?: string; // '29' = Remaining, '27' = Visit
  additionalInformation?: { description?: string }[];
}

interface Response271 {
  payer?: { name?: string };
  planStatus?: { statusCode?: string; status?: string; serviceTypeCodes?: string[] }[];
  benefitsInformation?: BenefitRow[];
  subscriber?: { aaaErrors?: AaaError[] };
  dependents?: { aaaErrors?: AaaError[] }[];
  errors?: { code?: string; description?: string; message?: string }[];
}

// ---------- Error branch: aaaErrors / errors[] arrive with HTTP 200 ----------

function fmtAaa(e: AaaError): string {
  const parts = [e.code && `AAA ${e.code}`, e.description, e.followupAction].filter(Boolean);
  return parts.join(' — ') || 'unspecified payer rejection';
}

/** Throws StediEligibilityError if the (HTTP 200) 271 payload is actually a rejection. */
export function assertNoPayerErrors(data: unknown): asserts data is Response271 {
  const d = (data ?? {}) as Response271;
  const aaa: AaaError[] = [
    ...(d.subscriber?.aaaErrors ?? []),
    ...(d.dependents ?? []).flatMap((dep) => dep.aaaErrors ?? []),
  ];
  if (aaa.length > 0) {
    throw new StediEligibilityError(
      'aaa',
      `Payer rejected the eligibility check: ${aaa.map(fmtAaa).join('; ')}`,
      aaa.map(fmtAaa),
    );
  }
  const errs = d.errors ?? [];
  if (errs.length > 0) {
    const details = errs.map((e) => e.description || e.message || e.code || 'unknown error');
    throw new StediEligibilityError(
      'payer-error',
      `Eligibility response contained errors: ${details.join('; ')}`,
      details,
    );
  }
  if (!(d.planStatus?.length || d.benefitsInformation?.length)) {
    throw new StediEligibilityError(
      'bad-response',
      'Eligibility response contained no plan status or benefit rows',
    );
  }
}

// ---------- 271 → BenefitFacts (codes per stedi-poc/README: 1/6 status, B/C/G amounts) ----------

const dollars = (amount: string): string => `$${amount.replace(/\.00$/, '')}`;

function rowDescriptions(r: BenefitRow): string[] {
  return (r.additionalInformation ?? [])
    .map((a) => a.description ?? '')
    .filter((s) => s.length > 0);
}

/** Pick the best row for a benefit code: prefer in-network, individual, then row-specific hints. */
function pickRow(
  rows: BenefitRow[],
  code: string,
  opts: { preferRemaining?: boolean; preferSpecialist?: boolean } = {},
): BenefitRow | undefined {
  const cands = rows.filter(
    (r) => r.code === code && typeof r.benefitAmount === 'string' && r.benefitAmount !== '',
  );
  const score = (r: BenefitRow): number => {
    let s = 0;
    if (r.inPlanNetworkIndicatorCode === 'Y') s += 4;
    if (r.coverageLevelCode === 'IND') s += 2;
    if (opts.preferRemaining && (r.timeQualifierCode === '29' || r.timeQualifier === 'Remaining')) s += 8;
    if (opts.preferSpecialist) {
      const descs = rowDescriptions(r).map((d) => d.toUpperCase());
      if (descs.some((d) => d.includes('SPECIALIST'))) s += 8;
      s -= Math.max(0, descs.length - 1); // plain SPECIALIST row beats SPECIALIST+MATERNITY etc.
    }
    return s;
  };
  return [...cands].sort((a, b) => score(b) - score(a))[0];
}

/** Pure 271→BenefitFacts projection. Call assertNoPayerErrors() first. */
export function parseBenefitFacts(data: Response271): BenefitFacts {
  const rows = data.benefitsInformation ?? [];

  // Plan status: prefer the plan-level (service type 30) row; fall back to any status row,
  // then to active/inactive coverage rows in benefitsInformation.
  const statuses = data.planStatus ?? [];
  const planRow =
    statuses.find((s) => (s.serviceTypeCodes ?? []).includes('30')) ?? statuses[0];
  let planActive: boolean | undefined;
  if (planRow?.statusCode === '1') planActive = true;
  else if (planRow?.statusCode === '6') planActive = false;
  else if (rows.some((r) => r.code === '1')) planActive = true;
  else if (rows.some((r) => r.code === '6')) planActive = false;

  // B = Co-Payment (service-specific: the $15 in-network SPECIALIST visit row),
  // C = Deductible, G = Out of Pocket — prefer in-network / individual / Remaining.
  const copayRow = pickRow(rows, 'B', { preferSpecialist: true });
  const deductibleRow = pickRow(rows, 'C', { preferRemaining: true });
  const oopRow = pickRow(rows, 'G', { preferRemaining: true });

  // Payer messages verbatim, from plan-level coverage rows (e.g. the referral requirement).
  const messages: string[] = [];
  for (const r of rows) {
    if ((r.code === '1' || r.code === '6') && (r.serviceTypeCodes ?? []).includes('30')) {
      for (const d of rowDescriptions(r)) if (!messages.includes(d)) messages.push(d);
    }
  }

  const networkCode =
    copayRow?.inPlanNetworkIndicatorCode ??
    deductibleRow?.inPlanNetworkIndicatorCode ??
    oopRow?.inPlanNetworkIndicatorCode;
  const network =
    networkCode === 'Y' ? 'in-network' : networkCode === 'N' ? 'out-of-network' : undefined;

  // matched = a service-specific row actually supported the headline fact (never inferred).
  const matched =
    !!copayRow &&
    ((copayRow.serviceTypeCodes ?? []).some((c) => c !== '30') ||
      rowDescriptions(copayRow).length > 0);

  return {
    payer: data.payer?.name ?? 'Unknown payer',
    ...(planActive !== undefined ? { planActive } : {}),
    ...(copayRow?.benefitAmount ? { copay: dollars(copayRow.benefitAmount) } : {}),
    ...(deductibleRow?.benefitAmount
      ? { deductibleRemaining: dollars(deductibleRow.benefitAmount) }
      : {}),
    ...(oopRow?.benefitAmount ? { oopRemaining: dollars(oopRow.benefitAmount) } : {}),
    ...(network ? { network } : {}),
    messages,
    matched,
  };
}

// ---------- Live call (restCheck lift: Key auth header, 20s AbortSignal) ----------

export async function runEligibility(
  scenarioKey: string,
): Promise<{ facts: BenefitFacts; raw: unknown }> {
  const request = SCENARIOS[scenarioKey];
  if (!request) {
    throw new StediEligibilityError('config', `Unknown eligibility scenario "${scenarioKey}"`);
  }
  const apiKey = key('STEDI_TEST_API_KEY');
  if (!apiKey) {
    throw new StediEligibilityError('config', 'STEDI_TEST_API_KEY missing from .env');
  }

  let res: Response;
  try {
    res = await fetch(ELIGIBILITY_URL, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err instanceof Error ? err : new Error(String(err));
    const msg =
      cause.name === 'TimeoutError'
        ? `Stedi eligibility call timed out after ${TIMEOUT_MS / 1000}s`
        : `Stedi eligibility call failed: ${cause.message}`;
    throw new StediEligibilityError('network', msg);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StediEligibilityError(
      'http',
      `Stedi returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new StediEligibilityError('bad-response', 'Stedi returned a non-JSON body');
  }

  assertNoPayerErrors(data); // rejections arrive HTTP 200 — never render them as benefits
  return { facts: parseBenefitFacts(data), raw: data };
}
