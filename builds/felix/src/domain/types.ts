import type { Resource } from '@medplum/fhirtypes';

export type Specialty =
  | 'chair'
  | 'cardiology'
  | 'hematology'
  | 'neurology'
  | 'nephrology'
  | 'internal-medicine'
  | 'reimbursement'
  | 'skeptic';

export type IntegrationName = 'medplum' | 'deepgram' | 'moss' | 'stedi';
export type OperationState = 'idle' | 'working' | 'ready' | 'error';

export interface IntegrationStatus {
  state: OperationState;
  detail: string;
  updatedAt?: string;
}

export interface Persona {
  id: string;
  name: string;
  specialty: Specialty;
  argumentStyle: string;
  systemPrompt: string;
  voiceId: string;
  standing?: boolean;
}

export interface CaseFeatures {
  chiefComplaint: string;
  organSystems: string[];
  medications: string[];
  age?: number;
  sex?: string;
  presentation: string;
  recordText: string[];
}

export interface Seat {
  id: string;
  label: string;
  specialty: Specialty;
  kind: 'chair' | 'human' | 'specialist' | 'reimbursement' | 'empty';
  persona?: Persona;
  reason: string;
  active?: boolean;
}

export interface EvidenceItem {
  alias: string;
  resourceId: string;
  resourceType: string;
  title: string;
  summary: string;
  date?: string;
  score?: number;
  raw?: Resource;
}

export interface Claim {
  text: string;
  citations: string[];
  resolvedResourceIds: string[];
  grounding: 'record-cited' | 'general-reasoning' | 'conjecture';
  demotionReason?: string;
}

export interface Contribution {
  id: string;
  personaId: string;
  leadingInterpretation: Claim;
  strongestSupport: Claim;
  contradiction: Claim;
  discriminatingStep: Claim;
  challenged?: boolean;
}

export interface DifferentialItem {
  id: string;
  label: string;
  rank: number;
  confidence: 'leading' | 'considering' | 'lower';
  movement: 'up' | 'down' | 'new' | 'same';
  rationale: Claim;
  selected?: boolean;
}

export interface BenefitFact {
  label: string;
  value: string;
  qualifier: 'reported' | 'estimate' | 'missing';
}

export interface WorkupItem {
  id: string;
  label: string;
  rationale: string;
  kind: 'lab' | 'consult' | 'imaging' | 'other';
  sequence: number;
  selected: boolean;
  dependsOn?: string[];
  referralGate?: boolean;
  benefits: BenefitFact[];
}

export interface CoverageProjection {
  status: 'active' | 'inactive' | 'error';
  payer: string;
  plan?: string;
  checkedAt: string;
  traceId?: string;
  message?: string;
  referralRequired: boolean;
  specialistCopay?: number;
  deductibleRemaining?: number;
  oopRemaining?: number;
}

export interface CreatedResource {
  key: string;
  label: string;
  reference: string;
  resource: Resource;
}

export interface PatientSummary {
  reference: string;
  display: string;
  birthDate?: string;
  age?: number;
  sex?: string;
  payer: string;
  synthetic: true;
  resourceCount: number;
}

export interface SessionState {
  id: string;
  status: 'loading' | 'presenting' | 'assembled' | 'debating' | 'planning' | 'finalized' | 'error';
  patient: PatientSummary | null;
  presentation: string;
  transcript: string;
  seats: Seat[];
  evidence: EvidenceItem[];
  evidenceSearch?: { query: string; scanned: number; hits: number; mode: 'moss' };
  contributions: Contribution[];
  differential: DifferentialItem[];
  workup: WorkupItem[];
  coverage: CoverageProjection | null;
  createdResources: CreatedResource[];
  integrations: Record<IntegrationName, IntegrationStatus>;
  error?: string;
  revision: number;
  updatedAt: string;
}
