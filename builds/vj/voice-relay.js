// Browser ⇄ app voice relay (mic INPUT path). The browser sends binary linear16@24k
// PCM frames captured by the push-to-talk worklet; we hand them to the live council
// session via the globalThis bridge the council module registers (same process).
export function attachVoiceRelay(wss) {
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'status', ready: true, note: 'mic relay up — hold push-to-talk to speak' }));
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      const mic = globalThis.__housemd_mic;
      if (typeof mic === 'function') mic(Buffer.from(data));
    });
  });
}
