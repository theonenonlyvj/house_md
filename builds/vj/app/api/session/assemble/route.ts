import { NextResponse } from 'next/server';
import { assemble } from '../../../../src/server-lib/council';
import { DEFAULT_CASE } from '../../../../src/case/default-case';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const presentation = String(body.presentation || DEFAULT_CASE.presentation);
  await assemble(presentation);
  return NextResponse.json({ ok: true });
}
