import { NextResponse } from 'next/server';
import { resetSession } from '../../../../src/server-lib/session';
import { closeAgent } from '../../../../src/server-lib/council';
import { resetChartCache } from '../../../../src/server-lib/chart';

export const dynamic = 'force-dynamic';

export async function POST() {
  closeAgent();
  resetChartCache();
  resetSession();
  return NextResponse.json({ ok: true });
}
