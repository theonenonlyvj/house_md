# house_md — the plan, no chaser (for Noah)

Full spec: `PLAN-FINAL.md`. Same plan, minus the ceremony.

## What we're building

Every doctor gets told "trust your gut." Guts miss things. We're giving one doctor a
room full of argumentative bastards instead: an AI council of specialists at a round
table, arguing the diagnosis out loud, citing the patient's actual chart, with
insurance reality sitting at the table like the buzzkill it is. The doctor runs the
room and makes every call. One click and the whole fight becomes chart documentation.

## The demo flow

1. Jane Doe loads from Medplum. Nasty case. Clues smeared across 8 years of chart
   nobody read end to end. That's the point.
2. Doctor talks — real mic, push-to-talk so side chatter doesn't derail the bots —
   then hits "Assemble council."
3. Table renders. House M.D. chairs. Specialists seat, each with a reason on display.
   Case needs a specialty we don't have? That chair stays EMPTY and House says so out
   loud. We demo the gap instead of faking the expert. That's the whole ethos.
4. The council brawls. Every claim either cites a chart resource or gets stamped
   CONJECTURE — enforced in code, because prompts lie. Evidence lands, the ranking
   flips on screen. That flip is the money shot.
5. Doctor picks the lead diagnosis. Council proposes the workup.
6. The reimbursement seat opens its mouth: live Stedi check, real numbers. The
   referral-gated consult gets shoved behind the paperwork it actually requires,
   $15 copay and all. We do not invent prices. Ever. That's how demos die.
7. Doctor hits Finalize. Chart gets ClinicalImpression + draft ServiceRequests + a
   plain-words version for the actual human patient. All of it clickable to raw JSON.

## Tech, one breath each

- One Next.js app. Custom server.js because Next routes can't hold a WebSocket.
- Brain: Deepgram-managed gpt-5-mini inside the Voice Agent. There is no other LLM
  key. Don't go looking. Don't add one.
- The model writes specialist arguments as JSON in tool calls. Server validates
  citations as aliases (E1, E2 — small models butcher UUIDs). Server renders,
  never invents.
- nova-3 ears, Aura-2 mouths. Two specialist lines audible max, rest on the board.
  Nobody talks over anybody.
- Hosted Medplum, real reads and writes. Moss digs the chart for receipts.
- Stedi test mode, one live call, scenario `uhc`. Facts or silence.

## Hard rules

- Nothing canned in the demo. Live calls, or the failure shows on screen with a
  retry button. Only sanctioned fallback: prerecorded doctor AUDIO through the real
  pipeline. A stored transcript is cheating and we don't.
- Synthetic patient, public repo. No invented medical codes, no PHI, no keys in code.
- The AI never diagnoses. It argues. The doctor decides. Say it in your sleep.

## Where things stand

- Actually works today: Stedi PoC (`stedi-poc/`), Deepgram agent + Moss (`voice-poc/`).
- Felix and we build the same plan in parallel — `builds/` — then compare, keep the
  best organs, merge into `app/`. Shared seed/audio lives at repo root. Don't fork it.
- Blocked on: Vijay's persona list, and Vijay saying "build."

## Clock — the part that kills teams

Submission 5:00pm and it's a 2-minute VIDEO, not a stage. 3:30 = full run,
screen-recorded, ugly is fine — that's the insurance take. 4:00 = tools down, record
for real. One human owns the video or nobody does. Cut order exists; the empty chair,
the cited brawl, the live Stedi call, and doctor-decides don't get cut. Everything
else is negotiable. Ship the loop.
