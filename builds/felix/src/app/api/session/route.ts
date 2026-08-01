import { NextResponse } from 'next/server';
import { getSession, initializeSession } from '@/server/session-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? 'demo-session';
  const state = await initializeSession(id);
  return NextResponse.json(state, { status: state.error ? 503 : 200 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as { id?: string };
  return NextResponse.json(getSession(body.id).state);
}
