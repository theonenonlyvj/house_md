import { NextResponse } from 'next/server';
import { applyCouncilUpdate, applyWorkup, councilContext } from '@/server/session-store';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: string; action: string; payload?: any };
    const id = body.id ?? 'demo-session';
    if (body.action === 'consult_council') return NextResponse.json(councilContext(id, body.payload?.specialty_ids ?? []));
    if (body.action === 'update_differential') return NextResponse.json(applyCouncilUpdate(id, body.payload));
    if (body.action === 'propose_workup') return NextResponse.json(applyWorkup(id, body.payload?.items ?? []));
    return NextResponse.json({ error: `Unknown agent action ${body.action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
