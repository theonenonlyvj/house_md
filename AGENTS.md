# AGENTS.md — house_md (read this before writing any code)

One-day hackathon build (YC × Medplum Agentic Healthcare Hackathon, Sat 2026-08-01,
**submit 5:00pm PT**). Team: Vijay, Thai, Noah, Felix. Canonical build source:
`docs/PLAN.md`. Product and decision guidance: `docs/PRINCIPLES.md`. Separate video
constraint: `docs/DEMO.md`. Provider notes: `docs/notes/`. This file applies to every
coding agent (Claude Code, Codex, Cursor, etc.) working in this repo.

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
- **Voice: deterministic input first.** A clinically reviewed prerecorded utterance may
  be the guaranteed input and the live Voice Agent WebSocket may remain behind a flag,
  but the audio must pass through Deepgram and the same reasoning, Moss, Medplum, and
  Stedi path. Never inject a stored transcript or canned downstream success.
- **Integration status is literal.** `docs/PLAN.md` records what is designed,
  verified, integrated, and demo-ready. At the current starting point only the Stedi
  standalone POC is verified code; do not describe the other provider paths as
  implemented until their stated proof succeeds.
- Time-box any debugging spiral to 20 minutes, then simplify or stub.
- On Vijay's machine, default `node` is v12 — prefix commands with
  `PATH="/opt/homebrew/opt/node/bin:$PATH"`. Other machines: use node ≥20.

## Team coordination

- Pull/rebase before each work block, commit small coherent slices, push promptly, and
  never force-push shared work.
- Keep council reasoning, coverage, voice, and UI behind the typed boundaries in the
  canonical plan so parallel work does not collide.
- Do not overwrite uncommitted teammate work. If ownership or a conflict is unclear,
  stop and report the exact files involved.
- The selected patient and UI copy remain data/configuration decisions, not logic
  hardcoded into provider adapters.

## Scope gates (from the plan — respect them)

- 1:00pm — DDx conversation works TEXT-first.
- 2:00pm — voice gate: live microphone or prerecorded audio through Deepgram, decide
  and move on; downstream provider calls remain real.
- 3:00pm — Stedi leg: ONE eligibility call rendered in the options UI is enough.
- 4:00pm — stop building; rehearse the demo, fill the submission form.
