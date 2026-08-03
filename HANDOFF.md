# HANDOFF — house_md (post-hackathon, written 2026-08-03)

Read this first. The hackathon (YC × Medplum, Sat 2026-08-01) is OVER — submitted with
`demo-recording.mp4` (repo root, 720p; pristine 173MB .mov stayed local, gitignored).
This repo now lives at `Cursor/medplum_hackathon/house_md/` (moved from `Cursor/house_md/`
on 2026-08-03).

## What this is

"The Medicine Is the Poison": a live AI panel consult. Dr. Lee presents 62-year-old
Tuan Pham (worsening "asthma" on prednisone); a voiced panel (HOUSE chair + PULMO,
GASTRO, I.D. + ADVOCATE) argues from his real hosted-Medplum chart, surfaces a
50-year-dormant Strongyloides infection being unmasked by the steroids, checks live
Stedi coverage, and writes ClinicalImpression + draft ServiceRequests back to Medplum.
Canonical plan: `docs/PLAN-FINAL.md` (self-contained; supersedes everything in
`docs/history/`). Full demo spec incl. agent prompts/runbook: `docs/DEMO_SPEC.md`.

## Run it

```bash
cd builds/vj
PATH="/opt/homebrew/opt/node/bin:$PATH" npm install   # Vijay's machine only; plain npm elsewhere
PATH="/opt/homebrew/opt/node/bin:$PATH" node server.js # custom server (Next + ws upgrade) on :3000
```
- `/launch` = Medplum-branded "Rural Care Clinic" EHR frame on Pham → "Convene Panel"
- `/` = the panel room (cork evidence board, live transcript, always-on audio, mic w/ mute)
- Keys in repo-root `.env` (gitignored): DEEPGRAM, MEDPLUM client creds
  (`vj_sandbox_plum`), STEDI_TEST, MOSS, OPENROUTER (evidence-board SVG drawing).
  No Anthropic/OpenAI keys — reasoning runs on Deepgram-managed models inside the
  Voice Agent session; OpenRouter key was pasted in chat 8/01, consider rotating.

## Architecture (all in builds/vj/)

- `server.js` + `voice-relay.js` — custom Node server; Next route handlers can't take
  WebSocket upgrades; browser mic PCM → `/ws/voice` → globalThis bridge → live session.
- `src/server-lib/council.ts` — THE BRAIN. One headless Deepgram Voice Agent WS
  (managed think = gpt-4o-mini default, gpt-5-mini fallback — 5-mini is smarter but
  7-15s/turn and hard-rejects any temperature param). Tools: search_patient_evidence
  (Moss w/ keyword fallback + chronological sweep of oldest records),
  present_specialist_turn (server TTSes the line in that persona's Aura voice — this
  is how N voices come out of a 1-voice session), submit_council_output (ranked 2-4
  differential enforced), get_benefits (live Stedi + ADVOCATE speaks facts-only line),
  submit_patient_plan. Citation validation is server-side: alias (E1…) resolution;
  uncited → CONJECTURE. `runDemoScript()` = emergency canned-content/live-voices path
  (`POST /api/session/demo`) used for the submission take.
- `src/council/seating.ts` — pure seating engine (keywords→systems→specialties, empty
  seats computed) + `seatFullRoster` demo mode (teammates added — seats whole cast).
- `src/council/personas.ts` — the cast config (HOUSE=aura-2-odysseus-en per Vijay).
- `src/server-lib/{stedi,medplum,moss,chart,whiteboard,finalize-shapes}.ts` — adapters.
  Stedi: 271 codes B/C/G, aaaErrors arrive as HTTP 200. Medplum: idempotent writes via
  If-None-Exist on identifier. Whiteboard SVG: OpenRouter call.
- Seeds: `scripts/seed-tuan-pham.mjs` (33 resources, 3 planted clues, idempotent,
  patient b8deb536-…), `scripts/seed-jane-doe.mjs` (earlier case, reworked by teammates
  w/ `lib.mjs` + Moss reindex). `scripts/feed-audio.mjs` = verified prerecorded-audio
  feeder (40ms-paced linear16@24k; burst-send never endpoints).

## Verified-the-hard-way gotchas (do not relearn)

1. Next bundling breaks native deps — `serverExternalPackages: ['ws', '@moss-dev/moss']`.
2. Headless DG sessions die in ~30s without `KeepAlive` every 5s.
3. Mic streams must be CONTINUOUS — mute sends zero-frames; a stalled stream wrecks
   nova-3 turn detection (>10s transcript delays, eaten first words).
4. gpt-4o-mini sometimes writes tool-call JSON as SPEECH (TTS reads it aloud).
   Prompt rule 8 + transcript regex filter mitigate; not 100%.
5. Client audio is buffer-scheduled — on barge-in you must flush scheduled
   AudioBufferSourceNodes or the chair keeps talking from the backlog.
6. One session singleton (globalThis) — background scripts and the human FIGHT over
   it; never run headless probes while someone drives the UI.
7. Live model stalls happen (SLOW_THINK, hangs) — `/api/session/demo` is the
   cannot-hang fallback: canned content from real runs, live TTS/Stedi/write-back.

## State / open items

- Hosted Medplum holds BOTH synthetic patients + the demo's written consult notes
  (ClinicalImpression bafd16eb-… etc. under Jane; Tuan's from the take).
- The genuinely-live loop (undirected reasoning) was proven repeatedly mid-afternoon
  (Jane case: found amyloidosis unprompted, conjecture demotions every run; Tuan case:
  full voiced runbook ~4:15pm). The DEMO_SPEC personas carry the answer by design —
  directed theater; Jane runs are the "it discovers cold" evidence.
- Flaky at day's end: live-session stalls during rapid human interjections (cause
  never fully diagnosed — suspect provider latency + conversation snowball).
- Un-merged nice-to-haves: none critical; `docs/pitch/` has teammate handoff notes.
- Workers/cleanup: Stedi/Deepgram/Moss are free-tier/test-mode; hosted Medplum project
  `vj_sandbox_plum` persists — synthetic data only, fine to leave.
