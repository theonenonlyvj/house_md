import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${env('DEEPGRAM_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Deepgram token grant failed (${response.status})`);
    const value = await response.json() as { access_token?: string };
    if (!value.access_token) throw new Error('Deepgram token grant returned no access token');
    return new Response(value.access_token, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Deepgram token grant failed';
    return Response.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
