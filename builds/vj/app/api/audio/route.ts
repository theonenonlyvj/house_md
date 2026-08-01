import { addAudioSink, removeAudioSink } from '../../../src/server-lib/session';

export const dynamic = 'force-dynamic';

// Chair speech: raw linear16@24k PCM streamed as chunked HTTP. The browser reads the
// stream and plays via Web Audio. Keeps audio inside the Next module graph.
export async function GET() {
  let sink: ((buf: Buffer) => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      sink = (buf: Buffer) => {
        try {
          controller.enqueue(new Uint8Array(buf));
        } catch {
          if (sink) removeAudioSink(sink);
        }
      };
      addAudioSink(sink);
    },
    cancel() {
      if (sink) removeAudioSink(sink);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
  });
}
