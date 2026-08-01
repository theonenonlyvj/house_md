import { NextResponse } from 'next/server';
import { selectHypothesis } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  selectHypothesis(String(body.id || ''));
  return NextResponse.json({ ok: true });
}
