import { NextResponse } from 'next/server';
import { resetSession } from '../../../../src/server-lib/session';
import { closeAgent } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

export async function POST() {
  closeAgent();
  resetSession();
  return NextResponse.json({ ok: true });
}
