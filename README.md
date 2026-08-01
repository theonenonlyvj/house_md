# house_md

Have a council of peers at your fingertips for patient specific differential diagnosis
and treatment options.

A clinician presents a case by voice. The agent argues the differential — citing the
patient's actual FHIR record — then checks what their coverage really pays for and turns
the leading dx into a feasible care plan. Decision support, not diagnosis: the agent
argues, the doctor decides.

Built in one day at the YC × Medplum Agentic Healthcare Hackathon (Aug 1, 2026) by
Vijay Ram, Thai Nguyen, and Noah Landesberg.

## Stack

[Medplum](https://www.medplum.com/) (FHIR store + Bots) · [Deepgram](https://deepgram.com/)
(voice) · [Stedi](https://www.stedi.com/) (test-mode eligibility) ·
[Moss](https://moss.dev) (real-time retrieval) · TypeScript

## Getting started

```bash
cp .env.example .env   # get key values from Vijay — .env never gets committed
# node >= 20 required
```

Read `docs/PLAN.md` (the build plan + scope gates) and `AGENTS.md` (rules for coding
agents) before writing code. Verified API cheatsheets are in `docs/notes/`.

Synthetic data only — no PHI anywhere in this repo.
