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

The repository currently contains a verified standalone Stedi test-mode POC and the
implementation blueprint for the complete application. Deepgram, Medplum, Moss, the
reasoning runtime, and the main clinician workspace are specified but are not yet
integrated application code. See the integration-truth table in `docs/PLAN-V2.md`; do
not infer completion from the presence of design documentation.

## Getting started

```bash
cp .env.example .env   # get key values from Vijay — .env never gets committed
# node >= 20 required
```

Read `docs/PLAN-V2.md` (the canonical product outcome), `docs/PRINCIPLES.md` (product
and decision guidance), `docs/DEMO.md` (the separate two-minute video constraint), and
`AGENTS.md` (rules for coding agents) before writing code. `docs/PLAN.md` preserves the
original plan. Verified API cheatsheets are in `docs/notes/`.

Synthetic data only — no PHI anywhere in this repo.
