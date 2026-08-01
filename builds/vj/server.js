// Custom server: Next.js request handler + WebSocket upgrade for the browser⇄Deepgram
// voice relay. Next route handlers cannot accept WS upgrades — this wrapper is the
// decided topology (PLAN-FINAL §6). Still one application.
import { createServer } from 'node:http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { attachVoiceRelay } from './voice-relay.js';

const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: import.meta.dirname });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => handle(req, res));

const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws/voice')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});
attachVoiceRelay(wss);

server.listen(port, () => {
  console.log(`house_md (vj build) on http://localhost:${port}`);
});
