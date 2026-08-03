import { getState, onChange } from '../../../../src/server-lib/session';

export const dynamic = 'force-dynamic';

// Server-sent session state. The consult room repaints when something actually
// happens — a seat lands, a voice takes the floor, a note is written — instead of
// on a poll tick. The speaking highlight in particular needs event timing: at a
// 700ms poll it visibly lagged the voice.
export async function GET(req: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send(getState());
      const unsubscribe = onChange(() => send(getState()));
      // Comment ping: keeps proxies from closing an idle stream mid-consult.
      const ping = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch {
            closed = true;
          }
        }
      }, 15000);

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener('abort', shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
