import { NextResponse } from 'next/server';
import { finalizeSession } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    return NextResponse.json(await finalizeSession(body.id ?? 'demo-session'));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
