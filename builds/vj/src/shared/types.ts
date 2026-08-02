// Canonical domain types — the contract every lane builds against (PLAN-FINAL §3/§6).
// No UI component or integration may introduce alternative representations.

export type SessionPhase =
  | 'case-ready'
  | 'opening' // agent connected; the chair asks the clinician for the case
  | 'listening' // mic armed; the clinician is presenting
  | 'assembling' // the panel is being seated and named, one at a time
  | 'reasoning'
  | 'retrieving-evidence'
  | 'differential-ready'
  | 'hypothesis-selected'
  | 'workup-ready'
  | 'checking-benefits'
  | 'benefits-ready'
  | 'awaiting-confirmation'
  | 'writing-fhir'
  | 'complete'
  | 'recoverable-error';

export type Sex = 'male' | 'female' | 'other';

export interface CaseFeatures {
  age: number;
  sex: Sex;
  chiefComplaint: string;
  /** Ranked by evidence weight — the loudest system first. Drives seating order. */
  organSystems: string[]; // 'cardiac' | 'renal' | 'neuro' | 'endocrine' | 'heme' | ...
  /** system → the terms that actually matched, so every seat can show its receipts. */
  systemEvidence?: Record<string, string[]>;
  activeMeds: string[];
  redFlags: string[];
}

export type PersonaKind = 'chair' | 'skeptic' | 'specialist' | 'reimbursement';

export interface Persona {
  id: string;
  name: string;
  specialty: string;
  kind: PersonaKind;
  /** What this specialist looks at FIRST in an undifferentiated case. Feeds the prompt. */
  lens: string;
  /** Argumentative temperament and rhetorical habit — never case knowledge. */
  style: string;
  voice?: string; // Aura voice id
  voiceNote?: string; // human-readable signature, for the roster UI
  avatar: string;
}

export type SeatStatus = 'seated' | 'empty' | 'human';

export interface Seat {
  specialty: string;
  status: SeatStatus;
  personaId?: string;
  personaName?: string;
  reasons: string[]; // cite case features — rendered in UI (Guardrail #1 is auditable)
  // Set when the chair names this seat during assembly. The room fills in the order
  // they are announced, so the UI reveal is driven by the actual voice, not a timer.
  arrivedAt?: number;
}

export interface SeatingDecision {
  seats: Seat[]; // includes empty seats (status 'empty') and the human clinician seat
}

// Evidence travels as short aliases (E1, E2…) — the model never carries raw IDs.
export interface EvidenceRef {
  alias: string;
  resourceType: string;
  resourceId: string;
  display: string;
  fact: string;
  date?: string; // effective/performed date — powers the chronological sweep
}

export interface Argument {
  claim: string;
  aliases: string[]; // citation aliases the model provided
  provenance: 'cited' | 'conjecture'; // COMPUTED by the validator, never model-asserted
  resolved: EvidenceRef[]; // aliases that resolved against the record
}

export interface SpecialistContribution {
  personaId: string;
  specialty: string;
  interpretation: Argument; // leading interpretation + strongest support
  contradiction?: Argument; // strongest contradiction/uncertainty
  discriminator?: string; // one discriminating question or next step
}

export type DifferentialStatus = 'candidate' | 'leading' | 'deprioritized' | 'removed';

export interface DifferentialItem {
  id: string;
  display: string;
  rank: number;
  assessment: string;
  status: DifferentialStatus;
  supporting: Argument[];
  contradicting: Argument[];
  lastChangedBy?: string; // turn/persona that moved it — powers "what moved the board"
}

export interface BenefitFacts {
  payer: string;
  planActive?: boolean;
  copay?: string;
  deductibleRemaining?: string;
  oopRemaining?: string;
  network?: string;
  messages: string[]; // payer messages verbatim (e.g. referral required)
  matched: boolean; // false → UI says "no benefit information returned"
}

export interface CareOption {
  id: string;
  display: string;
  purpose: string;
  priority: 'now' | 'next' | 'later';
  selected: boolean;
  sequenceNote?: string; // e.g. "scheduled behind required PCP referral"
  benefit?: BenefitFacts;
}

export interface ConversationTurn {
  role: 'clinician' | 'chair' | 'specialist' | 'system';
  personaId?: string;
  text: string;
  at: number;
}

export interface CreatedResource {
  resourceType: string;
  id: string;
  display: string;
}

export interface PatientBanner {
  name: string;
  dob: string;
  synthetic: true;
  payer: string;
  medplumId?: string;
}

// ---- The notepad: the scribe's running minutes ----
// Written from tool calls as they land, never by a second model. Every point keeps
// the citation the claim carried, so the notepad and the argument can't drift apart.

export type NoteKind =
  | 'evidence' // a chart fact the panel put on the record
  | 'position' // what a specialist argued
  | 'direction' // the leading hypothesis, and who moved it
  | 'plan' // a proposed next step
  | 'coverage' // what the eligibility check actually returned
  | 'written'; // posted to the chart

export interface NoteEntry {
  id: string;
  kind: NoteKind;
  speaker?: string; // short label — PULMO, HOUSE, YOU
  personaId?: string;
  text: string;
  detail?: string; // second line: purpose, assessment, sequencing note
  cites: EvidenceRef[]; // resolved citations, so the note is auditable
  provenance?: 'cited' | 'conjecture';
  priority?: 'now' | 'next' | 'later'; // plan entries only
  at: number;
}

export interface SessionState {
  caseId: string; // which case in src/case/cases.ts this session is running
  phase: SessionPhase;
  patient?: PatientBanner;
  features?: CaseFeatures;
  seating?: SeatingDecision;
  transcript: ConversationTurn[];
  contributions: SpecialistContribution[];
  differential: DifferentialItem[];
  workup: CareOption[];
  notepad: NoteEntry[];
  selectedHypothesisId?: string;
  createdResources: CreatedResource[];
  // Pulled once when the chart loads so the provider page can show coverage before
  // the consult starts; the same parsed result is what the advocate speaks from.
  benefits?: BenefitFacts;
  // Who is audibly speaking RIGHT NOW — set when playback of their line starts and
  // cleared when it ends. The seat highlight follows this, not a timeout heuristic.
  speakingPersonaId?: string;
  activity?: string; // visible activity label — nothing ever silently spins
  error?: string;
}
