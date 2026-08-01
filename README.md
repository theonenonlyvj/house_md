# house_md

Have a council of peers at your fingertips for patient specific differential diagnosis
and treatment options.

A clinician presents a case by voice. The agent argues the differential — citing the
patient's actual FHIR record — then checks what their coverage really pays for and turns
the leading dx into a feasible care plan. Decision support, not diagnosis: the agent
argues, the doctor decides.

Built in one day at the YC × Medplum Agentic Healthcare Hackathon (Aug 1, 2026) by
Vijay Ram, Thai Nguyen, Noah Landesberg, and Felix Wotschofsky.

## Stack

[Medplum](https://www.medplum.com/) (FHIR store + Bots) · [Deepgram](https://deepgram.com/)
(voice) · [Stedi](https://www.stedi.com/) (test-mode eligibility) ·
[Moss](https://moss.dev) (real-time retrieval) · TypeScript

## Build status

**Golden path complete (verified live 3:10pm):** the working build is `builds/vj/`.
Hosted-Medplum chart in → deterministic council seating (real empty seat, spoken) →
live debate on Deepgram's managed model with code-enforced cited-or-conjecture →
audible specialist voices + push-to-talk clinician mic → Moss semantic retrieval →
one live Stedi test-mode eligibility check re-sequencing the plan → idempotent
FHIR write-back (`ClinicalImpression` + draft `ServiceRequest`s) inspectable as raw
JSON. Standalone PoCs that fed it: `stedi-poc/`, `voice-poc/`.

Run it:

```bash
cd builds/vj
PATH="/opt/homebrew/opt/node/bin:$PATH" npm install   # plain `npm install` off Vijay's machine
PATH="/opt/homebrew/opt/node/bin:$PATH" node server.js # custom server (Next + WS relay)
# open http://localhost:3000 — enable chair audio, Assemble council, hold 🎙 to speak
```

Keys live in the repo-root `.env` (see below); with no keys, provider calls surface
visible failure states — nothing is silently canned.

## Getting started

```bash
cp .env.example .env   # get key values from Vijay — .env never gets committed
# node >= 20 required
```

Read `docs/PLAN-FINAL.md` (the canonical, self-contained plan), `docs/PRINCIPLES.md`
(decision guidance), `docs/DEMO.md` (the two-minute video constraint), and `AGENTS.md`
(rules for coding agents) before writing code. Superseded plans live in
`docs/history/`. Verified API cheatsheets are in `docs/notes/`.

Synthetic data only — no PHI anywhere in this repo.
