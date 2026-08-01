import { NextResponse } from 'next/server';
import { assembleSession } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; presentation?: string };
    if (!body.presentation?.trim()) return NextResponse.json({ error: 'A live Deepgram transcript is required before assembling the council.' }, { status: 400 });
    return NextResponse.json(assembleSession(body.id ?? 'demo-session', body.presentation.trim()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
