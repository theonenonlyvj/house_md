import { NextResponse } from 'next/server';
import { clinicianSays } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ok = clinicianSays(String(body.text || '').slice(0, 1000));
  return NextResponse.json({ ok, note: ok ? undefined : 'no live council session — assemble first' });
}
