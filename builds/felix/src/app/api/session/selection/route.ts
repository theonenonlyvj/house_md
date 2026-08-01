import { NextResponse } from 'next/server';
import { selectHypothesis, selectWorkup } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; type: 'hypothesis' | 'workup'; itemId: string; selected?: boolean };
    const id = body.id ?? 'demo-session';
    return NextResponse.json(body.type === 'hypothesis' ? selectHypothesis(id, body.itemId) : selectWorkup(id, body.itemId, body.selected ?? true));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
