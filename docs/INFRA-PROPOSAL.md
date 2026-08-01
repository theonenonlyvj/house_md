# INFRA-PROPOSAL — fleshed-out build detail for team alignment

**Status: PROPOSAL, uncommitted draft (~12:20pm). Not agreed. Felix is detailing the plan
in parallel — this is input to that, not a decree.** Complements `PLAN.md` (concept) and
`BUILD-KICKOFF.md` (schedule). Everything below is grounded in a fresh read of
`stedi-poc/`, `docs/notes/deepgram-cheatsheet.md`, and the `medplum_hackathon` staging
repo (voice-poc, oneshot, oneshot2) — file paths are exact.

## 0. The one strategic update from ground-truthing

Coverage and voice are mostly **lift jobs** (working code exists — see §5 lift map).
The only genuinely fresh build is the **council engine + whiteboard UI + stepper
assembly**. Time allocation should follow: council gets the deep work, coverage/voice
get integration hours, not invention hours.

## 0.5 DECISIONS CLOSED with Vijay (~12:45pm)

1. **Chart source: hosted Medplum w/ mock fallback** — synthetic patient seeded once
   into `vj_sandbox_plum`, chart pulled LIVE through the proxy; MockClient fallback
   keeps cred-less clones demoable.
2. **MD interaction: FULLY LIVE VOICE** — managing MD speaks into the conference;
   nova-3 listens, council responds live. Canned conference stays wired as the
   stage-failure parachute (AGENTS.md rule: live WS is never the only path).
   2:00pm voice gate decides which path the demo LEADS with.
3. **LLM: Deepgram free credits — no Anthropic key.** The council's reasoning runs on
   the Voice Agent's MANAGED think provider inside the WS session (see §3.5).
4. **Roster: 7 seats, lens = persona** — Chair + Skeptic + Radiologist + Psych +
   3 case-driven specialties (rheumatology, infectious disease, clinical
   pharmacology). Nephrology is required by the case and deliberately unseated →
   the empty-seat guardrail beat. Scribe/assistant = non-voting persona that
   maintains the whiteboard summary.
5. **Coverage depth: alternatives + OOP math** — not-covered items get a covered
   alternative proposed (config-mapped); patient sees estimated out-of-pocket from
   copay/coinsurance/deductible. Coverage visibly CHANGES the plan.
6. **Demo case: approved as default, team may swap** — 34F on hydralazine (§9 #4);
   engine stays case-agnostic config so a swap needs zero code changes.

Still open: lane assignments (humans, in the room); whether Felix's plan pass changes
any of the above.

## 1. Runtime topology

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  Vite React+TS app       │  /api/* │  ONE node proxy (server/)     │
│  localhost:5173          ├────────►│  localhost:8787 — holds keys  │
│  MockClient (FHIR store) │  proxy  │  base = lifted voice-poc/     │
└─────────────────────────┘        │    server.mjs                 │
                                    │  /api/speak    (Aura TTS)     │
  Committed fallback assets:        │  /api/transcribe (nova-3 +    │
  - canned debate JSON              │     keyterms — already wired) │
  - stedi-poc/resp_*.json fixtures  │  /api/search   (Moss+fallback)│
  - pre-generated persona audio     │  /api/eligibility (NEW: lift  │
                                    │     restCheck from stedi-poc) │
                                    │  /api/llm      (NEW: Anthropic│
                                    │     passthrough)              │
                                    │  /api/health   (NEW: which    │
                                    │     keys exist → UI badges)   │
                                    └──────────────────────────────┘
```

- Keys never reach the browser (Stedi's CORS would allow direct calls — deliberately
  don't; same pattern stedi-poc chose).
- **Every leg degrades so a cred-less clone still demos end-to-end offline:**

| Leg | Live | Degraded (no key / no server) |
|---|---|---|
| Council brain + voices | WS `/council` → Deepgram Voice Agent (managed think LLM, per-turn `UpdateSpeak` voice switch) | canned debate JSON + pre-generated audio (committed) |
| MD's voice | mic → WS listen leg (nova-3) | preset interjection buttons / typed question |
| Eligibility | `/api/eligibility` → Stedi test | committed `resp_aetna.json` / `resp_uhc-inactive.json` |
| One-off TTS lines | `/api/speak` | pre-generated audio files (committed) |
| FHIR chart | `MEDPLUM_MODE=hosted` via proxy → `vj_sandbox_plum` | `@medplum/mock` (default for cred-less clones) |
| Record retrieval | `/api/search` → Moss | local keyword fallback (already in voice-poc) |

- `/api/health` returns `{deepgram: bool, stedi: bool, anthropic: bool, moss: bool}` —
  the UI shows honest mode badges ("LIVE" / "CANNED") instead of pretending.
- `.env` gains one slot: `ANTHROPIC_API_KEY` (currently absent → canned is the spine
  until someone drops a key in).

## 2. Repo layout + lane ownership (4 humans, minimal collision)

```
app/                     ← Vite React+TS (scaffold exists, uncommitted)
  src/shared/types.ts    ← THE contract file (§3). Changes announced in commit msgs.
  src/case/              ← demo case config + seeding      (owner: case/UX human)
  src/council/           ← seating, personas, debate, llm  (owner: agent-core lane)
  src/coverage/          ← eligibility client + FHIR mapping (owner: coverage lane)
  src/voice/             ← audio manifest + playback        (owner: voice lane)
  src/ui/                ← chart, whiteboard, stepper       (owner: UX lane)
server/
  index.mjs              ← lifted voice-poc/server.mjs + /api/eligibility, /api/llm, /api/health
assets/audio/            ← pre-generated persona lines (committed, synthetic content)
```

Rules: cross-lane imports go through `shared/types.ts` only. UI copy + case selection
are data/config (humans own them). `git pull --rebase` before every block; small commits.

## 3. Interface contracts (the seams — proposed verbatim)

```ts
// ---- case/ ----
interface DemoCase {
  id: string; title: string;
  chiefComplaint: string;
  hpi: string;                          // what the presenter reads / STT transcribes
  features: CaseFeatures;               // explicit, so seating stays deterministic
  bundle: KeyedResource[];              // FHIR R4, logical keys
}
interface KeyedResource { key: string; resource: Resource }  // key e.g. 'obs-creatinine'
interface CaseFeatures {
  age: number; sex: 'male' | 'female' | 'other';
  organSystems: string[];               // 'renal' | 'msk' | 'derm' | 'heme' | 'cardio' | ...
  activeMeds: string[];                 // normalized names, e.g. 'hydralazine'
  redFlags: string[];                   // 'fever', 'cytopenia', 'proteinuria', ...
}

// ---- council/seating.ts — PURE, unit-tested, zero LLM (Guardrail #1) ----
function decideSeating(features: CaseFeatures, roster: Persona[]): SeatingDecision
interface SeatingDecision { seats: Seat[]; emptySeats: EmptySeat[] }
interface Seat      { specialty: string; personaId: string; reasons: string[] }  // reasons cite features
interface EmptySeat { specialty: string; reasons: string[] }   // rendered + spoken by chair

// ---- council/personas.ts — config, not code ----
interface Persona {
  id: string; name: string; specialty: string;
  style: string;                        // one-line argument style
  systemPrompt: string;
  auraVoice?: string;                   // e.g. 'aura-2-apollo-en'
  isChair?: boolean;
}

// ---- council/debate.ts ----
interface Argument {
  claim: string;
  citations: string[];                  // KeyedResource keys
  status: 'cited' | 'conjecture';       // COMPUTED: validated against bundle keys.
}                                       // LLM never gets to assert 'cited'. Enforced in code.
interface SpecialistPosition {
  personaId: string; hypothesis: string;
  confidence: 'high' | 'moderate' | 'low';
  arguments: Argument[];                // FOR own hypothesis
  rebuttals: (Argument & { targetPersonaId: string })[];
}
interface ChairSynthesis {
  ranked: DifferentialItem[];
  emptySeatStatements: string[];        // "nephrology seat is empty — flagging, not guessing"
}
interface DifferentialItem {
  dx: string; rank: number;
  supporting: Argument[]; contradicting: Argument[];
  workup: WorkupItem[];                 // feeds coverage lane
}

// ---- council/brain.ts — ONE seam, two impls (see §3.5) ----
interface CouncilBrain {
  // one debate turn: chair directs a persona to speak; returns text + audio
  turn(req: { personaId: string; direction: string; transcript: DebateTurn[] }):
    Promise<{ text: string; audio?: ArrayBuffer }>
  injectDoctor(utterance: string): void   // live MD speech lands here
}
// makeLiveBrain(): drives the Voice Agent WS session (managed think LLM, Deepgram credits).
// makeCannedBrain(): keyed replay of committed debate JSON + pre-gen audio. NEVER fails.

// ---- coverage/ ----
interface WorkupItem { key: string; label: string; serviceTypeCode: string }  // '30' medical etc.
interface CoverageAnnotation {
  workupKey: string;
  status: 'active-covered' | 'inactive' | 'not-covered' | 'unknown';
  copay?: string; coinsurance?: string; deductibleRemaining?: string; oopMax?: string;
  payer: string; raw: unknown;          // full 271 for the end-card drawer
}
// parse271(): consume benefitsInformation[] codes 1/6/I/B/A/C/G/F per stedi-poc README
// "Fields the main build should consume" — copy that mapping, don't re-derive.
// toFhir(): lift oneshot2/src/domain/eligibility.ts → CoverageEligibilityResponse.

// ---- voice/ ----
interface AudioManifest { [personaId: string]: { [lineId: string]: string } }  // → asset path
```

## 3.5 The council chamber — live architecture (the experimental piece, be honest)

One Deepgram Voice Agent WS session = the conference room, orchestrated server-side
(extend `voice-poc/server.mjs`'s relay):

1. **Think = Deepgram-managed LLM** (`agent.think.provider` — no Anthropic key,
   runs on free credits). System prompt = conference rules + all seated personas +
   the case bundle digest with citation keys.
2. **Turn-taking:** our orchestrator plays chair-of-record: per turn it sends
   `UpdateSpeak` (that persona's Aura voice) then `InjectUserMessage`
   ("Chair recognizes Dr. Osei, radiology — your read?"). Audio streams out in that
   persona's voice; `ConversationText` gives us the words.
3. **MD is live:** mic audio → the session's listen leg (nova-3). The council hears
   and responds to the actual doctor. `worklet.js` (lifted) does PCM capture.
4. **Citation enforcement stays server-side:** persona lines must end claims with
   `[cite:key]` (prompt contract); the relay parses `ConversationText`, validates
   keys against the bundle, and the UI renders unvalidated claims as CONJECTURE.
   The LLM still can't self-certify.
5. **Moss (`/api/search`):** orchestrator retrieves record snippets per specialty
   before each persona's turn and injects them as context — specialists literally
   "pull the chart" for their citations.

**Known risks, called in advance:** `UpdateSpeak`/`UpdatePrompt` mid-session are the
cheatsheet's ⚠️-unverified items; if voice-switching proves flaky → single narrator
voice live (cut order), personas differentiated by name-cards + text. If the WS path
fails entirely at the 2pm gate → canned conference with pre-gen per-persona audio,
MD's question via `/api/transcribe` STT. Both fallbacks are committed artifacts, so
the demo cannot die on stage.

## 4. Enforcement mechanics (the guardrails, in code not prompt-hope)

- **Seating determinism:** `decideSeating` is a pure feature→specialty rule table.
  Same case config → same council, every run. Unit tests pin the matrix, including
  the empty-seat case. UI renders `Seat.reasons` so judges see WHY each persona sits.
- **Cited-or-conjecture:** after every LLM turn, `validateArguments()` checks each
  citation key against the case bundle. Unknown/missing key → `status: 'conjecture'`,
  visibly downgraded in UI and in the chair's synthesis prompt. The LLM cannot
  self-certify a citation.
- **The council argues, the doctor decides:** differential is written back only as
  DiagnosticReport *impression* + *proposed* ServiceRequests (status `draft`).
  Patient mode renders only doctor-approved options (approval = a click in the UI).
- **No invented codes:** rock-solid LOINC only (718-7 Hgb, 777-3 Plt, 2160-0 Cr,
  1988-5 CRP, 6690-2 WBC, 8310-5 Temp, 8480-6/8462-4 BP); everything else text-only
  CodeableConcepts. `tsc` against `@medplum/fhirtypes` catches R5 drift.

## 5. Lift map (exact paths — zero rediscovery time)

| Need | Lift from | Notes |
|---|---|---|
| Stedi REST call | `stedi-poc/server.mjs` → `restCheck()` | 20s timeout incl.; `Authorization: Key <k>` |
| Known-good request bodies | `stedi-poc/scenarios.mjs` (all 34) | demo pair: `aetna` (active, $25/$30/$40 copays) + `uhc-inactive` (contrast) |
| 271→UI field mapping | `stedi-poc/README.md` bottom section | pre-written; benefitsInformation code taxonomy |
| 271→FHIR mapper | `medplum_hackathon/oneshot2/src/domain/eligibility.ts` | tested; provenance-labeled disclaimer extension |
| TTS/STT/Moss/WS server | `medplum_hackathon/voice-poc/server.mjs` | keyterms already wired (`?keyterms=1`); becomes `server/index.mjs` base |
| PCM mic capture | `medplum_hackathon/voice-poc/worklet.js` | only if live-mic upgrade lands |
| MockClient chart store | `medplum_hackathon/oneshot2/src/domain/chart.ts` | deterministic ordered snapshot pattern |
| Bot-shaped logic locally | `oneshot2/src/domain/gapBot.ts` pattern | MockClient subscriptions never fire → local dispatcher, handlers stay deploy-ready |
| Click-stepper race guard | `medplum_hackathon/oneshot/src/domain/runGuard.ts` | prevents double-advance |
| Raw-FHIR drawer + presenter rail | `medplum_hackathon/oneshot/src/components/` | matches our end-card + stepper spec |

**Known traps carried over:** oneshot2's UI is a stub (domain logic good, demo not);
oneshot is polished but a different concept (regex-scripted voice, not real agent);
voice-poc WS relay is single-persona (N voices = real extension, TTS-per-line path
doesn't have that problem); Stedi mock personas' identity fields must match verbatim
or you get AAA rejections (which is itself a demoable beat); inactive 271s are
structurally thin — parse defensively; Stedi errors arrive as HTTP 200 + `aaaErrors[]`.

## 6. Honesty notes for the demo (judge-proofing)

- Stedi test-mode subscriber is a Stedi mock persona, not our synthetic patient. UI
  labels the coverage panel "Stedi test-mode payer (sandbox)" — never imply the
  patient's own real coverage was queried.
- Mode badges (LIVE/CANNED) stay visible. Guardrails demoed > guardrails claimed.
- Aura voice catalog gap: cheatsheet names only 4 voice ids
  (aura-2-thalia/apollo/andromeda-en, aura-asteria-en) but the roster needs 7. First
  voice task = pull the live Aura voice list (one API/docs check); if it doesn't
  yield 7 distinct, voices double up on minor seats or we drop to one narrator
  (already the cut order).

## 7. Test plan (vitest, in `app/`)

1. `seating.test.ts` — feature→specialty matrix; empty-seat flagged when roster lacks
   required specialty; determinism (same input → same output); reasons non-empty.
2. `debate-validation.test.ts` — uncited claim → conjecture; bogus citation key →
   conjecture; valid keys survive; chair synthesis never promotes conjecture above
   cited evidence of same dx.
3. `parse271.test.ts` — against committed `resp_aetna.json` + `resp_uhc-inactive.json`
   fixtures: active w/ copays extracted; inactive → thin-response path; aaaErrors path.
4. `canned-llm.test.ts` — canned mode returns valid debate for the demo case with zero
   network.
Untested by design (hackathon): UI components, live API calls.

## 8. Revised build order (re-baselined ~12:50 start; gates per AGENTS.md)

- **B0 (→1:20)** — commit scaffold; `shared/types.ts`; case config; chart renders
  from MockClient; seed hosted `vj_sandbox_plum` + proxy chart pull with fallback.
- **B1 (→2:00)** — seating (pure + tests) + canned conference renders end-to-end on
  the whiteboard (text + cited/conjecture). *This is the slipped 1pm gate — text-first
  debate demoable by 2:00 hard.* In parallel (if a second pair of hands): start the
  WS council-chamber relay off voice-poc.
- **2:00 VOICE GATE** — live WS chamber speaking in ≥2 voices with MD mic in? If yes,
  live path leads the demo. If no, canned-conference-with-audio leads; live becomes
  the "one live question" beat or is cut.
- **B2 (→3:00)** — coverage leg from lifts: ONE live Stedi call + fixture fallback;
  271→annotations; covered-alternative mapping + OOP math; FHIR write-back
  (CoverageEligibilityResponse, DiagnosticReport, draft ServiceRequests). 3pm gate.
- **B3 (→3:45)** — pre-generate all persona audio (Deepgram key, Vijay's machine —
  needed regardless as the fallback); patient-mode screen (approved options, plain
  language, OOP estimates); stepper assembly (runGuard + drawer + presenter rail).
- **B4 (→4:15)** — polish, README, PITCH.md, full OFFLINE demo pass (prove the
  parachute), then a live-path pass. 4:15 pencils down.

## 9. Decision log (closed with Vijay ~12:45 — see §0.5) + still open

**Closed:** chart = hosted w/ mock fallback · MD = fully live voice (canned parachute
per AGENTS.md) · LLM = Deepgram managed think, no Anthropic key · roster = 7 seats,
Skeptic/Radiologist/Psych + 3 case-driven, nephrology = empty-seat beat · coverage =
alternatives + OOP math · case = hydralazine 34F as swappable default · layout =
single app + lane dirs · UI = hand-rolled.

**Still open (humans, in the room):**
1. Lane assignments — which human takes council / coverage / voice / UX?
2. Felix's plan pass — does it change anything above?
3. Radiologist's visual: ONE committed synthetic image (proposed) — who sources it?
