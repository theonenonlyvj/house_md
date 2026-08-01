# Voice playground — Deepgram + Moss (for Felix / Thai — the voice leg, proven)

**The point:** this is the working proof of house_md's VOICE and RETRIEVAL legs. A
full speech↔speech Deepgram Voice Agent (live, function-calling into a synthetic
chart), TTS/STT panels, and Moss semantic retrieval at 3–6ms — all verified today.
The main build shouldn't rediscover any of this: the exact working wire code is here,
and the "What house_md should lift" section below names the files and functions.
It's also a tuning playground — personalities, voices, prompts are editable live,
which is how we'll pick each council member's voice.

## Run it (3 minutes)

```sh
git pull
cp .env.example .env       # at repo ROOT if you haven't already — see "Keys" below
cd voice-poc
npm install                # needs node >= 20
node server.mjs
# → http://localhost:4182    (4181 = stedi-poc · override with PORT=xxxx)
```

**Keys (in root `.env`):** panels 1–3 need `DEEPGRAM_API_KEY`, panel 4 needs
`MOSS_PROJECT_ID` + `MOSS_PROJECT_KEY`. **Text Vijay for the values** — recommended,
because the Moss index (`voice-poc`) already exists under his project, so retrieval
works immediately. If you use your own Deepgram key instead (free signup at
deepgram.com, $200 hackathon credit), everything Deepgram works identically; with your
own Moss creds you'd have to re-index first (`mossIndexAll()` in `moss.mjs`, ~20s) —
easier to just use his.

Put on **headphones** before playing with panel 3. Everything is synthetic data
(fake patient "Maria Okafor"); keys stay server-side, never in the browser.

## The four panels (all independent — one failing never blocks the rest)

| # | Panel | Status | What it does |
|---|---|---|---|
| 1 | **Speak** | ✅ live API | Textarea + 4 Aura voices → ▶ plays it, server-measured latency shown. |
| 2 | **Transcribe** | ✅ live API | 2 pre-generated sample clips (no mic/speaking needed), file upload, or mic recording → nova-3 transcript. Keyterms toggle runs the same audio **with and without** the medical keyterm boost, side by side, diff called out. |
| 3 | **Converse** | ✅ **LIVE Voice Agent** (not the fallback) | Full speech↔speech agent over `wss://agent.deepgram.com/v1/agent/converse`, relayed through the local server. **Tuning is the point**: 3 personality presets (warm clinic nurse / terse House-style attending 😈 / patient-friendly explainer), editable system-prompt textarea, agent voice dropdown, temperature slider, greeting — applied via **⟳ Restart session**. One tool wired: `lookup_patient` → canned synthetic chart, and the function call + result render in the transcript. Also a **type-instead-of-talk** box (works without a mic — noisy hall mode). |
| 4 | **Retrieve** | ✅ live Moss API | Semantic search over 20 synthetic snippets (indexed at build time into Moss index `voice-poc`). Score + latency per query, 3 canned query buttons. Auto-falls back to local keyword scoring **with an amber "local fallback" badge** if Moss ever fails. |

## Verified at build time (2026-08-01) vs. not

**✅ Live-verified, evidence in hand:**
- TTS: both sample clips generated via the real API (HTTP 200, `samples/*.mp3`).
- STT: sample clips transcribed correctly; `keyterm` param accepted by nova-3.
- **Full agent loop passed headless**: `test-agent.mjs` → Settings applied → greeting spoken →
  injected question → `FunctionCallRequest` → canned chart returned → agent **spoke the correct
  A1c (6.8%)** back, 416 KB of audio relayed. Run it yourself (server up): `PATH="/opt/homebrew/opt/node/bin:$PATH" node test-agent.mjs`
- Moss: 20 snippets indexed; canned queries return the right snippets in **3–6 ms** warm
  ("beta blocker allergy" → the carvedilol-intolerance line at 0.988). First query after boot
  is ~2–4 s (model/index download) — server fires a warmup at startup so you never see it.

**⚠️ Not verified (be ready for it):**
- **The browser mic path has never been clicked by a human.** The AudioWorklet capture →
  linear16@24k relay and PCM playback follow the cheatsheet's gotchas exactly, but panel 3
  voice-in and panel 2 mic-record were only proven headless/by-code. First live click is on you.
  If the mic path misbehaves, the type-instead-of-talk box is the verified escape hatch.
- Keyterm boost made **zero difference on the clean synthetic clips** (honest finding, shown in
  the UI). Expect it to matter only on messy real speech.
- Uploading exotic audio containers (whatever your phone records) — Deepgram auto-detects, mp3
  verified, others assumed.
- `AudioContext({sampleRate: 24000})` is fine in Chrome/Safari; Firefox untested.

## New Deepgram wire facts we learned (fold into notes/deepgram-cheatsheet.md tonight)

- `InjectUserMessage` schema **confirmed live**: `{ "type": "InjectUserMessage", "content": "..." }`.
- The agent WS also emits **`History`** events (not in the cheatsheet's event list) and echoes a
  **`FunctionCallResponse`**-typed message back to the client after you send yours. Ignore both safely.
- `LatencyReport` arrives ~2× per turn; payload renders under the transcript.
- Function calling with `open_ai`/`gpt-4o-mini` + `agent.think.functions` works exactly as the
  cheatsheet §4 describes — client-side handling, stringified args both directions.

## What house_md should lift (file + function)

- **`server.mjs` → `buildSettings()`** — a known-good, live-verified `Settings` payload (nova-3 +
  gpt-4o-mini + Aura-2, linear16@24k both directions, functions, greeting, temperature clamp).
- **`server.mjs` → the `wss.on('connection')` block** — the whole browser↔Deepgram relay pattern:
  header auth, wait-for-`SettingsApplied` before forwarding mic audio, binary/JSON split,
  `FunctionCallRequest` → `FUNCTION_MAP` → `FunctionCallResponse`, stale-socket guard for restarts.
- **`server.mjs` → `FUNCTION_DEFS` / `FUNCTION_MAP`** — swap the canned chart for real Medplum
  FHIR reads and you have the product's tool-calling spine.
- **`moss.mjs` → `mossSearch()` / `mossIndexAll()`** + the startup-warmup pattern (bottom of
  `server.mjs`) — Moss is genuinely fast once warm; warm it at boot.
- **`worklet.js`** (PCM capture) + **`index.html` → `ensureMic()` / `playChunk()` / `flushPlayback()`**
  — the browser audio in/out plumbing, incl. barge-in flush on `UserStartedSpeaking`.
- **`index.html` → `PRESETS`** — the three personalities, prompt text included.
- **`test-agent.mjs`** — headless smoke test of the whole agent loop; also the inject pattern for
  scripted/silent demos on stage.
- **`notes/moss-cheatsheet.md`** — the verified Moss API knowledge (auth, endpoints, limits,
  gotchas). Written this session from live docs + live calls.

## What broke / friction log

- **npm collision**: two agents building concurrently — my `npm install ws` wiped the Moss agent's
  SDK install for a few minutes. Resolved; `package.json` now carries both `ws` and `@moss-dev/moss`.
- The 25-minute Voice-Agent budget wasn't needed: the live WS + function call **passed on the
  first end-to-end run**. No pipeline fallback was built because the real thing works.
- Nothing else broke. Server verified on throwaway port 4998, killed; nothing left running.
