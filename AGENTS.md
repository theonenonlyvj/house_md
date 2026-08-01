# AGENTS.md — house_md (read this before writing any code)

One-day hackathon build (YC × Medplum Agentic Healthcare Hackathon, Sat 2026-08-01,
**submit 5:00pm PT**). Team: Vijay, Thai, Noah, Felix. Plan: `docs/PLAN.md`. This file applies
to every coding agent (Claude Code, Codex, Cursor, etc.) working in this repo.

## Ground rules

- **Ship the demo loop.** One end-to-end case beats any second feature. When in doubt,
  cut toward the 5pm demo.
- **Secrets live in `.env` (gitignored).** Get values from Vijay out-of-band. Never
  hardcode, commit, or print keys. `.env.example` lists the slots.
- **This repo is public.** Synthetic patients only; no real names, no PHI, no employer
  IP from anyone's day job.
- **Clinician-facing decision SUPPORT, not diagnosis.** The agent argues; the human
  decides. Keep that framing in code comments, UI copy, and README.
- **Never invent SNOMED/ICD/CPT codes** — use placeholders flagged for review or
  Medplum's `$validate-code`. FHIR **R4 only** (LLMs drift to R5 fields; type-check
  against `@medplum/fhirtypes`).
- **Verified API cheatsheets in `docs/notes/`** (Medplum, Deepgram) — read them before
  calling either API; they were checked against live docs today and beat your training
  data. MockClient gaps: NO chained search, NO $-operations, subscriptions don't fire
  (use an in-process dispatcher; keep Bot handlers deploy-ready).
- **Voice: deterministic path first.** Pre-recorded STT (nova-3 + keyterms) over scripted
  audio → intent → tool calls → TTS is the guaranteed demo; the live Voice Agent
  WebSocket is an upgrade behind a flag, never the only path.
- Time-box any debugging spiral to 20 minutes, then simplify or stub.
- On Vijay's machine, default `node` is v12 — prefix commands with
  `PATH="/opt/homebrew/opt/node/bin:$PATH"`. Other machines: use node ≥20.

## Scope gates (from the plan — respect them)

- 1:00pm — DDx conversation works TEXT-first.
- 2:00pm — voice gate: live voice in or canned single exchange, decide and move on.
- 3:00pm — Stedi leg: ONE eligibility call rendered in the options UI is enough.
- 4:00pm — stop building; rehearse the demo, fill the submission form.
