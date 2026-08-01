import { describe, expect, it } from 'vitest';
import { readJsonResponse } from './api-response';

describe('readJsonResponse', () => {
  it('turns a transient Next.js HTML response into a retryable API error', async () => {
    const response = new Response('<!DOCTYPE html><title>Not Found</title>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

    await expect(readJsonResponse(response, 'Session API failed')).rejects.toThrow(
      'Session API failed (HTTP 404). The local API returned HTML while Next.js was compiling; retry in a moment.',
    );
  });

  it('returns valid JSON for successful and structured error responses', async () => {
    const response = new Response(JSON.stringify({ error: 'No session' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readJsonResponse(response, 'Session API failed')).resolves.toEqual({ error: 'No session' });
  });
});
