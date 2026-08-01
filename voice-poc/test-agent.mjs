// Headless smoke test for the /agent relay — proves the full live loop without a mic:
// connect → Settings applied → greeting spoken → injected text question → lookup_patient
// function call → spoken answer containing the chart's A1c.
// Run (server must be up):  PATH="/opt/homebrew/opt/node/bin:$PATH" node test-agent.mjs [port]
import WebSocket from 'ws';

const port = process.argv[2] || 4182;
const ws = new WebSocket(`ws://localhost:${port}/agent`);
ws.binaryType = 'arraybuffer';

const seen = { ready: false, greeting: false, fncall: false, answer: false, audioBytes: 0 };
let injected = false;
const transcript = [];

const done = (ok, why) => {
  console.log('---');
  console.log('transcript:', JSON.stringify(transcript, null, 1));
  console.log('agent audio bytes received:', seen.audioBytes);
  console.log(ok ? `PASS — ${why}` : `FAIL — ${why}`, JSON.stringify({ ...seen, audioBytes: undefined }));
  ws.close();
  process.exit(ok ? 0 : 1);
};
setTimeout(() => done(false, 'timeout after 60s'), 60000);

ws.on('open', () => ws.send(JSON.stringify({
  type: 'start',
  prompt: 'You are a terse attending physician. Answer in one short sentence. Use lookup_patient to read the chart when asked about a patient.',
  voice: 'aura-2-apollo-en',
  temperature: 0.5,
  greeting: 'Voice check. Ask me something.',
})));

ws.on('message', (data, isBinary) => {
  if (isBinary || data instanceof ArrayBuffer) { seen.audioBytes += data.byteLength ?? data.length; return; }
  const m = JSON.parse(data.toString());
  if (m.type === 'status') {
    console.log('status:', m.state, m.detail || '');
    if (m.state === 'ready' && !injected) {
      seen.ready = true;
      injected = true;
      setTimeout(() => {
        console.log('injecting question…');
        ws.send(JSON.stringify({ type: 'inject', content: 'Look up patient Maria Okafor and tell me her most recent A1c value.' }));
      }, 1500); // let the greeting finish arriving first
    }
  } else if (m.type === 'fncall') {
    seen.fncall = true;
    console.log('fncall:', m.name, JSON.stringify(m.args), '→ found:', m.result?.found);
  } else if (m.type === 'dg') {
    const ev = m.event;
    if (ev.type === 'ConversationText') {
      transcript.push(`${ev.role}: ${ev.content}`);
      if (ev.role === 'assistant') {
        if (/voice check/i.test(ev.content)) seen.greeting = true;
        if (/6\.8|six point eight/i.test(ev.content)) {
          seen.answer = true;
          setTimeout(() => done(seen.ready && seen.fncall && seen.audioBytes > 10000,
            'full loop: settings → greeting → inject → function call → spoken answer with correct A1c'), 2500);
        }
      }
    } else if (ev.type === 'Error' || ev.type === 'Warning') {
      console.log(ev.type + ':', JSON.stringify(ev));
      if (ev.type === 'Error') done(false, 'agent error event');
    } else {
      console.log('event:', ev.type);
    }
  }
});
ws.on('error', e => done(false, 'ws error: ' + e.message));
