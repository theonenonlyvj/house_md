// Canonical domain types — the contract every lane builds against (PLAN-FINAL §3/§6).
// No UI component or integration may introduce alternative representations.

export type SessionPhase =
  | 'case-ready'
  | 'listening'
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
  organSystems: string[]; // 'cardiac' | 'renal' | 'neuro' | 'endocrine' | 'heme' | ...
  activeMeds: string[];
  redFlags: string[];
}

export type PersonaKind = 'chair' | 'skeptic' | 'specialist' | 'reimbursement';

export interface Persona {
  id: string;
  name: string;
  specialty: string;
  kind: PersonaKind;
  style: string; // one-line argument style, feeds the system prompt
  voice?: string; // Aura voice id
}

export type SeatStatus = 'seated' | 'empty' | 'human';

export interface Seat {
  specialty: string;
  status: SeatStatus;
  personaId?: string;
  personaName?: string;
  reasons: string[]; // cite case features — rendered in UI (Guardrail #1 is auditable)
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

export interface SessionState {
  phase: SessionPhase;
  patient?: PatientBanner;
  features?: CaseFeatures;
  seating?: SeatingDecision;
  transcript: ConversationTurn[];
  contributions: SpecialistContribution[];
  differential: DifferentialItem[];
  workup: CareOption[];
  selectedHypothesisId?: string;
  createdResources: CreatedResource[];
  activity?: string; // visible activity label — nothing ever silently spins
  error?: string;
}
