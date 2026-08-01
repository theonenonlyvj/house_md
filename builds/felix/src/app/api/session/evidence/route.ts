import { NextResponse } from 'next/server';
import { searchSessionEvidence } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; query?: string };
    if (!body.query?.trim()) return NextResponse.json({ error: 'Evidence query is required.' }, { status: 400 });
    return NextResponse.json(await searchSessionEvidence(body.id ?? 'demo-session', body.query.trim()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
