import { NextResponse } from 'next/server';
import { resetSession } from '../../../../src/server-lib/session';
import { closeAgent } from '../../../../src/server-lib/council';
import { resetChartCache } from '../../../../src/server-lib/chart';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let caseId: string | undefined;
  try {
    const body = (await req.json()) as { caseId?: unknown };
    if (typeof body?.caseId === 'string' && body.caseId) caseId = body.caseId;
  } catch {
    // empty body → reset onto the same case
  }
  closeAgent();
  resetChartCache();
  resetSession(caseId);
  return NextResponse.json({ ok: true });
}
