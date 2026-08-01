import type { BenefitFact, CoverageProjection, WorkupItem } from './types';

export function projectWorkup(items: WorkupItem[], coverage: CoverageProjection | null): WorkupItem[] {
  const clinicalOrder = [...items].sort((a, b) => a.sequence - b.sequence);
  const labCount = clinicalOrder.filter((item) => item.kind === 'lab').length;
  return clinicalOrder.map((item) => {
    const consultation = item.kind === 'consult';
    if (consultation && coverage?.status === 'active') {
      return {
        ...item,
        sequence: coverage.referralRequired ? Math.max(item.sequence, labCount + 1) : item.sequence,
        referralGate: coverage.referralRequired,
        benefits: [
          ...(coverage.referralRequired ? [{ label: 'Referral', value: coverage.message ?? 'PCP referral required', qualifier: 'reported' as const }] : []),
          ...(coverage.specialistCopay != null ? [{ label: 'In-network specialist copay / visit', value: `$${coverage.specialistCopay}`, qualifier: 'reported' as const }] : []),
        ],
      };
    }
    const benefits: BenefitFact[] = [{ label: 'Coverage', value: 'No matching service-specific benefit returned', qualifier: 'missing' }];
    return { ...item, benefits };
  }).sort((a, b) => a.sequence - b.sequence).map((item, index) => ({ ...item, sequence: index + 1 }));
}
