import { NextResponse } from 'next/server';
import { PERSONAS } from '@/config/case';
import { env } from '@/server/env';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { personaId?: string; text?: string };
    const persona = PERSONAS.find((item) => item.id === body.personaId);
    if (!persona) return NextResponse.json({ error: 'Unknown council persona.' }, { status: 400 });
    const text = body.text?.trim().slice(0, 1_600);
    if (!text) return NextResponse.json({ error: 'Specialist line is empty.' }, { status: 400 });
    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(persona.voiceId)}`, {
      method: 'POST',
      headers: { Authorization: `Token ${env('DEEPGRAM_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Deepgram specialist TTS HTTP ${response.status}`);
    return new Response(await response.arrayBuffer(), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
