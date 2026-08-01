// POST /api/finalize — the chart remembers (PLAN-FINAL §2 Act 4).
// One R4 ClinicalImpression + one draft/proposal ServiceRequest per selected option,
// written to hosted Medplum idempotently via If-None-Exist (identifier slugs).
// Shapes come from the pure buildFinalizeResources() so they are unit-tested offline.

import { buildFinalizeResources, type SessionSummary } from '@/server-lib/finalize-shapes';
import { fhirCreate } from '@/server-lib/medplum';
import type { CreatedResource } from '@/shared/types';

function validate(body: unknown): SessionSummary | null {
  const s = (body as { sessionSummary?: SessionSummary } | null)?.sessionSummary;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.patientId !== 'string' || !s.patientId) return null;
  if (typeof s.leadingDx !== 'string' || !s.leadingDx) return null;
  if (typeof s.patientPlanText !== 'string' || !s.patientPlanText) return null;
  if (!Array.isArray(s.differential) || !Array.isArray(s.selectedOptions)) return null;
  return s;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON: { sessionSummary }' }, { status: 400 });
  }
  const summary = validate(body);
  if (!summary) {
    return Response.json(
      { error: 'sessionSummary requires patientId, leadingDx, differential, selectedOptions, patientPlanText' },
      { status: 400 },
    );
  }

  try {
    const created: CreatedResource[] = [];
    for (const planned of buildFinalizeResources(summary)) {
      const result = (await fhirCreate(planned.resource, planned.ifNoneExist)) as {
        resourceType: string;
        id?: string;
      };
      created.push({
        resourceType: result.resourceType,
        id: result.id ?? '',
        display: planned.display,
      });
    }
    return Response.json({ created });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'FHIR write-back failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
