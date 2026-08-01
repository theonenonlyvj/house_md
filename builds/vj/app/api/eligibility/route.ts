// POST /api/eligibility — one live Stedi test-mode call (PLAN-FINAL §2 Act 3).
// Success: { facts: BenefitFacts, ms }. Failure: 502 { error } → the UI's designed
// visible-failure state with retry. Payer rejections arrive as HTTP 200 upstream and
// are thrown by the adapter — they land here as errors, never as benefits.

import { runEligibility, StediEligibilityError } from '@/server-lib/stedi';

export async function POST(req: Request): Promise<Response> {
  let scenario = 'uhc';
  try {
    const body = (await req.json()) as { scenario?: unknown };
    if (typeof body?.scenario === 'string' && body.scenario) scenario = body.scenario;
  } catch {
    // empty/non-JSON body → default scenario
  }

  const t0 = Date.now();
  try {
    const { facts } = await runEligibility(scenario);
    return Response.json({ facts, ms: Date.now() - t0 });
  } catch (err) {
    const message =
      err instanceof StediEligibilityError
        ? err.message
        : 'Eligibility check failed — retry to run a fresh check';
    return Response.json({ error: message }, { status: 502 });
  }
}
