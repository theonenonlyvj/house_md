import { NextResponse } from 'next/server';
import { applyCoverage } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    return NextResponse.json(await applyCoverage(body.id ?? 'demo-session'));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
