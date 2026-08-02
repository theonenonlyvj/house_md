import type { CaseFeatures, Persona, Seat, SeatingDecision } from '../shared/types';

// Guardrail #1 — seating is REAL, not scripted. Pure and deterministic: the chart
// plus what the clinician actually said out loud → organ systems → required
// specialties, matched against whatever bench exists.
//
// Two properties this file has to keep:
//   1. Changing the record changes the panel. No case may hardcode its own cast.
//   2. A required specialty the bench cannot fill renders EMPTY and the chair says
//      so on the record. Nobody improvises expertise that is not in the room.
//
// The clinician's spoken presentation is weighted more heavily than the chart,
// because what they chose to say out loud is the best available signal about what
// they are actually worried about.

const PRESENTATION_WEIGHT = 3;
/** Panel size cap. A long chart lights up more systems than a consult can hear from. */
export const MAX_SPECIALISTS = 4;

export const SYSTEM_KEYWORDS: Record<string, RegExp> = {
  pulmonary: /wheez|asthma|inhaler|albuterol|spirometry|infiltrate|shortness of breath|dyspn|bronch|respiratory|lung/gi,
  gi: /abdominal|stool|nausea|gerd|bowel|vomit|diarrhea|diarrhoea|hepatic|liver|transaminase|splenomegaly/gi,
  infectious: /fever|febrile|infect|parasit|eosinophil|refugee|endemic|larva|rash|culture|serolog|antibiotic|abscess|endocarditis/gi,
  cardiac: /echocardiogram|ventricular|troponin|nt-probnp|heart failure|ejection fraction|cardiac|syncope|atrial fibrillation|ecg|qrs/gi,
  renal: /proteinuria|nephro|creatinine|renal|kidney|egfr/gi,
  neuro: /neuropathy|orthostatic|carpal tunnel|nerve conduction|seizure|numbness|stenosis|emg/gi,
  // Deliberately NOT matching a1c or a routine thyroid replacement dose: a stable,
  // well-controlled chronic condition is a bystander, and seating a specialist for
  // one crowds out the specialty the case actually turns on.
  endocrine: /thyroid disease|hypothyroid|hyperthyroid|adrenal|uncontrolled diabet|hyperglyc|pituitary|cortisol/gi,
  heme: /anemia|anaemia|cytopenia|monoclonal|light.chain|paraprotein|platelet|marrow|ferritin|electrophoresis/gi,
  rheum: /arthralgia|arthritis|joint pain|joint swelling|rheumat|synovitis|autoimmun|vasculitis|antinuclear|uveitis|still.s disease/gi,
  pharm: /prednisone|steroid|beta blocker|metoprolol|uptitrat|drug reaction|adverse effect|polypharmacy|dose increase/gi,
};

const SYSTEM_TO_SPECIALTY: Record<string, string> = {
  pulmonary: 'pulmonology',
  gi: 'gastroenterology',
  infectious: 'infectious-disease',
  cardiac: 'cardiology',
  renal: 'nephrology',
  neuro: 'neurology',
  endocrine: 'endocrinology',
  heme: 'hematology',
  rheum: 'rheumatology', // deliberately unfilled by the bench — see personas.ts
  pharm: 'clinical-pharmacology',
};

/** Human-readable seat reason, built from the terms that actually matched. */
function reasonFor(system: string, evidence: string[]): string {
  const sample = [...new Set(evidence.map((e) => e.toLowerCase()))].slice(0, 3);
  return sample.length ? `record mentions ${sample.join(', ')}` : `${system} findings in the record`;
}

export function requiredSpecialties(features: CaseFeatures): { specialty: string; reason: string }[] {
  return features.organSystems
    .filter((sys) => SYSTEM_TO_SPECIALTY[sys])
    .map((sys) => ({
      specialty: SYSTEM_TO_SPECIALTY[sys],
      reason: reasonFor(sys, features.systemEvidence?.[sys] || []),
    }));
}

export function decideSeating(
  features: CaseFeatures,
  roster: Persona[],
  clinicianSpecialty: string
): SeatingDecision {
  const seats: Seat[] = [];

  for (const kind of ['chair', 'skeptic', 'reimbursement'] as const) {
    const p = roster.find((r) => r.kind === kind);
    if (!p) continue;
    seats.push({
      specialty: p.specialty,
      status: 'seated',
      personaId: p.id,
      personaName: p.name,
      reasons: [
        kind === 'chair'
          ? 'moderates every council'
          : kind === 'skeptic'
            ? 'standing devil’s advocate'
            : 'coverage reality has a seat at the table',
      ],
    });
  }

  // The human clinician fills their own seat. Duplicate specialties are allowed.
  seats.push({
    specialty: clinicianSpecialty,
    status: 'human',
    personaName: 'You (managing clinician)',
    reasons: ['presenting and managing this case'],
  });

  // organSystems arrives ranked by evidence weight, so the cap keeps the specialties
  // the record argues loudest for. An unfillable requirement still gets its seat.
  for (const req of requiredSpecialties(features).slice(0, MAX_SPECIALISTS)) {
    const p = roster.find((r) => r.kind === 'specialist' && r.specialty === req.specialty);
    if (p) {
      seats.push({
        specialty: req.specialty,
        status: 'seated',
        personaId: p.id,
        personaName: p.name,
        reasons: [req.reason],
      });
    } else {
      seats.push({ specialty: req.specialty, status: 'empty', reasons: [req.reason] });
    }
  }

  return { seats };
}

export const emptySeats = (d: SeatingDecision): Seat[] => d.seats.filter((s) => s.status === 'empty');
export const seatedSpecialists = (d: SeatingDecision): Seat[] =>
  d.seats.filter((s) => s.status === 'seated' && s.specialty !== 'internal-medicine');

export interface ChartResourceLite {
  resourceType: string;
  text: string;
}

// Deterministic: changing the record — or what the clinician says — changes the
// features, which changes the seating. `presentation` is what they actually spoke;
// it counts for more than a line buried in a decade-old note.
export function deriveFeatures(
  resources: ChartResourceLite[],
  patient: { age: number; sex: 'male' | 'female' | 'other' },
  chiefComplaint: string,
  presentation = ''
): CaseFeatures {
  const chartCorpus = resources.map((r) => `${r.resourceType} ${r.text}`).join('\n');
  const spokenCorpus = `${chiefComplaint}\n${presentation}`;

  const systemEvidence: Record<string, string[]> = {};
  const weights: Record<string, number> = {};

  for (const [sys, re] of Object.entries(SYSTEM_KEYWORDS)) {
    const chartHits = chartCorpus.match(re) || [];
    // Fresh lastIndex per corpus — these regexes are /g and stateful.
    re.lastIndex = 0;
    const spokenHits = spokenCorpus.match(re) || [];
    re.lastIndex = 0;
    const weight = chartHits.length + spokenHits.length * PRESENTATION_WEIGHT;
    if (weight === 0) continue;
    weights[sys] = weight;
    // Spoken terms lead the reason — they are why the clinician is here today.
    systemEvidence[sys] = [...spokenHits, ...chartHits];
  }

  const organSystems = Object.keys(weights).sort((a, b) => weights[b] - weights[a]);

  const activeMeds = resources
    .filter((r) => r.resourceType === 'MedicationRequest' || r.resourceType === 'MedicationStatement')
    .map((r) => r.text.trim())
    .filter(Boolean);

  const redFlags: string[] = [];
  if (organSystems.length >= 3) redFlags.push('multisystem-pattern');
  if (weights.pharm) redFlags.push('recent-medication-change');

  return { age: patient.age, sex: patient.sex, chiefComplaint, organSystems, systemEvidence, activeMeds, redFlags };
}
