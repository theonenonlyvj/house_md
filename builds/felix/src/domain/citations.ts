import type { Claim, EvidenceItem } from './types';

export interface ClaimInput {
  text: string;
  citations?: string[];
  generalReasoning?: boolean;
}

export function validateClaim(input: ClaimInput, evidence: EvidenceItem[]): Claim {
  const aliasMap = new Map(evidence.map((item) => [item.alias.toUpperCase(), item.resourceId]));
  const requested = [...new Set((input.citations ?? []).map((alias) => alias.toUpperCase()))];
  const resolved = requested.flatMap((alias) => (aliasMap.has(alias) ? [aliasMap.get(alias)!] : []));
  const invalid = requested.filter((alias) => !aliasMap.has(alias));

  if (input.generalReasoning && requested.length === 0) {
    return { text: input.text, citations: [], resolvedResourceIds: [], grounding: 'general-reasoning' };
  }
  if (requested.length > 0 && invalid.length === 0) {
    return { text: input.text, citations: requested, resolvedResourceIds: resolved, grounding: 'record-cited' };
  }
  return {
    text: input.text,
    citations: requested.filter((alias) => aliasMap.has(alias)),
    resolvedResourceIds: resolved,
    grounding: 'conjecture',
    demotionReason: invalid.length ? `Citation${invalid.length > 1 ? 's' : ''} ${invalid.join(', ')} did not resolve to this patient record.` : 'No patient-record citation was supplied.',
  };
}
