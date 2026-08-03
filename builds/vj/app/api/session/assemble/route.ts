import { NextResponse } from 'next/server';
import { assemble } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

// Convening loads the record and opens the room. It does NOT seat the panel — the
// chair asks for the case first, and the panel is seated from the chart plus what
// the clinician actually says. `caseId` picks which seeded patient to convene on.
export async function POST(req: Request) {
  let caseId: string | undefined;
  try {
    const body = (await req.json()) as { caseId?: unknown };
    if (typeof body?.caseId === 'string' && body.caseId) caseId = body.caseId;
  } catch {
    // empty body → keep the session's current case
  }
  await assemble(caseId);
  return NextResponse.json({ ok: true });
}
