# BUILD-KICKOFF — for the house_md implementing agent

You are the lead implementation agent for **house_md**, a 4-human hackathon team's main
build (YC × Medplum Agentic Healthcare Hackathon). It is ~12:05pm; **submission is
5:00pm sharp** (the humans tap the form). Read `AGENTS.md` (rules) and `docs/PLAN.md`
(concept + council architecture + guardrails) before writing code. This file is HOW to
execute that plan. Check the clock (`date`) at every milestone.

## What already exists — do not rebuild

- `docs/notes/` — VERIFIED Medplum + Deepgram cheatsheets (checked against live docs
  within 24h). Read before calling either API; they beat your training data.
- `stedi-poc/` — a WORKING Stedi eligibility demo. Lift `scenarios.mjs` (known-good
  request bodies), the REST call in `server.mjs` `/api/check`, or `mcpToolCall()` for
  the agent-native path. The 271-field mapping is at the bottom of its README. The
  Stedi problem is SOLVED — spend zero discovery time on it.
- `.env` (root, gitignored) — Vijay's clone has working keys: Medplum client creds
  (hosted project `vj_sandbox_plum`, token round-trip verified 11:35am), Deepgram,
  Stedi test, Moss. Teammates' clones may have fewer keys — everything must degrade to
  `@medplum/mock` + canned fixtures so any clone runs.
- A separate `voice-poc/` playground (Deepgram tuning: personalities/voices) may land in
  the sibling repo `medplum_hackathon` — if Vijay points you at it, lift its working
  voice wiring rather than re-deriving.

## Team coordination (4 humans + their agents share this repo)

- `git pull --rebase` before every work block; commit SMALL and OFTEN with clear
  messages; push promptly. Never force-push. Never rewrite files a teammate owns —
  if you find uncommitted or conflicting work, stop and flag it in your commit-free
  report rather than merging over it.
- Structure for parallel lanes: keep the council engine, coverage module, voice, and UI
  in separate directories with thin interfaces so four people can work without
  colliding.
- You do NOT own the demo case selection or final UI copy — humans decide those; build
  so they're data/config, not code.

## Build order (deterministic-first; demo loop over breadth)

**H0 (now–12:45) — skeleton + data.** Vite React + TS app; `MEDPLUM_MODE=mock|hosted`
flag; ONE rich synthetic patient (config-driven so the team can swap the case): 
conditions, meds, labs as proper FHIR (R4, no invented codes — placeholder-flag
anything uncertain). Milestone: app renders the patient chart from MockClient.

**H1 (12:45–1:45) — the council engine (the heart).**
- `council/seating.ts` — PURE, unit-tested: case features → required specialties +
  seated personas + EMPTY-SEAT flags. Deterministic, no LLM. This is Guardrail #1;
  its output renders in the UI (who's seated and WHY).
- `council/personas.ts` — config: name, specialty, system prompt, argument style,
  (later) Aura voice id. Include a chair/moderator.
- `council/debate.ts` — orchestration: each seated specialist produces {hypothesis,
  FOR-evidence[], AGAINST-others[], confidence}, every evidence item carrying a FHIR
  resource id (uncited claims get demoted to "conjecture" by the chair — enforce in
  code, not prompt-hope); chair synthesizes the ranked differential.
- LLM calls: Anthropic API (ANTHROPIC_API_KEY likely in env of whoever runs it) or
  whatever key is available — put the provider behind one thin `llm.ts` seam; ALSO
  implement a `--canned` mode with a pre-recorded debate JSON so the demo NEVER
  depends on a live LLM. Milestone (1:00pm GATE from AGENTS.md): text-first debate
  renders end-to-end for the demo case.

**H2 (1:45–2:30) — coverage leg.** Leading dx → proposed workup items (config) →
Stedi eligibility (lift from stedi-poc) → options annotated covered/copay/not-covered →
written back as FHIR (CoverageEligibilityResponse; DiagnosticReport for the
differential; ServiceRequests for the workup). 2:00pm voice gate: decide live voice vs
canned exchange NOW.

**H3 (2:30–3:30) — voice + patient mode.** Per PLAN: voice is an upgrade, never the
spine. Deterministic path: scripted case-presentation audio → nova-3 STT (keyterms) →
the same council pipeline; each persona's lines TTS'd in its OWN Aura voice for the
audible-whiteboard beat (pre-generate audio at build time; click-advanced playback).
Patient-discussion mode = one screen: doctor-approved options explained plainly with
real costs. 3:00pm gate: ONE Stedi call rendered is enough.

**H4 (3:30–4:15) — demo stepper + polish.** Click-advanced "Run Demo" stepper with
presenter-script footer: seed → seating (show the guardrail: seated specialists + one
EMPTY seat flagged) → debate (audible) → ranked DDx w/ citations → coverage-annotated
options → patient discussion → end card (everything as FHIR, rows open raw JSON).
Zero autoplay. Rehearsable in <10 min.

**4:15 — pencils down.** Tests green, README run instructions, `PITCH.md` skeleton
(60-sec pitch + form blurb for the humans to edit), one full offline demo pass.

**Cut order if behind:** live voice WS → per-persona voices (one narrator voice) →
patient mode becomes one summary card → Moss. NEVER cut: seating guardrail +
empty-seat beat, cited debate, one Stedi call, the stepper.

## Judge-proofing to preserve in UI copy

- "Decision support, not diagnosis — the council argues, the doctor decides."
- The empty-seat flag IS a demo beat, not an apology: guardrails demoed > guardrails
  claimed.
- Never render an invented clinical code; synthetic patient only; every debate claim
  clickable to its FHIR source.
