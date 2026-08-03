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

**Golden path complete:** the working build is `builds/vj/`. Hosted-Medplum chart in
→ the clinician presents by voice → deterministic panel seating from the record AND
what they just said (a real empty seat when the bench can't cover it, spoken aloud)
→ live debate on Deepgram's managed model with code-enforced cited-or-conjecture and
code-enforced turn order → audible specialist voices + clinician mic → Moss semantic
retrieval → a live Stedi test-mode eligibility check → idempotent FHIR write-back
(`ClinicalImpression` + draft `ServiceRequest`s) inspectable as raw JSON. Standalone
PoCs that fed it: `stedi-poc/`, `voice-poc/`.

The consult runs in two acts. The room opens **empty** — the chair asks for the case
and nothing else exists yet. The panel is seated only after the clinician speaks,
because what they say out loud is weighted above the chart. Chairs then land one at
a time, each showing the terms in the record that put them there.

Run it:

```bash
cp .env.example .env                    # get key values from Vijay — .env is never committed
node scripts/seed-case.mjs --all        # seed the synthetic patients into Medplum (idempotent)
cd builds/vj && npm install && node server.js
# open http://localhost:3000/launch — pick a patient, Convene Experts, present the case
```

Node >= 20. On Vijay's machine prefix with `PATH="/opt/homebrew/opt/node/bin:$PATH"`.
Keys live in the repo-root `.env`; with no keys, provider calls surface visible
failure states — nothing is silently canned.

## Cases

Three synthetic patients ship seeded, and they exist to prove the panel is derived
rather than scripted — each convenes a different room:

| Patient | The miss | Panel the record seats |
|---|---|---|
| Tuan Pham | Steroids waking a 50-year parasite infection read as asthma | PULMO · GASTRO · I.D. · PHARM |
| Marguerite Adeyemi | Cardiac amyloidosis carried six years as hypertensive heart failure | CARDIO · NEPHRO · NEURO · HEME |
| Priya Raghunathan | Adult-onset Still's tipping into MAS after three antibiotic courses | I.D. · HEME · GASTRO · **RHEUM (empty)** |

Adding a case is two files and no code: write `scripts/cases/<id>.mjs`, run
`node scripts/seed-case.mjs <id>`, add an entry to `builds/vj/src/case/cases.ts`.

Read `docs/PLAN-FINAL.md` (the canonical, self-contained plan), `docs/PRINCIPLES.md`
(decision guidance), `docs/DEMO.md` (the two-minute video constraint), and `AGENTS.md`
(rules for coding agents) before writing code. Superseded plans live in
`docs/history/`. Verified API cheatsheets are in `docs/notes/`.

Synthetic data only — no PHI anywhere in this repo.
