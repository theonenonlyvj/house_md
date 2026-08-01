#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import WebSocket from 'ws';

const root = resolve(import.meta.dirname, '../../..');
const url = process.argv[2] ?? 'ws://127.0.0.1:3000/agent';
const wav = readFileSync(resolve(root, 'assets/audio/case-presentation.wav'));
const { pcm, sampleRate, channels, bitsPerSample } = parseWav(wav);
if (sampleRate !== 24_000 || channels !== 1 || bitsPerSample !== 16) throw new Error(`Expected mono linear16 at 24000 Hz; got ${channels}ch ${bitsPerSample}-bit ${sampleRate} Hz.`);

const socket = new WebSocket(url);
await new Promise((resolveOpen, reject) => { socket.once('open', resolveOpen); socket.once('error', reject); });
socket.send(JSON.stringify({ type: 'start', sessionId: 'demo-session' }));
await new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => reject(new Error('Deepgram SettingsApplied timeout')), 20_000);
  socket.on('message', (data, binary) => {
    if (binary) return;
    const message = JSON.parse(data.toString());
    if (message.type === 'status' && message.state === 'error') reject(new Error(message.detail));
    if (message.type === 'status' && message.state === 'ready') { clearTimeout(timeout); resolveReady(); }
  });
});

const bytesPerFrame = 24_000 * 2 * 0.04;
for (let offset = 0; offset < pcm.length; offset += bytesPerFrame) {
  socket.send(pcm.subarray(offset, Math.min(offset + bytesPerFrame, pcm.length)));
  await delay(40);
}
const silence = Buffer.alloc(bytesPerFrame);
for (let index = 0; index < 38; index += 1) { socket.send(silence); await delay(40); }
console.log('Prerecorded case audio streamed through the app’s managed Deepgram session in real time.');
await delay(2_000);
socket.close();

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Input is not a WAV file.');
  let offset = 12;
  let format;
  let pcm;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') format = { channels: buffer.readUInt16LE(offset + 10), sampleRate: buffer.readUInt32LE(offset + 12), bitsPerSample: buffer.readUInt16LE(offset + 22) };
    if (id === 'data') pcm = buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  if (!format || !pcm) throw new Error('WAV fmt/data chunks are missing.');
  return { ...format, pcm };
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
