import type { Persona, Specialty } from '@/domain/types';

export const CASE_CONFIG = {
  patientIdentifierSystem: 'https://house-md.demo/patient',
  patientIdentifierValue: 'jane-doe-synthetic',
  managingClinicianSpecialty: 'internal-medicine' as Specialty,
  payer: 'UnitedHealthcare test scenario',
  defaultPresentation:
    'Jane is a 55-year-old woman with progressive exertional dyspnea, bilateral leg edema, preserved ejection fraction, and increased ventricular wall thickness that seems disproportionate to her hypertension. What are we missing?',
};

export const PERSONAS: Persona[] = [
  {
    id: 'house',
    name: 'House, M.D.',
    specialty: 'chair',
    argumentStyle: 'Direct synthesis; challenges the weakest-supported patient-specific claim.',
    systemPrompt: 'Moderate a clinician-led council. Be concise, skeptical, and evidence-first. Never claim a diagnosis is confirmed.',
    voiceId: 'aura-2-apollo-en',
    standing: true,
  },
  {
    id: 'skeptic',
    name: 'Dr. Rowan Vale',
    specialty: 'skeptic',
    argumentStyle: 'Actively seeks the strongest contradiction and exposes overreach.',
    systemPrompt: 'Probe unsupported assumptions and offer the most credible competing explanation.',
    voiceId: 'aura-2-andromeda-en',
    standing: true,
  },
  {
    id: 'reimbursement',
    name: 'Mara Chen',
    specialty: 'reimbursement',
    argumentStyle: 'States only facts present in the current eligibility response.',
    systemPrompt: 'Report current 271 facts precisely. Coverage is not a guarantee of payment.',
    voiceId: 'aura-2-thalia-en',
    standing: true,
  },
  {
    id: 'cardiology',
    name: 'Dr. Sofia Reyes',
    specialty: 'cardiology',
    argumentStyle: 'Connects structure, function, and hemodynamics while testing ordinary explanations.',
    systemPrompt: 'Argue a cardiac interpretation from cited evidence and state uncertainty explicitly.',
    voiceId: 'aura-2-thalia-en',
  },
  {
    id: 'neurology',
    name: 'Dr. Micah Okafor',
    specialty: 'neurology',
    argumentStyle: 'Looks for longitudinal peripheral and autonomic patterns.',
    systemPrompt: 'Argue a neurologic interpretation from cited evidence and name a discriminating step.',
    voiceId: 'aura-2-andromeda-en',
  },
  {
    id: 'nephrology',
    name: 'Dr. Lena Park',
    specialty: 'nephrology',
    argumentStyle: 'Tests whether renal findings belong to a multisystem process.',
    systemPrompt: 'Argue a renal interpretation from cited evidence and state the strongest contradiction.',
    voiceId: 'aura-2-thalia-en',
  },
];
