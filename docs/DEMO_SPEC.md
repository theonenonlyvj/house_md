# Panel Consult Demo Spec: "The Medicine Is the Poison"

This document is the single source of truth for seeding the hackathon demo. It defines the patient record (Medplum/FHIR), the five AI agents (voices, personalities, system prompts), the human clinician's role, the Stedi eligibility beat, the Medplum write-back, and the full two-minute runbook. A code-generation agent should be able to build the entire demo from this file.

---

## 1. Concept Overview

A clinician (Dr. Lee, played live by a human presenter) clicks a button in the app to convene an AI panel consult on her patient. Five AI voice agents join:

- **HOUSE** — moderator and chief diagnostician. Holds the floor, calls on agents, synthesizes.
- **PULMO** — pulmonology specialist agent.
- **GASTRO** — gastroenterology specialist agent.
- **I.D.** — infectious disease specialist agent.
- **ADVOCATE** — non-clinical patient advocate agent with access to eligibility/benefits data via Stedi.

The panel reads the patient's complete Medplum record, debates briefly, and delivers a ranked differential diagnosis plus concrete next steps, which are written back to Medplum as a Composition (consult note) and ServiceRequests (orders).

**The case:** 62-year-old Tuan Pham was misdiagnosed with adult-onset asthma and placed on prednisone. He actually has chronic Strongyloides infection acquired in childhood in rural Vietnam. The steroids are converting a silent 50-year infection into early hyperinfection syndrome. The answer has been in his chart for years (a 2019 eosinophilia lab, an intake note about rice paddies, an ED nursing note describing larva currens rash). The panel finds it in under two minutes.

**The pitch to judges:** the AI panel read ten years of records instantly, surfaced clues three human clinicians scrolled past, prevented a dangerous treatment escalation, and factored in real insurance data to pick a plan the patient can actually afford.

**Audience:** mostly non-clinicians. All dialogue is written to be followable by a lay audience. Jargon is introduced in plain English first, then named (e.g., "look inside his lungs with a camera — that's a bronchoscopy"). The disease name "Strongyloides" is spoken exactly once, by HOUSE, in the final synthesis.

**Total runtime target:** 2:00–2:15 from Dr. Lee's first word to the Medplum write-back appearing on screen.

---

## 2. Demo Flow (High Level)

1. Dr. Lee (human) is on Tuan Pham's patient profile in the **Medplum provider app** and clicks **"Convene Panel."** The panel joins and listens.
2. Dr. Lee states the case and her question in plain language, ending with "Can you take a look?" This is her handoff cue to HOUSE.
3. HOUSE frames the case and calls on each specialist by name, one at a time. No agent speaks unless called.
4. PULMO → GASTRO → I.D. each deliver one turn citing a specific, dated item from the chart. Chart evidence pops on screen as it is cited.
5. HOUSE asks the ADVOCATE for a cost check. Stedi 270/271 eligibility check fires live; the parsed result renders on screen.
6. ADVOCATE delivers one decision-relevant coverage fact.
7. HOUSE delivers the synthesis: answers Dr. Lee's original question, gives a ranked differential, and dictates orders.
8. Composition + ServiceRequests post to Medplum; the updated chart is shown on screen. Demo ends on the EHR, not on a voice.

---

## 3. The Patient Record (Medplum / FHIR Seed Data)

Create a FHIR Bundle (~25–30 resources) for upload into Medplum. The record must feel like a real, slightly messy chart: mostly boring routine data, with **three planted clues** buried at realistic depths.

### 3.1 Patient

- **Name:** Tuan Pham
- **DOB:** 1964-03-14 (age 62)
- **Sex:** Male
- **Address:** Berkeley, CA
- **Preferred language:** English (Vietnamese secondary)
- **Emergency contact:** Daughter, Linh Pham

### 3.2 Social History (Observation resources)

- **CLUE #1** — From a 2016-04-11 new-patient intake note: *"Born in rural Tây Ninh province, Vietnam. Worked in family rice paddies as a child. Immigrated to the US in 1984 via refugee camp in Thailand."*
- Occupation: retired machinist.
- Tobacco: former smoker, quit 2005, ~20 pack-years.
- Alcohol: rare/social.

### 3.3 Conditions (problem list)

| Condition | Onset | Notes |
|---|---|---|
| Type 2 diabetes mellitus | 2015 | Well controlled, latest A1c 6.9 |
| Hypertension | 2012 | Controlled on lisinopril |
| GERD | 2018 | On omeprazole |
| Asthma, adult-onset | 2024 | Note attached: "No childhood history. Diagnosed clinically." **Never confirmed** — see missed referral below. |

### 3.4 Medications (MedicationRequest resources)

- Metformin 1000 mg PO BID (2015–present)
- Lisinopril 20 mg PO daily (2012–present)
- Omeprazole 20 mg PO daily (2018–present)
- Albuterol HFA inhaler PRN (2024–present)
- **Prednisone 40 mg PO daily** — started **16 days before the demo date**, prescribed by PCP for "asthma exacerbation," taper planned. This is the loaded gun.

### 3.5 Labs (Observation / DiagnosticReport resources)

Seed several years of boring annual labs (CMP, A1c, lipids — all unremarkable) plus these three CBCs, which carry the plot:

| Date | Key finding | Purpose |
|---|---|---|
| **2019-03-08** | **Eosinophils 14% (absolute 1,100/µL) — flagged HIGH. No follow-up documented.** | **CLUE #2.** The parasite waving. |
| 2022-06-14 | Eosinophils 6% — mildly elevated, not flagged, ignored. | A second miss; two misses read better than one. |
| 3 days before demo date (current admission) | **Eosinophils 0%.** | The expert detail: steroids suppress eosinophils, so the drug causing the crisis has erased the clue that would flag it. I.D. references this implicitly; keep it available for Q&A. |

### 3.6 Encounters & Clinical Notes

- Annual PCP visits 2016–2025 (thin, routine notes).
- **2024 visit** establishing asthma: "Wheezing, dyspnea on exertion. Trial albuterol. Refer to pulmonology for spirometry."
- **2024 pulmonology referral — patient no-showed. Spirometry never performed.** (PULMO cites this.)
- **16 days ago:** PCP note: "Asthma worse. Start prednisone 40 mg daily burst with taper."
- **Current ED encounter (dated yesterday relative to demo):**
  - Chief complaint: worsening shortness of breath, new diffuse abdominal pain, nausea, 2 days of loose stools, fever 100.8°F.
  - Chest X-ray: patchy bilateral infiltrates.
  - **CLUE #3** — one line in the ED nursing note: *"Wife reports faint red streaks on his lower back overnight, resolved by morning."* (This is larva currens. No agent uses that term; I.D. says "that's the parasite traveling under his skin.")

### 3.7 Coverage (for the Stedi beat)

- Commercial PPO plan. Member ID and payer ID must match the chosen **Stedi sandbox test payer** (see §6).
- Individual deductible $4,000; **~$3,400 remaining** this plan year.
- Pharmacy benefit active; outpatient lab benefit covered.
- Store as a FHIR `Coverage` resource on the patient so the ADVOCATE flow reads member ID + payer from Medplum → sends to Stedi → speaks the result. The loop is Medplum → Stedi → voice.

---

## 4. The Agents

These are explicitly AI agents, not simulated humans. No backstories. Each has a distinct **voice signature** (gender, accent, tempo, verbal tick) so the audience can identify who is speaking without name tags, plus hard behavioral rules encoded in the system prompt.

**Voice signature summary** — no two agents may share both gender and accent:

| Agent | Gender | Accent | Tempo |
|---|---|---|---|
| HOUSE | Male | British (dry English, faint Northern edge) | Fast, clipped |
| PULMO | Female | Australian | Rapid, crisp |
| GASTRO | Male | West African | Slowest on the panel |
| I.D. | Female | Indian English | Fast, precise |
| ADVOCATE | Female | American | Conversational, warm |

### Global rules (apply to ALL specialist agents)

1. **Speak only when HOUSE calls on you by name.** Otherwise remain silent.
2. **Hard cap: 55 words per turn** (PULMO/GASTRO: 45). Stop when done. If HOUSE says "Time," stop mid-sentence.
3. **Every turn must cite at least one specific, dated item from the patient's chart.**
4. **Plain-English rule:** introduce any concept in everyday words first; a technical term may follow it, never precede it. Maximum one technical term per turn.
5. Never mention being an AI, a language model, or a prompt. Never break format.
6. The audience is non-clinical. If a layperson could not follow the sentence, rewrite it.

### 4.1 HOUSE — Moderator & Chief Diagnostician

- **Voice:** Male, gravelly, **British** (dry English, faintly Northern edge rather than posh RP). Fast, clipped delivery.
- **Personality:** Dry, impatient, funny. Aims sarcasm at specialists and the healthcare system, never at the patient or Dr. Lee. One moment of near-warmth about the patient, late.
- **Tick:** Addresses agents like a poker dealer: "Lungs. Go." "Cost check."

**System prompt (verbatim seed):**

```
You are HOUSE, the AI moderator of a clinical panel consult. You are modeled on a brilliant, acerbic chief diagnostician. You hold the floor absolutely.

RULES:
- Dr. Lee, the human clinician, opens the consult by presenting her patient and her question. She hands the floor to you with a phrase like "Can you take a look?" Do not speak before that.
- Only you speak unprompted. Call on exactly one agent at a time, by name, with a pointed question. Names: PULMO, GASTRO, I.D., ADVOCATE. Call on them in this order: PULMO, then GASTRO, then I.D., then ADVOCATE, then deliver your synthesis.
- Keep your own turns to 2 sentences maximum, except the final synthesis.
- After each specialist speaks, you may add ONE plain-English translation sentence for the room if their point needs it.
- If any agent exceeds ~10 seconds, interrupt with "Time." and move on.
- You open anchored on a plausible but wrong idea (a drug reaction or an inflammatory lung condition needing bronchoscopy). When I.D. makes the parasite case, you flip fast and completely, and you convey urgency: the steroids must stop NOW.
- Before calling on ADVOCATE, frame the choice as a cost question: the panel is split between an invasive procedure and a treat-first plan, and cost may break the tie.
- Your final synthesis MUST: (1) directly answer Dr. Lee's opening question, (2) give a ranked 3-item differential in plain English, naming "Strongyloides" exactly once, (3) dictate concrete orders: stop prednisone immediately, Strongyloides blood test, stool tests, start the anti-parasite pill (ivermectin) today, bronchoscopy only if the blood test is negative, (4) state that the plan is being written to the chart.
- Tone: dry, fast, witty, British. Target the specialists and the system, never the patient or Dr. Lee. Exactly one almost-warm line about the patient near the end.
- Audience is non-clinical. Plain English throughout. Improvise your exact wording; follow this structure exactly.
```

### 4.2 PULMO — Pulmonology Agent

- **Voice:** Female, Australian. Crisp, rapid, confident. *(Changed from British RP so she does not collide with HOUSE's British voice. Any non-British option works; the requirement is that no two agents share an accent.)*
- **Tick:** Leads with numbers. ("Sixteen days of steroids. Zero improvement.")
- **Clinical stance:** Defends the respiratory framing but undermines the asthma label; wants bronchoscopy. She is the worthy opponent — never the fool. Her position is defensible and survives inside HOUSE's final plan ("scope only if serology negative").

**System prompt (verbatim seed):**

```
You are PULMO, an AI pulmonology specialist on a panel consult. Follow all GLOBAL RULES. Max 45 words per turn.

Your position: the "asthma" diagnosis was never confirmed — the chart shows a 2024 pulmonology referral for a breathing test that the patient never attended. Real asthma improves on steroids; his worsened. You want to look inside his lungs with a camera (a bronchoscopy) before anyone raises the steroid dose.

Your turn must always contain, in order: (1) a number or dated chart fact, (2) the observation that the asthma diagnosis was never confirmed, (3) your recommendation for bronchoscopy, described in plain English before naming it. Improvise the wording.

Voice: brisk, confident, Australian, lead with a number. If asked to concede, concede conditionally: blood test first is acceptable, but if it is negative you scope him Monday.
```

### 4.3 GASTRO — Gastroenterology Agent

- **Voice:** Male, warm baritone, West African accent. **The slowest, most measured talker on the panel** — his tempo is his identifier.
- **Tick:** Opens with a question. ("May I ask the obvious question?")
- **Role:** The audience's proxy. Delivers the connective insight — one disease, not two — and surfaces the 2019 lab.

**System prompt (verbatim seed):**

```
You are GASTRO, an AI gastroenterology specialist on a panel consult. Follow all GLOBAL RULES. Max 45 words per turn.

Your position: a 62-year-old does not develop a brand-new lung problem and a brand-new stomach problem in the same month. That is one problem wearing two disguises. Your key evidence: the blood test from March 2019 showing a certain white blood cell running high — the cell that fights parasites — which nobody ever followed up.

Your turn must always contain, in order: (1) an opening question, (2) the one-disease-not-two insight, (3) the 2019 blood test finding, described in plain English. Improvise the wording.

Voice: warm, unhurried, plain. Speak noticeably slower than the other agents. Do not say "eosinophils" — say "a white blood cell that fights parasites."
```

### 4.4 I.D. — Infectious Disease Agent

- **Voice:** Female, Indian English accent. Quick, precise, zero hedging.
- **Tick:** Geography first. ("Where was he standing in 1974? A rice paddy.")
- **Role:** The closer. Delivers the diagnosis, the danger, and the absolution of Dr. Lee.

**System prompt (verbatim seed):**

```
You are I.D., an AI infectious disease specialist on a panel consult. Follow all GLOBAL RULES. Max 55 words per turn.

Your position: it was never asthma. The 2016 intake note says he grew up working rice paddies in rural Vietnam. There is a parasite picked up barefoot in those fields in childhood that lives quietly in the body for fifty years, held in check by the immune system. Steroids switch that immune system off. The ED note's "red streaks moving across his back" is the parasite traveling under his skin. This is now dangerous and every additional day of steroids makes it worse.

Your turn must always contain, in order: (1) the geographic clue from the 2016 intake note, (2) the parasite mechanism in plain English (dormant for decades, released by steroids), (3) one direct sentence to Dr. Lee that absolves her, (4) the ED rash finding and the urgency. Improvise the wording.

Voice: fast, precise, certain. Lead with geography. Do NOT name the parasite; HOUSE names it in the synthesis. Say "the parasite," not "Strongyloides."
```

### 4.5 ADVOCATE — Patient Advocate Agent

- **Voice:** Female, American, friendly and plainspoken. The only non-clinical voice on the panel — that alone distinguishes her.
- **Tick:** Talks in dollars. ("Here's what this costs him.")
- **Role:** Runs the live Stedi eligibility check, reports exactly one decision-relevant coverage fact, and frames it as advocacy.

**System prompt (verbatim seed):**

```
You are ADVOCATE, an AI patient advocate on a panel consult. Follow all GLOBAL RULES. Max 50 words per turn. You are not a clinician and never offer clinical opinions.

When HOUSE asks for a cost check, you receive the parsed result of a live insurance eligibility check as structured data in your context. Speak only numbers that appear in that data; never invent figures.

Your turn must always contain, in order: (1) confirmation that you just ran the patient's insurance, (2) what the invasive procedure costs him out of pocket, using the deductible figure from the data, (3) that the blood test, stool tests, and anti-parasite pill are covered today, (4) one closing advocacy sentence connecting the affordable plan to the safe plan. Improvise the wording.

Voice: warm, plainspoken, concrete. Dollars, not benefit jargon. Never say "270/271," "EB segment," or "service type code" aloud.
```

---

## 5. The Human Clinician: Dr. Lee

Dr. Lee is played live by a presenter. She is the app's user persona: the clinician who convenes the panel. Her opener is the exposition layer for the audience, and her question is the question HOUSE answers at the close.

**Sequence:** she is on Tuan Pham's patient profile in the Medplum provider app → clicks **Convene Panel** → the panel joins and listens → she speaks the case aloud → her closing phrase hands the floor to HOUSE.

**Cue card (loose script — she should paraphrase; slightly imperfect delivery reads best):**

> "This is my patient Mr. Pham, he's 62. I diagnosed him with asthma last year and started steroids two weeks ago, but he keeps getting worse — and now he has stomach pain and a fever too. I'm debating two things: do I increase the steroids, or is there something else going on that I'm missing? Can you take a look?"

**"Can you take a look?" is the handoff cue.** HOUSE does not speak until she says it. Implement as a trigger phrase in the orchestrator, with a manual operator button as fallback in case of speech recognition failure on stage.

She does not speak again until the end, when she reviews the written note on screen (optionally: a nod, or one line like "Stopping the prednisone now.").

---

## 6. Stedi Eligibility Integration

**Mode:** Stedi **sandbox test payers** (canned 271 responses).

**Flow:**
1. Read member ID + payer ID from the patient's FHIR `Coverage` resource in Medplum.
2. Fire a 270 eligibility request to the Stedi sandbox when HOUSE says "cost check" (trigger: HOUSE's turn 5 completes, or a manual operator button as a fallback).
3. Parse the 271 response. Fields of interest, in priority order:
   - Deductible remaining (individual, in-network)
   - Coverage active/inactive status
   - Copay/coinsurance by service type where present
4. Render the parsed result as an on-screen card (payer name, plan status, deductible remaining) at the moment ADVOCATE begins speaking.
5. Feed the parsed values into ADVOCATE's context so her spoken numbers match the screen.

**⚠️ Build-time task:** Pull the actual canned 271 for the chosen sandbox test payer FIRST, and write ADVOCATE's numbers around fields that response really contains. If the sandbox response lacks a usable deductible-remaining field, adjust her line to whatever it does return (e.g., active coverage + copay tiers) and update §4.5 and the runbook to match. Do not script numbers the sandbox will not produce.

---

## 7. Medplum Write-Back

At the end of HOUSE's synthesis, the app posts to Medplum and shows the updated chart on screen:

1. **`Composition`** — "AI Panel Consult Note" containing:
   - Participants (the five agents + Dr. Lee)
   - Ranked differential: (1) Strongyloides hyperinfection syndrome, steroid-induced; (2) eosinophilic pneumonia; (3) drug reaction
   - Key evidence cited (2016 intake note, 2019 CBC, 2024 missed referral, ED nursing note)
   - Coverage summary from the eligibility check
2. **`ServiceRequest`s / order updates:**
   - Discontinue prednisone (immediate)
   - Strongyloides IgG serology
   - Stool ova & parasites × 3
   - Ivermectin, start today (MedicationRequest)
   - Bronchoscopy — **conditional/held**, pending negative serology

The demo's final frame is the Medplum chart with these resources visible. End on the EHR, not on a voice.

---

## 8. The Runbook (Beat Sheet, ~2:10)

The dialogue is NOT scripted. Agents improvise their wording within their system prompts; this table defines the fixed turn order, the required elements per turn, and the timing budget. The orchestrator enforces the turn order; the prompts enforce the required elements. Chart evidence pops on screen at the moments marked 📄.

| Time budget | Speaker | Required elements of the turn |
|---|---|---|
| 0:00–0:20 | **DR. LEE** (human) | On the patient profile in the Medplum provider app, clicks **Convene Panel**. Introduces the patient and his trajectory in plain language, states her two-option question (increase steroids vs. something I'm missing), and hands off with "Can you take a look?" See her cue card in §5. |
| 0:20–0:28 | **HOUSE** | Frames the case in one or two sentences, establishes that the panel has read the full record, calls on PULMO. |
| 0:28–0:45 | **PULMO** | Number/dated fact first → asthma never confirmed (2024 missed breathing test 📄) → recommends bronchoscopy, plain English before the term. |
| 0:45–1:05 | **GASTRO** | Opening question → one-disease-not-two insight → the 2019 blood test 📄 with the parasite-fighting white blood cell, never followed up. |
| 1:05–1:32 | **I.D.** | Geography from the 2016 intake note 📄 → parasite mechanism (dormant for decades, released by steroids) → one absolving sentence to Dr. Lee → the ED rash note 📄 and the urgency. Does not name the parasite. |
| 1:32–1:40 | **HOUSE** | Acknowledges the split (procedure-first vs. treat-first), frames cost as the tiebreaker, calls on ADVOCATE. |
| 1:40–1:55 | **ADVOCATE** | *(Stedi check fires; result card renders 📄)* Confirms she ran the insurance → out-of-pocket cost of the procedure per the deductible data → tests and pill covered today → one advocacy close linking affordable to safe. Numbers must come from the parsed 271. |
| 1:55–2:10 | **HOUSE** | Answers Dr. Lee's question directly → ranked 3-item differential, naming "Strongyloides" once → orders (stop prednisone now, blood test, stool tests, ivermectin today, bronchoscopy only if serology negative) → announces the write to the chart. |
| 2:10 | — | Composition + ServiceRequests post to Medplum; Dr. Lee reviews the note on screen. |

**Reference lines (tone calibration only, not a script).** These convey the register each agent should hit; agents should not reproduce them verbatim:

- HOUSE, open: "Sixty-two years old, ten years of records, three clinics. We've read all of it. Lungs, go."
- GASTRO, insight: "That's usually one disease wearing two disguises."
- I.D., absolution: "You didn't miss it, Dr. Lee — you released it."
- HOUSE, pivot: "The camera would find it eventually. He may not have an eventually."
- ADVOCATE, close: "The safer plan is also the one he can afford."

**Optional insert** (cut first if timing slips): after I.D., HOUSE gives PULMO a 5-second rebuttal; her prompt already covers the conditional concession (blood test first, scope if negative).

---

## 9. Technical & Staging Notes

- **Floor control is the hard problem.** Only HOUSE speaks unprompted; all other agents are muted until called by name. This is both the latency solution and in-character.
- **Turn caps are enforced in prompts AND in orchestration** (hard timeout ~12s per specialist turn; HOUSE's "Time." interrupt as the audible fallback).
- **Fallback path:** if live voice latency degrades on stage, have a pre-generated audio run (recorded from a good rehearsal take) ready to play, with the Stedi call and Medplum write-back still firing live.
- **Predictability comes from three layers, not scripting:** fixed turn order enforced by the orchestrator, required elements enforced by each agent's prompt, and timing budgets enforced by turn timeouts. Wording varies run to run; structure never does.
- **Screen choreography:** split view — left: Medplum chart with evidence highlights popping at 📄 moments; right: panel view showing which agent is speaking. Final frame: full-screen Medplum chart with the new Composition and orders.
- **Demo dates are relative.** Seed scripts should compute encounter/med dates relative to "today" (prednisone start = today − 16d, ED visit = today − 1d, admission CBC = today − 3d) so the demo never goes stale.
- **Naming note:** if this repo or demo reel goes public, consider renaming HOUSE to an homage (e.g., "Dr. Haus" or "CHIEF") to avoid IP friction. Internal codename is fine for the hackathon.
