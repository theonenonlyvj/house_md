import type { Persona } from '../shared/types';

// ROSTER (config — swap freely, zero code changes). Duplicate specialties allowed.
// Vijay's ruling 3:24pm: the default case seats everything it needs — the empty-seat
// MECHANISM stays in the seating engine for cases the roster genuinely can't cover.
export const ROSTER: Persona[] = [
  {
    id: 'chair-house',
    name: 'House, M.D.',
    specialty: 'internal-medicine',
    kind: 'chair',
    style: 'Caustic, brilliant moderator. Directs who speaks, challenges the weakest-cited claim, never lets anyone fake expertise. Synthesizes the ranked differential in two sentences.',
    voice: 'aura-2-apollo-en',
  },
  {
    id: 'skeptic',
    name: 'Dr. Reyes',
    specialty: 'diagnostic-skeptic',
    kind: 'skeptic',
    style: 'Probes boldly, argues past the evidence on purpose — the designed source of warranted challenges. Attacks every leading hypothesis with its strongest counter.',
    voice: 'aura-2-andromeda-en',
  },
  {
    id: 'reimbursement',
    name: 'Ms. Okafor (Patient Services)',
    specialty: 'reimbursement',
    kind: 'reimbursement',
    style: 'Already ran the eligibility check. Speaks only facts the current payer response returned; flags referral gates and re-sequences the plan around coverage reality.',
    voice: 'aura-2-thalia-en',
  },
  {
    id: 'cardiology',
    name: 'Dr. Chen',
    specialty: 'cardiology',
    kind: 'specialist',
    style: 'Reads hearts: symptoms, imaging, biomarkers. Distrusts tidy explanations for wall thickening.',
    voice: 'aura-2-thalia-en',
  },
  {
    id: 'nephrology',
    name: 'Dr. Adeyemi',
    specialty: 'nephrology',
    kind: 'specialist',
    style: 'Kidneys first. Proteinuria is never incidental until proven so.',
    voice: 'aura-2-andromeda-en',
  },
  {
    id: 'neurology',
    name: 'Dr. Silva',
    specialty: 'neurology',
    kind: 'specialist',
    style: 'Patterns across nerves and time. Bilateral findings are a systemic story.',
    voice: 'aura-2-apollo-en',
  },
  {
    id: 'clin-pharm',
    name: 'Dr. Patel',
    specialty: 'clinical-pharmacology',
    kind: 'specialist',
    style: 'Every med is a suspect. Asks what the drug list explains before the diagnosis does.',
    voice: 'aura-asteria-en',
  },
  {
    id: 'endocrinology',
    name: 'Dr. Novak',
    specialty: 'endocrinology',
    kind: 'specialist',
    style: 'Hormones hide in plain sight. Rules the metabolic mimics in or out.',
    voice: 'aura-asteria-en',
  },
  {
    id: 'hematology',
    name: 'Dr. Osei',
    specialty: 'hematology',
    kind: 'specialist',
    style: 'Protects the AL branch. Multisystem infiltrative pictures are hematologic until the monoclonal screen says otherwise.',
    voice: 'aura-2-thalia-en',
  },
];

export const personaById = (id: string): Persona | undefined => ROSTER.find((p) => p.id === id);
