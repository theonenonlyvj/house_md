import { NextResponse } from 'next/server';
import { getState } from '../../../src/server-lib/session';
import { board } from '../../../src/server-lib/whiteboard';

export const dynamic = 'force-dynamic';

// GET /api/whiteboard?w=…&h=… → the current evidence board, drawn for that exact size.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clamp = (v: string | null, d: number) => Math.min(4096, Math.max(320, Math.round(Number(v) || d)));
  const w = clamp(url.searchParams.get('w'), 1000);
  const h = clamp(url.searchParams.get('h'), 700);
  const { version, ...state } = getState();
  try {
    return NextResponse.json({ version, svg: await board(state, version, w, h) });
  } catch (e) {
    return NextResponse.json({ version, error: (e as Error).message }, { status: 502 });
  }
}
