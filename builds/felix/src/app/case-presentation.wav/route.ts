import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const audio = await readFile(resolve(process.cwd(), '../../assets/audio/case-presentation.wav'));
    return new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('audio not found', { status: 404 });
  }
}
