import { NextResponse } from 'next/server';
import { assemble } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

// Convening seats the panel and opens the live session in LISTENING state — the
// clinician's actual voice presents the case; no canned presentation is injected.
export async function POST() {
  await assemble();
  return NextResponse.json({ ok: true });
}
