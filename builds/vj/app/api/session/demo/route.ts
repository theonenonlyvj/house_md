import { NextResponse } from 'next/server';
import { runDemoScript } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

export async function POST() {
  await runDemoScript();
  return NextResponse.json({ ok: true });
}
