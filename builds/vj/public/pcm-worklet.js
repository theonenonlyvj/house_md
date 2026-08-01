// AudioWorklet: raw PCM capture — Float32 @ context rate (24k) -> Int16 chunks (~100ms).
// MediaRecorder can't produce linear16 (cheatsheet §8), hence this worklet.
class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufs = [];
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) {
      this.bufs.push(new Float32Array(ch));
      this.len += ch.length;
      if (this.len >= 2400) { // 100ms @ 24kHz
        const all = new Float32Array(this.len);
        let o = 0;
        for (const b of this.bufs) { all.set(b, o); o += b.length; }
        const i16 = new Int16Array(all.length);
        for (let i = 0; i < all.length; i++) {
          const s = Math.max(-1, Math.min(1, all[i]));
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(i16.buffer, [i16.buffer]);
        this.bufs = [];
        this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMCapture);
