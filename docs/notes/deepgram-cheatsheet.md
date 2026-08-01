# Deepgram Cheatsheet — Hackathon Build

Context: voice agent conducts a phone-like patient check-in, transcribes it, app extracts structured data. Key you already have: `DEEPGRAM_API_KEY` in `.env`. $200 sponsor credit.

---

## 1. Three product paths — which to use
Source: https://developers.deepgram.com/docs/introduction (site nav), https://developers.deepgram.com/docs/voice-agent, https://developers.deepgram.com/docs/pre-recorded-audio

| Path | What it is | Use when |
|---|---|---|
| **Pre-recorded STT** | POST an audio file/URL, get back a transcript | Fallback demo, or post-call batch processing |
| **Live/streaming STT** | WebSocket, you stream audio in, get transcripts back in real time. No agent/LLM/TTS — you own the conversation logic. | You want your own LLM/turn-taking control, or just need live captions |
| **Voice Agent API** | One WebSocket that bundles STT → LLM → TTS ("listening, thinking, and speaking" — full speech pipeline) | You want a spoken back-and-forth conversation with minimal glue code |

**Recommendation for tomorrow:** go straight for the **Voice Agent API**. It's the "centerpiece" fastest path to a *convincing* demo — one WebSocket instead of wiring STT+LLM+TTS yourself, and it natively gives you the conversation transcript (`ConversationText` events) which is exactly what you need to feed into structured extraction. Keep **pre-recorded STT** in your back pocket as a 10-minute fallback (record on phone → upload → transcribe → run extraction) if the live agent demo is flaky on stage.

---

## 2. Voice Agent API — the centerpiece
Sources: https://developers.deepgram.com/reference/voice-agent/voice-agent, https://developers.deepgram.com/docs/configure-voice-agent, https://developers.deepgram.com/docs/build-a-voice-agent, https://developers.deepgram.com/docs/build-a-voice-agent-javascript, https://developers.deepgram.com/docs/voice-agent-outputs, https://developers.deepgram.com/docs/voice-agent-inputs

### How it works
- Single **WebSocket** endpoint: `wss://agent.deepgram.com/v1/agent/converse`
- Auth via header (Authorization, API key — same key as your `.env`)
- Flow: connect → send a **`Settings`** message (models, voice, LLM, prompt) → server confirms with `SettingsApplied` → you stream raw audio bytes in (binary frames) → server streams agent audio bytes back out + JSON event messages for transcripts/state.
- It genuinely is STT → LLM → TTS chained server-side; you configure all three "legs" in one `Settings` payload.

⚠️ Note on naming: the API Reference page (TypeSpec-style docs) labels message *schemas* with a versioned prefix like `AgentV1Welcome`, `AgentV1ConversationText`, `AgentV1FunctionCallRequest`. The **actual wire-level `"type"` field values you match against in your JS code are the unprefixed short names** (`"Welcome"`, `"ConversationText"`, `"FunctionCallRequest"`, etc.) — confirmed against the dedicated inputs/outputs doc pages and JSON examples below. Use the short names in code.

### Server → client event types (confirmed short names)
`Welcome` · `SettingsApplied` · `ConversationText` · `UserStartedSpeaking` · `AgentThinking` · `AgentStartedSpeaking` · `AgentAudioDone` · `FunctionCallRequest` · `Error` · `Warning` · `LatencyReport` (STT/LLM/TTS breakdown per turn) · plus binary `Audio` frames (agent's spoken audio, not JSON).
⚠️ `PromptUpdated` / `SpeakUpdated` / `ThinkUpdated` / `ListenUpdated` exist as confirmation events for the corresponding `Update*` client messages — exact string casing not independently verified beyond the reference page's prefixed form; treat as ⚠️ unverified — check docs before matching on them.

### Client → server message types (confirmed)
`Settings` · `UpdateListen` / `UpdateThink` / `UpdateSpeak` / `UpdatePrompt` (mid-session changes) · `InjectUserMessage` · `InjectAgentMessage` · `FunctionCallResponse` · `KeepAlive` · plus binary audio frames (your mic audio).

### SDK setup
Package: **`@deepgram/sdk`**

```bash
npm install @deepgram/sdk dotenv
```

### Minimal working example (Node, from docs)
```javascript
const { DeepgramClient } = require("@deepgram/sdk");
require("dotenv").config();

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });

const run = async () => {
  const connection = await deepgram.agent.v1.connect();
  connection.connect();
  await connection.waitForOpen();

  // 1. Configure the agent
  connection.sendSettings({
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 24000 },
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      language: "en",
      listen: { provider: { type: "deepgram", model: "nova-3" } },
      think: {
        provider: { type: "open_ai", model: "gpt-4o-mini" },
        prompt: "You are a friendly clinical check-in assistant. Ask about symptoms, medication adherence, and how the patient is feeling. Keep responses short.",
      },
      speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } },
      greeting: "Hi, this is your follow-up check-in. How are you feeling today?",
    },
  });

  // 2. Listen for events
  connection.on("message", (data) => {
    if (data.type === "Welcome") console.log("connected", data);
    if (data.type === "SettingsApplied") console.log("agent ready");
    if (data.type === "ConversationText") console.log(data.role, data.content); // <-- this is your transcript feed
    if (data.type === "AgentAudioDone") console.log("agent finished speaking turn");
  });

  connection.on("data", (audioChunk) => {
    // binary Blob/Buffer of agent speech (linear16 @ 24000 per Settings above) — play or write to file
  });

  // 3. Stream mic audio in (linear16 PCM, 24kHz, matching audio.input above)
  // connection.sendMedia(pcmChunk)
};

run();
```

Field names verified verbatim from docs: `type`, `audio.input.encoding`/`sample_rate`, `audio.output.encoding`/`sample_rate`/`container`(defaults `"none"`), `agent.listen.provider.type`/`model`, `agent.think.provider.type`/`model`/`temperature`, `agent.think.prompt` (system prompt — 25,000 char limit for managed LLMs), `agent.speak.provider.type`/`model`/`voice`/`speed`, `agent.think.functions` (see §4).

STT model example seen in docs: `"nova-3"` (also Flux models `flux-general-en`/`flux-general-multi` for newer low-latency path — ⚠️ unverified whether Flux is GA-recommended for agent use vs nova-3, check `/docs/configure-voice-agent`). LLM `provider.type` values seen: `"open_ai"`, `"google"`, `"anthropic"`. TTS `provider.type` values seen: `"deepgram"`, `"eleven_labs"`, `"open_ai"`.

### KeepAlive
Source: https://developers.deepgram.com/docs/agent-keep-alive
```json
{ "type": "KeepAlive" }
```
Send only when **not** actively streaming mic audio (e.g. user paused). Docs: "send one `KeepAlive` every 8 seconds" while idle. If you're continuously streaming mic audio (normal case), you don't need this.

---

## 3. Browser vs Node — simplest wiring for a demo laptop
Sources: docs pages for browser mic capture returned 404 during this research pass (⚠️ unverified — check https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio and the JS voice-agent tutorial live for exact browser snippet before demo day).

**What a browser demo needs (general Web Audio knowledge, not Deepgram-specific — verify against their JS tutorial):**
- `navigator.mediaDevices.getUserMedia({ audio: true })` for mic permission + capture
- Raw PCM (`linear16`) at the sample rate you declared in `Settings.audio.input` — plain `MediaRecorder` outputs compressed formats (webm/opus), **not** linear16, so you typically need an `AudioWorkletNode` (or the older `ScriptProcessorNode`) to pull raw PCM samples and send them over the WebSocket as binary frames.
- Playback of agent audio: feed incoming binary chunks (declared format = `audio.output.encoding`/`sample_rate` from Settings) into a Web Audio `AudioContext` (e.g. `decodeAudioData` if container is `wav`, or manual PCM buffer scheduling if `container: "none"`).

**Simplest viable path for a hackathon demo laptop:**
- **Node/server-side is the lower-risk demo path**: capture mic via a simple script or even a pre-recorded WAV piped in as "live" input, avoids browser-permission and AudioWorklet plumbing entirely, matches the Node example in §2 almost verbatim.
- If you want the more impressive **browser** demo: set `container: "none"`, `encoding: "linear16"` on both input and output to avoid extra decode/encode steps, and budget real time for the AudioWorklet mic-capture plumbing — it's the fiddliest part. Check the official demo repo `github.com/deepgram-devs/deepgram-voice-agent-demo` (Node/TS/JS) for a working reference implementation before building from scratch — its README confirms it's a working sample app but the source wasn't inspectable in this research pass.

---

## 4. Function calling — trigger app actions from the conversation
Sources: https://developers.deepgram.com/docs/voice-agents-function-calling, https://developers.deepgram.com/docs/build-a-function-call, https://developers.deepgram.com/docs/voice-agent-function-call-request, https://developers.deepgram.com/docs/voice-agent-function-call-response, https://developers.deepgram.com/docs/voice-agent-function-call-context

This is exactly your "patient reports symptom X → callback" mechanism.

**Flow:** user says something → LLM matches it to a function you defined → server sends `FunctionCallRequest` → your app executes (client-side) or Deepgram calls your HTTP endpoint (server-side) → result goes back via `FunctionCallResponse` → agent continues the spoken conversation using the result.

**Define functions** under `agent.think.functions` in the `Settings` message:
```json
{
  "agent": {
    "think": {
      "provider": { "type": "open_ai", "model": "gpt-4o-mini" },
      "functions": [
        {
          "name": "log_symptom",
          "description": "Record a symptom the patient reports during check-in",
          "parameters": {
            "type": "object",
            "properties": {
              "symptom": { "type": "string", "description": "The symptom reported" },
              "severity": { "type": "string", "description": "mild, moderate, or severe" }
            },
            "required": ["symptom"]
          }
        }
      ]
    }
  }
}
```
⚠️ unverified — the docs did not show a `client_side` boolean at function-definition time in the `Settings.functions[]` entry itself (only in the *request* payload below); confirm whether client-vs-server routing is set per-function in Settings or is implicit. Check `/docs/voice-agent-function-call-context` live.

**Server → client, `FunctionCallRequest`:**
```json
{
  "type": "FunctionCallRequest",
  "functions": [
    { "id": "string", "name": "string", "arguments": "string (JSON-encoded)", "client_side": true, "thought_signature": "optional, some Gemini models" }
  ]
}
```

**Client → server, `FunctionCallResponse`:**
```json
{
  "type": "FunctionCallResponse",
  "id": "fc_12345678-90ab-cdef-1234-567890abcdef",
  "name": "get_weather",
  "content": "{\"location\": \"Fremont, CA 94539\", \"temperature_c\": 21}"
}
```
(`content` is a string — stringify your JSON result.)

**Client-side handling pattern (from docs, Python-flavored, port directly to JS):**
```javascript
const FUNCTION_MAP = {
  log_symptom: async (params) => {
    // your app logic — e.g. push into your structured-data store
    return { ok: true, symptom: params.symptom };
  },
};

connection.on("message", async (data) => {
  if (data.type === "FunctionCallRequest") {
    for (const fn of data.functions) {
      const args = JSON.parse(fn.arguments);
      const result = await FUNCTION_MAP[fn.name](args);
      connection.send(JSON.stringify({
        type: "FunctionCallResponse",
        id: fn.id,
        name: fn.name,
        content: JSON.stringify(result),
      }));
    }
  }
});
```
Client-side = your app executes ("navigating a UI, accessing local device data"); server-side = Deepgram calls a web endpoint you provide ("secure operations, database lookups, third-party services"). For a hackathon, **client-side is simpler** — no public endpoint needed, everything stays in your demo process.

**Also usable for structured extraction without function calling:** every turn arrives as a `ConversationText` event (`role`, `content`) — you can just accumulate the full transcript and run your own extraction pass (e.g. a separate LLM call) after the call ends, which is simpler than wiring live function calls if time is short.

---

## 5. Text-to-speech standalone (Aura)
Source: https://developers.deepgram.com/docs/text-to-speech, https://developers.deepgram.com/reference/text-to-speech-api/speak, https://developers.deepgram.com/docs/tts-models

```bash
curl --request POST \
     --header "Content-Type: application/json" \
     --header "Authorization: Token $DEEPGRAM_API_KEY" \
     --output out.mp3 \
     --data '{"text":"Hello, how can I help you today?"}' \
     --url "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en"
```
JS SDK form:
```javascript
const response = await deepgram.speak.v1.audio.generate({
  text: "Hello, how can I help you today?",
  model: "aura-2-thalia-en",
  encoding: "linear16",
  container: "wav",
});
```
Default voice if `model` omitted: `aura-asteria-en`. Voice naming: `aura-2-<name>-<lang>`, e.g. `aura-2-thalia-en`, `aura-2-apollo-en`, `aura-2-andromeda-en`.

---

## 6. Pre-recorded STT (fallback demo path)
Source: https://developers.deepgram.com/docs/pre-recorded-audio

```javascript
const { DeepgramClient } = require("@deepgram/sdk");
const fs = require("fs");

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });

const result = await deepgram.listen.v1.media.transcribeFile(
  fs.createReadStream("checkin.mp3"),
  { model: "nova-3", smart_format: true }
);
console.dir(result, { depth: null });
```
Or from a URL: `deepgram.listen.v1.media.transcribeUrl({ url, model: "nova-3", smart_format: true })`.

**Fallback demo plan:** record the patient conversation any way that works (phone voice memo, Zoom recording), run it through this, then run your existing extraction logic on the transcript text. Zero WebSocket risk.

---

## 7. Pricing/credits sanity — ⚠️ ballpark, published pay-as-you-go rates
Source: https://deepgram.com/pricing (fetched live)

| Product | Rate |
|---|---|
| Pre-recorded STT (Nova-3 mono) | $0.0077/min |
| Streaming STT (Nova-3 mono) | $0.0048/min |
| **Voice Agent API — Standard** | **$0.075/min** |
| Voice Agent API — Standard, bring-your-own-TTS | $0.065/min |
| Voice Agent API — Advanced | $0.163/min |
| TTS Aura-2 | $0.030 / 1k characters |

At **Voice Agent Standard ($0.075/min)**, $200 credit ≈ **2,666 minutes ≈ ~44 hours** of live agent conversation — effectively unlimited for a single day of hackathon demos, even with heavy rehearsal. Even the Advanced tier ($0.163/min) gives ~1,227 minutes (~20 hrs). Don't ration — the constraint tomorrow is time, not credit.

---

## 8. Gotchas
- **Sample rate / encoding must match on both ends.** Whatever you declare in `Settings.audio.input.encoding`/`sample_rate` must be the *actual* format of the bytes you stream — mismatches silently produce garbage transcripts, not errors. Same for `audio.output` vs. what your playback code expects.
- **Browser `MediaRecorder` does not give you `linear16`** — it gives compressed containers (webm/opus). If you declare `linear16` input (simplest agent-side config), you need raw PCM capture (AudioWorklet), not a naive `MediaRecorder` hookup. If short on time, do the mic capture in Node instead of the browser.
- **Mic permissions**: browser demos need HTTPS or `localhost` for `getUserMedia` to even prompt — a `file://` demo page will silently fail. Test the permission prompt once before you're on stage.
- **WebSocket keepalive**: only needed when you *stop* streaming audio for a stretch (e.g. mid-demo pause) — send `{"type":"KeepAlive"}` every ~8s while idle, or the connection drops. If you're continuously streaming mic audio this is moot.
- **Session auto-close**: Voice Agent sessions close automatically after 2 hours (with advance warning) — irrelevant for a demo but don't leave a connection open all day unattended and expect it to survive.
- **`agent.think.prompt` has a 25,000-character limit** for managed LLMs — plenty for a check-in script, just don't paste your whole EHR schema in there.
- **Event race conditions**: wait for `SettingsApplied` before assuming the agent is configured/ready; don't start streaming mic audio purely on `Welcome`.
- **Type-name confusion**: don't copy the `AgentV1*`-prefixed names straight from the API Reference page into your `if (data.type === ...)` checks — those are reference-doc schema labels; the wire value is the short form (`"ConversationText"`, not `"AgentV1ConversationText"`). Confirmed via the dedicated inputs/outputs and function-call doc pages, which all show short-form JSON examples.
- **Function-call args are a string**: `FunctionCallRequest.functions[].arguments` is JSON-*encoded as a string* — `JSON.parse()` it before use. Same for your `FunctionCallResponse.content` — stringify your result object.
