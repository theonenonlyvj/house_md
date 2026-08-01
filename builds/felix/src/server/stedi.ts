import 'server-only';
import { env } from './env';
import type { CoverageProjection } from '@/domain/types';

const ELIGIBILITY_URL = 'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3';

export const UHC_REQUEST = {
  tradingPartnerServiceId: '87726',
  provider: { organizationName: 'Provider Name', npi: '1999999984' },
  subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19710101', memberId: 'UHC123456' },
  encounter: { serviceTypeCodes: ['30'] },
};

export async function checkEligibility(): Promise<{ projection: CoverageProjection; raw: unknown }> {
  const response = await fetch(ELIGIBILITY_URL, {
    method: 'POST',
    headers: { Authorization: `Key ${env('STEDI_TEST_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(UHC_REQUEST),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const raw = (await response.json()) as StediResponse;
  if (!response.ok) throw new Error(`Stedi eligibility HTTP ${response.status}`);
  const aaa = [...(raw.aaaErrors ?? []), ...(raw.subscriber?.aaaErrors ?? [])];
  if (aaa.length || raw.errors?.length) {
    const messages = [...aaa.map((item) => item.followupActionDescription ?? item.rejectReasonDescription ?? item.message), ...(raw.errors ?? []).map((item) => item.message)].filter(Boolean);
    throw new Error(`Stedi returned an eligibility error: ${messages.join('; ') || 'unknown rejection'}`);
  }

  const benefits = raw.benefitsInformation ?? [];
  const specialistCopay = findAmount(benefits, 'B', 'SPECIALIST', '27');
  const deductibleRemaining = findAmount(benefits, 'C', undefined, '29', 'IND');
  const oopRemaining = findAmount(benefits, 'G', undefined, '29', 'IND');
  const referralMessage = benefits.flatMap((row) => row.additionalInformation ?? []).map((item) => item.description ?? '').find((message) => /referral/i.test(message));
  const plan = raw.planStatus?.find((item) => item.statusCode === '1' && item.planDetails)?.planDetails;
  const active = raw.planStatus?.some((item) => item.statusCode === '1') ?? false;

  return {
    projection: {
      status: active ? 'active' : 'inactive',
      payer: raw.payer?.name ?? 'UnitedHealthcare',
      plan,
      checkedAt: new Date().toISOString(),
      traceId: raw.meta?.traceId,
      message: referralMessage,
      referralRequired: Boolean(referralMessage),
      specialistCopay,
      deductibleRemaining,
      oopRemaining,
    },
    raw,
  };
}

function findAmount(rows: BenefitRow[], code: string, description?: string, timeQualifierCode?: string, coverageLevelCode?: string): number | undefined {
  const row = rows.find((item) => item.code === code && (!timeQualifierCode || item.timeQualifierCode === timeQualifierCode) && (!coverageLevelCode || item.coverageLevelCode === coverageLevelCode) && (!description || item.additionalInformation?.some((detail) => detail.description?.toUpperCase().includes(description))));
  return row?.benefitAmount == null ? undefined : Number(row.benefitAmount);
}

interface BenefitRow {
  code?: string;
  benefitAmount?: string;
  timeQualifierCode?: string;
  coverageLevelCode?: string;
  additionalInformation?: Array<{ description?: string }>;
}

interface StediResponse {
  meta?: { traceId?: string };
  payer?: { name?: string };
  subscriber?: { aaaErrors?: StediError[] };
  aaaErrors?: StediError[];
  errors?: StediError[];
  planStatus?: Array<{ statusCode?: string; planDetails?: string }>;
  benefitsInformation?: BenefitRow[];
}

interface StediError { followupActionDescription?: string; rejectReasonDescription?: string; message?: string }
