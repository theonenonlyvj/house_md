# Stedi eligibility demo (for Felix / Thai — run this first)

**The point:** this is the working proof of the "will insurance cover it?" leg of
house_md. It shows everything Stedi's free test mode can do — **34 documented mock
scenarios across 8 groups** (active/inactive plans, dependents, dental, Medicare MBI
lookup, rejection errors), checkable via **REST** or Stedi's **MCP server**
(agent-native path), with a Run-all board and raw X12 270→271 viewer. Our main build
doesn't need to figure out the Stedi API — it's already figured out here; lift the
pieces.

## Run it locally (2 minutes)

```sh
git pull
cp .env.example .env       # at repo ROOT — then paste the key values from Vijay
cd stedi-poc
node server.mjs            # needs node >= 20 (plain node:http, no npm install)
# → open http://localhost:4181   (override with PORT=xxxx if taken)
```

The page auto-runs a first check and has numbered steps + "try next" hints — click
around. Good tour: `http://localhost:4181/?run=all` runs the whole 34-scenario board.

## What it is / is NOT (limitations)

- **Test mode only.** Every response is Stedi's documented MOCK data for predefined
  test payers (Aetna, Cigna, UHC, CMS/Medicare, + dental payers). Free, no PHI, no real
  patients — and no real-world variability beyond what the mocks encode.
- Test mode does NOT support: insurance discovery, coordination-of-benefits, real-time
  claim status, portal claim submission. Don't design demo beats around those.
- The mock patients' field values must match the docs exactly (they're in
  `scenarios.mjs` verbatim) — random names/IDs get rejections, which is realistic but
  confusing if unexpected.
- This is a PoC, not the product: no tests, one file each, zero build step — by design.

## How house_md should use it

1. **Lift `scenarios.mjs`** — the catalog of known-good request bodies (pick 1-2 for
   the demo case; the Cigna personas have genuinely varied benefit shapes).
2. **Lift `mcpToolCall()`/`mcpCall()` from `server.mjs`** if we want the agent to call
   Stedi as an MCP tool (agent-native, demos well); or the plain REST call in
   `/api/check` — both verified working.
3. **Parse the fields listed at the bottom of this file** ("Fields the main build
   should consume") — that section maps the 271 response onto "is this care option
   covered / what's the copay", which is exactly our demo beat.
4. `resp_*.json` are saved real mock responses — develop the parser offline against
   them without hitting the API.

Demo deep links: `/?scenario=cms&run=1` (auto-runs one scenario), `/?run=all`
(auto-runs the whole board — good projector opener). Scenario keys are in `scenarios.mjs`.

## Files

- `scenarios.mjs` — the catalog: every mock scenario from Stedi's docs, values verbatim. **Reuse this.**
- `server.mjs` — static page + `/api/scenarios`, `/api/check` (REST or MCP transport, returns latency ms),
  `/api/check-x12`, `/api/payer-search`, `/api/mcp-prompts`. Includes a minimal MCP
  Streamable-HTTP client (initialize → tools/call → prompts/list+get, SSE parsing,
  promise-mutex init, unique ids, 20s timeouts). **Reuse `mcpToolCall()`/`mcpCall()`.**
- `index.html` — idiot-proof one-pager: plain-English intro + numbered steps, auto-runs
  the first check on load, editable patient fields with reset + guided "try next" hints,
  Run-all board (click a tile to inspect), rich summary card (covered/not-covered chips
  grouped by Medicare Part A/B, deductible/OOP spent-vs-remaining meters, per-procedure
  dental rows, limitations/annual max, prior-auth badges, PCP/other-payer/contact rows,
  plan dates, MBI callout, portal link, 270/271 raw-EDI expanders), all HTML-escaped.
- `resp_*.json` — saved real mock responses for offline parser development.

## Verified facts (live Stedi docs, 2026-08-01)

- Eligibility: `POST https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/eligibility/v3`
  (append `/raw-x12` for X12 in → translated JSON out). Headers `Authorization: Key {key}`,
  `Content-Type: application/json`.
- MCP: `https://mcp.us.stedi.com/2025-07-11/mcp`, header `Authorization: {key}` (no `Key` prefix).
  Tools: `eligibility_check` (same shape as REST body), `search_for_payer` (`{query}` — fuzzy
  name/ID/alias). **Works with the sandbox test key** despite a docs callout saying
  production-accounts-only.
- Source: https://www.stedi.com/docs/healthcare/api-reference/mock-requests-eligibility-checks

## Sweep results — all 34 checks pass (2026-08-01, ~11:05 PT)

| Group | Scenarios | Result |
|---|---|---|
| Medical — active | Aetna, Ambetter, Cigna, Humana, Kaiser NorCal, CMS, UHC | ✅ all ACTIVE (10–116 benefit rows) |
| Cigna personas | Arrojo, Beck, Cone, Castillo, Fossum, Garces | ✅ all ACTIVE (9–92 rows — genuinely varied shapes) |
| Inactive | UHC `UHCINACTIVE` | ✅ INACTIVE (planStatus 6) |
| Dependent checks | Aetna, Anthem CA, BCBS TX, Cigna, Oscar, UHC | ✅ all ACTIVE (36–68 rows) |
| Dental (STC 35) | Ameritas, Anthem CA, Cigna, Cigna+`D4341`, MetLife, UHC | ✅ all ACTIVE (Ameritas: 384 rows!) |
| MBI lookup | `MBILU`, SSN → MBI | ✅ ACTIVE (10 rows) |
| AAA errors | UHCAAA 42/43/72/73/75/79 | ✅ each returns its exact AAA code + resolutions |
| Stedi Agent test | payer `STEDI`, Bernie Prohas | ✅ AAA 73 (portal "Resolve with Stedi Agent" fodder) |
| MCP transport | aetna, cms, dep-uhc, dental-proc, aaa75 | ✅ identical results via `tools/call` |
| Raw X12 270 | Aetna dependent sample | ✅ translated 271 JSON, 60 rows |
| Payer search | "medicare", "cigna" | ✅ 20 fuzzy-matched payers w/ IDs, aliases, coverage types |

## Fields the main build should consume ("is this care option covered")

- `planStatus[]` — `statusCode` `"1"` Active / `"6"` Inactive; `planDetails` = plan name.
- `benefitsInformation[]` — the payload that matters. Per row:
  - `code`: `1` Active / `6` Inactive / `I` **Non-Covered** / `B` Co-Payment /
    `A` Co-Insurance / `C` Deductible / `G` Out of Pocket / `F` Limitations
  - `serviceTypes[]` + `serviceTypeCodes[]` — **which care category the row applies to**
    (e.g. CMS: Active for Pharmacy/Home Health/Hospice/Surgical, Non-Covered for
    Routine Dental + Long Term Care). This is the coverage↔care-option mapping.
  - `benefitAmount` (string dollars) / `benefitPercent` (string fraction)
  - `inPlanNetworkIndicatorCode` (`Y`/`N`), `coverageLevel`, `timeQualifier`
    (Visit / Calendar Year / Remaining), `insuranceType` ("Medicare Part A/B"),
    `additionalInformation[].description` (e.g. "SPECIALIST" on the $15 copay)
- Rejections: HTTP 200 with `subscriber.aaaErrors[]` (or under `dependents[]`) —
  `code`, `description`, `followupAction`, `possibleResolutions`. Also check top-level `errors[]`.
- `planInformation.groupDescription`, `payer.name`, `planDateInformation`, `x12` (raw 271).

## Not possible on this sandbox (verified, not just read)

- **Test claims (837 → 277CA → 835 ERA):** API returns
  `access_denied: not available in Test Mode`. Docs: production account required
  (then `usageIndicator: "T"` → test 277CA from any payer ID; Stedi Test Payer
  `STEDITEST` + enrollment → test 835 ERAs, always fully paid).
- Never in test mode: transaction enrollment, insurance discovery, COB checks,
  portal-UI claim submission, 275 attachments, 276/277 claim status, custom mock data.

## Notes

- CORS: Stedi sends `access-control-allow-origin: *` — browser-direct would work;
  proxy kept so the key never reaches the client.
- MCP for the main build: point the agent at the MCP endpoint with the test key —
  no proxy needed. Its one prompt (`eligibility-resolution`, ~4.5KB of error-recovery
  guidance) is fetched live and shown on every rejection card (clients must explicitly
  read prompts — the demo does).
- CAQH CORE SOAP endpoint exists too (`/2025-06-01/protocols/caqh-core`) — needs
  account-ID auth; skipped as irrelevant to the demo.
- Test mode matches on exact subscriber values; edits to name/DOB/memberId
  produce realistic payer-style errors (that's a feature — demo it).
