# Medplum Cheatsheet — YC × Medplum Hackathon

From live fetches of medplum.com/docs + medplum/medplum GitHub source, 2026-08-01. Every snippet is copied/trimmed from actual docs — source URL by each heading. ⚠️ = couldn't verify, don't trust blind.

---

## 1. Getting Started

**Account + project** — `/docs/tutorials/register`
1. https://app.medplum.com/register → account details → "Create account"
2. Name project → "Create Project". A **Project** = isolated set of FHIR resources (own users/bots/perms); resources can't cross-reference other projects. Common: separate staging/prod projects.
3. Top-right icon → "Account Settings" = your Practitioner profile. Top-left icon → "Project" = admin (Users tab → "Invite new user").

**Client credentials** — `/docs/auth/client-credentials`
1. https://app.medplum.com/admin/clients → create a `ClientApplication` → grab `ID` + `Secret`.
2. **MEDPLUM_CLIENT_ID** = `ID`, **MEDPLUM_CLIENT_SECRET** = `Secret`.
```bash
curl -X POST https://api.medplum.com/oauth2/token \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=$MY_CLIENT_ID&client_secret=$MY_CLIENT_SECRET"
# -> { "token_type": "Bearer", "access_token": "<TOKEN>", "expires_in": 3600 }
```
Local server (unedited config): token URL is `http://localhost:8103/oauth2/token`.

**MedplumClient SDK** — `/docs/sdk/core.medplumclient`, `/docs/sdk/core.medplumclient.startclientlogin`
```bash
npm i @medplum/core
```
```ts
// Auth — preferred over raw HTTP
await medplum.startClientLogin(clientId, clientSecret); // Promise<ProfileResource>

// CRUD
const patient = await medplum.createResource({ resourceType: 'Patient', name: [{ given: ['Alice'], family: 'Smith' }] });
const patient = await medplum.readResource('Patient', '123');
const updated = await medplum.updateResource(patient);       // pass full modified resource
await medplum.deleteResource('Patient', '123');
const bundle = await medplum.search('Patient', 'name=Alice'); // Bundle
const patients = await medplum.searchResources('Patient');    // array
```
Other auth methods: `setAccessToken()`, `startLogin()`, `signInWithExternalAuth()`, `signInWithRedirect()`, `signOut()`. Other useful methods: `createDocumentReference()`, `createAttachment()`, `createBinary()`, `executeBatch()`, `createResourceIfNoneExist()`, `upsertResource()`, `executeBot()`.

**`npm create medplum@latest`** — packages/create-medplum README (GitHub). Equivalent to `npm init medplum` (npm aliases `create`↔`init`). Prompts: (1) starter template, (2) project name, (3) Medplum base URL. ⚠️ unverified — exact template list and scaffolded folder/scripts not in the README; read the CLI's own prompts live rather than guessing.

Reference apps: Hello World (`git clone https://github.com/medplum/medplum-hello-world.git && npm install && npm run dev` → localhost:3000) and **Foo Medical** patient portal (https://github.com/medplum/foomedical).

---

## 2. Sample Data — `/docs/tutorials/importing-sample-data`

1. Download the sample FHIR JSON (two patients' worth, USCDI-shaped) linked on that page.
2. Batch upload tool: https://app.medplum.com/batch → upload the JSON. **Don't upload twice** (duplicates).
3. Verify at https://app.medplum.com/Patient.
The tool is a thin wrapper on the FHIR [batch/transaction api](https://www.hl7.org/fhir/http.html#transaction) — do the same programmatically with `medplum.executeBatch()`.

---

## 3. Bots — `/docs/bots/bot-basics`, `/docs/bots/bots-in-production`

Bots = "functions that execute when triggered... similar to AWS Lambda" (they literally run as AWS Lambdas, sandboxed). Used for webhooks, data transforms, Questionnaire→resource creation, etc.

⚠️ **Gated by default:** "Bots are disabled by default for accounts. Contact info@medplum.com if you'd like to learn more." A Super Admin enables the `bot` project feature — **check this first thing tomorrow**, don't lose time debugging it later.

Handler signature (exact):
```ts
import { BotEvent, MedplumClient } from '@medplum/core';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // event.input: string | Resource | Hl7Message | Record<string,any>
  // event.contentType, event.secrets, event.bot, event.traceId, event.requester, event.headers
}
```
```ts
// Typed example
import { Patient } from '@medplum/fhirtypes';
export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  console.log(`Hello ${patient.name?.[0]?.given?.[0]}!`);
  return true;
}
```

**Create + deploy (app UI):** Project Admin → https://app.medplum.com/admin/project → "Create new Bot" → name/description/optional AccessPolicy → Bot's **Editor** tab → write code → "Save" (persists, does NOT deploy) → "Deploy" (ships it). "Execute" button runs latest deployed version against the Input Pane; check **Event** tab for output.

**Create + deploy (CLI):**
```bash
npx medplum bot create <bot-name> <project-id> <source-file> <dist-file>
npm run build
npx medplum bot deploy <bot-name>
npx medplum bot deploy *staging*   # wildcard, multiple bots
```
`medplum.config.json`:
```json
{ "bots": [{ "name": "my-first-bot", "id": "<BOT_ID>", "source": "src/my-first-bot.ts", "dist": "dist/my-first-bot.js" }] }
```
Needs `MEDPLUM_CLIENT_ID`/`MEDPLUM_CLIENT_SECRET` env vars (don't commit `.env`).

**Invoke directly:** `POST https://api.medplum.com/fhir/R4/Bot/<BOT_ID>/$execute` with `Authorization: Bearer <TOKEN>` + `Content-Type` matching your input shape.

**Test locally** — `/docs/bots/unit-testing-bots`, `/docs/bots/running-bots-locally`
- **Unit tests** (fast, no server): `MockClient` from `@medplum/mock` (extends MedplumClient, stores in memory), works with Jest/Vitest.
  ```ts
  import { MockClient } from '@medplum/mock';
  import { handler } from './my-bot';
  const medplum = new MockClient();
  // medplum.createResource()/updateResource() to seed data, then:
  await handler(medplum, { bot: { reference: 'Bot/123' }, input: someResource, contentType: 'application/fhir+json', secrets: {} });
  // query medplum to assert
  ```
  ⚠️ `MockClient` gaps per docs: chained search, `_include`/`_revinclude`, real auth, most `$` operations, terminology `$expand`, websocket subscriptions.
- **Run for real locally:** set `Bot.runtimeVersion = "vmcontext"` (not `"awslambda"`) + `vmContextBotsEnabled: true` in server config — runs as a local thread, not an isolated lambda. Docs explicitly warn `node:vm` "is not a security mechanism" — dev-only.

---

## 4. Subscriptions → Bots — `/docs/bots/bot-basics#executing-automatically-using-a-subscription`, `/docs/subscriptions/subscription-extensions`

Via app UI: Subscription page → "New..." → Status=`Active` → Criteria=`Patient` (any FHIR search string) → Channel Type=`Rest Hook`, Endpoint=**`Bot/<BOT_ID>`** → Payload=`application/fhir+json` → Save.
```json
{
  "resourceType": "Subscription", "status": "active", "reason": "test",
  "criteria": "Patient",
  "channel": { "type": "rest-hook", "endpoint": "Bot/<BOT_ID>" }
}
```
Fires on create+update to any `Patient`. **`criteria` can never be `AuditEvent`** (infinite notification loop). Other criteria examples: `DiagnosticReport?status=completed`, `Task`, `Patient?active=true`.

Restrict to specific interactions (default = create+update+delete):
```json
{ "extension": [{ "url": "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction", "valueCode": "create" }] }
```
Conditional/FHIRPath criteria, e.g. fire only on `Task.status` change:
```json
{ "criteria": "Task", "extension": [{ "url": "https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression", "valueString": "%previous.status != %current.status" }] }
```
⚠️ On **creation** `%previous` is empty and `!=` against empty evaluates falsy, so the expression above won't fire on creates — use `%previous.exists() implies %previous.status != %current.status` if creates should count too.

Other extensions: `subscription-max-attempts` (1–18, default 4 — but **Bot endpoints execute once, never retry**, this only applies to external rest-hook URLs); `subscription-secret` (HMAC/SHA-256 signature via `valueString`); `subscription-success-codes` (e.g. `"200-399,404"`).

---

## 5. Key FHIR Resources — Care Coordination

| Resource | One-liner | Source |
|---|---|---|
| **Patient** | Demographics/admin info for the person receiving care | `/docs/api/fhir/resources/patient` |
| **Device** | Manufactured item used in care delivery; tracks device instances | `/docs/api/fhir/resources/device` |
| **CarePlan** | Groups a patient's Tasks — concrete per-patient instantiation of a protocol | `/docs/careplans` |
| **Task** | "The workhorse" — individual clinical work item, tracked through a workflow | `/docs/careplans` |
| **Communication** | Record of a communication (sent/planned/failed), any medium | `/docs/api/fhir/resources/communication` |
| **Encounter** | The actual visit/interaction record | `/docs/api/fhir/resources/encounter` |
| **Appointment** | Scheduling/booking phase, before the Encounter happens | (same page) |
| **Questionnaire / QuestionnaireResponse** | Form definition / captured answers | `/docs/api/fhir/resources/questionnaire` |
| **ServiceRequest** | Requests a procedure/test/service — drives referrals & orders | `/docs/api/fhir/resources/servicerequest` |

```json
// Patient
{ "resourceType": "Patient", "active": true, "name": [{ "use": "official", "family": "Smith", "given": ["John"] }], "gender": "male", "birthDate": "1990-01-15" }

// Task
{ "resourceType": "Task", "status": "requested", "intent": "order", "code": { "coding": [{ "system": "http://example.com/tasks", "code": "sample-task" }] } }
```
Bot pattern, Questionnaire → Patient + ServiceRequest (`/docs/bots/bot-for-questionnaire-response`):
```ts
import { BotEvent, MedplumClient, getQuestionnaireAnswers, createReference } from '@medplum/core';
import { QuestionnaireResponse, Patient, ServiceRequest } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const answers = getQuestionnaireAnswers(event.input as QuestionnaireResponse);
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: [answers['firstName']?.valueString ?? ''], family: answers['lastName']?.valueString }],
  });
  await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest', status: 'active', intent: 'order',
    subject: createReference(patient),
    reasonCode: [{ text: answers['reasonForVisit']?.valueString ?? '' }],
  });
}
```

---

## 6. Communications: SMS + Email — `/docs/communications`, `/docs/integration/twilio-sms`

**Built in:** the `Communication` resource itself — threads/participants, attachments (`payload` supports `contentString`/`contentAttachment`/`contentReference`), read receipts, drafts. Data model, not a delivery mechanism.

**SMS via Twilio — self-serve, hosted only.** One-time install (bring your own Twilio creds, idempotent):
```
POST /fhir/R4/Project/$twilio-sms-install
```
```json
{ "resourceType": "Parameters", "parameter": [
  { "name": "TWILIO_ACCOUNT_SID", "valueString": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { "name": "TWILIO_AUTH_TOKEN",  "valueString": "<auth-token>" },
  { "name": "TWILIO_FROM_NUMBER", "valueString": "+15005550006" } ] }
```
Send:
```
POST /fhir/R4/Communication/$send-sms-twilio
```
```json
{ "resourceType": "Communication", "status": "preparation",
  "medium": [{ "coding": [{ "system": "https://terminology.hl7.org/CodeSystem/v3-ParticipationMode", "code": "SMSWRIT" }] }],
  "extension": [{ "url": "https://medplum.com/twilio-to-number", "valueString": "+15005550001" }],
  "payload": [{ "contentString": "Your appointment is tomorrow at 10am." }] }
```
Medplum stores the Twilio `MessageSid`, tracks delivery status automatically (`in-progress`→`completed`/`stopped`). Test creds: `POST /fhir/R4/Communication/$test-twilio-connection`.

**Email:** ⚠️ no `$send-email`-style operation found — nothing analogous to `$send-sms-twilio` for email. Documented pattern (`/docs/communications/external-messaging-integration-patterns`) is DIY: write a Bot that calls a third-party API (SendGrid etc.) yourself, invoked via `$execute` or a Subscription. Budget real time for this if email matters tomorrow.

**Inbound:** resolve sender via conditional reference at write time — `Patient?phone=<number>` (SMS) / `Patient?email=<address>` (email). ⚠️ Zero or multiple matches = **whole POST rejected**, no partial write.

---

## 7. React Components (`@medplum/react`) — `/docs/react`, storybook.medplum.com

```bash
npm i -D react react-dom @mantine/core @mantine/hooks @mantine/notifications postcss postcss-preset-mantine react-router
npm i -D @medplum/core @medplum/react
```
```tsx
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import '@medplum/react/styles.css';
import { BrowserRouter } from 'react-router';

const medplum = new MedplumClient({ onUnauthenticated: () => (window.location.href = '/') });
root.render(
  <BrowserRouter><MedplumProvider medplum={medplum}>
    <MantineProvider theme={createTheme({})}><App /></MantineProvider>
  </MedplumProvider></BrowserRouter>
);
```
Confirmed components (`packages/react/src`) useful for a fast dashboard: **`SearchControl`** (search/filter/list UI), **`ResourceTable`** (field table), **`ResourceForm`** (auto edit form for any resource), **`Timeline`/`ResourceTimeline`/`PatientTimeline`/`EncounterTimeline`/`ServiceRequestTimeline`** (activity feeds, comments, file upload), **`ResourceHistoryTable`** (version history), **`QuestionnaireForm`**/**`QuestionnaireBuilder`** (fill/build forms), **`PatientSummary`**/**`PatientHeader`**, **`Scheduler`**, **`ResourceBoard`** (kanban — good for Task/CarePlan), `chat/` (`ThreadChat`, `BaseChat`). Full list: https://storybook.medplum.com

`SearchControl` + `ResourceTable` + `PatientTimeline` + `QuestionnaireForm` = 80% of a dashboard with near-zero custom UI.

---

## 8. Building with AI Coding Assistants — `/docs/building-with-ai-coding-assistants`

Medplum's own guidance for using Claude Code/Cursor/Copilot to build **on** Medplum:

1. **Give the agent Medplum context** — preferred: clone https://github.com/medplum/medplum, symlink in (`ln -s /absolute/path/to/medplum medplum-link`), point the model at it. Or: docs search (Algolia) + `gh` CLI, or the **MCP server**.
2. **Plan before implementing** — model reads docs/code, proposes the pattern first; adapt an existing implementation (Medplum Provider is their reference app) over generating from scratch.
3. **Keep threads short, re-anchor on docs** — context decays over long sessions; one task per conversation, re-pull docs at checkpoints.
4. **Verify** — type-check against `@medplum/fhirtypes` + `tsc` (hallucinated fields on typed resources become compile errors), run tests/lint, and for real validation use server-side `$validate` / `$validate-code` (catches hallucinated LOINC/SNOMED/ICD codes the type system can't).
5. **Rule file** (`CLAUDE.md`/`.cursorrules`/`AGENTS.md`) survives compaction. Their common-mistakes checklist, worth reusing:
   - Messaging: thread header carries no payload; `recipient` = ALL participants incl. sender
   - Scheduling: create `Slot`s only for booked/blocked time, never open availability
   - Bundles: cross-referencing entries need `type: transaction` + `urn:uuid` fullUrls, not batch
   - Idempotent writes: conditional create/update on `identifier` (`createResourceIfNoneExist`), never search-then-create
   - Files: `createMedia`/`createBinary`/`createAttachment` → reference `Binary/{id}`, never base64 in `Attachment.data`
   - Access: patient-compartment access comes only from a resource's own compartment refs (e.g. `subject`) — doesn't propagate through `Communication.partOf`
   - FHIR **R4 only** — LLMs drift toward R5 fields
   - **Never invent SNOMED/LOINC/ICD-10 codes** — flag as placeholder for human verification

MCP setup (`/docs/ai/mcp`): add integration URL `https://api.medplum.com/mcp/stream` in Claude.ai org integrations; exposes `fhir-request` tool (full FHIR CRUD). ⚠️ Compliance: direct agent access to live PII/PHI (API token or MCP) requires a BAA with the LLM vendor; otherwise scope the access policy to non-PHI data.

---

## 9. Gotchas

- **Bots gated by default** — Super Admin must enable the `bot` project feature; check this first tomorrow morning.
- **Save ≠ Deploy** for bots — "Save" persists, "Deploy" ships. Separate buttons.
- **Bot-endpoint subscriptions never retry** — `subscription-max-attempts` only applies to external rest-hook URLs, not `Bot/<id>`.
- **Criteria can never be `AuditEvent`** — infinite notification loop.
- **`%previous` is empty on create** — naive FHIRPath `!=` criteria silently won't fire on creates.
- **AccessPolicy `criteria` is limited** — only `:not`/`:missing` modifiers; no chained searches.
- **`admin` flag ≠ AccessPolicy bypass** — only grants admin UI access.
- **Binary resources don't use compartments** — need explicit `securityContext` or patients can't reach their own files.
- **Conditional references fail the whole write** — zero or multiple matches on e.g. `Patient?phone=...` rejects the entire POST.
- **Prefer `startClientLogin(clientId, clientSecret)`** over hand-rolled OAuth POST.
- **Rate limits (per IP/min):** login 5, auth 160, everything else 6,000 (free) / 60,000 (paid). FHIR-interaction points: Read=1, Search=20, History=10, Create/Update/Delete/Patch=100 each; project quota defaults to 10x per-user limit. Check the `RateLimit` response header if things start failing.
- **FHIR R4, not R5** — both Medplum and LLM training data drift toward R5/deprecated fields.
- **`MockClient` isn't full-fidelity** — no chained search, `_include`/`_revinclude`, real auth, most `$` ops, or `$expand`. Fine for bot unit tests, not integration correctness.
- **VM Context bots are dev-only** — docs call `node:vm` explicitly "not a security mechanism."
