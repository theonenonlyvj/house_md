// "Nobody Ever Grew A Culture" — synthetic case in the DEMO_SPEC mold.
//
// 34-year-old, seven weeks of daily spiking fevers, treated three times as an
// occult infection. Every culture and serology is negative. She has adult-onset
// Still's disease, and the labs now show it tipping into macrophage activation
// syndrome: ferritin climbing, transaminases rising, platelets falling. Another
// antibiotic course is not the risk — the delay is.
//
// The plot here is ABSENCE as evidence. The negative workup is not a dead end, it
// is the finding, and the panel has to be willing to argue from what is missing.
// The quotidian fever pattern and the rash that comes and goes WITH the fever are
// buried in nursing observations rather than physician notes.
//
// Why this case matters for the product: it trips infectious + heme + rheumatology,
// and there is no rheumatologist on the bench. The consult seats infectious disease
// and hematology and leaves RHEUMATOLOGY visibly EMPTY. That is Guardrail #1 doing
// its job on screen — the panel says out loud that the expertise this case most
// needs is not in the room, and nobody improvises it.
export default {
  id: 'priya-raghunathan',
  slug: 'patient-priya-raghunathan',
  title: 'Nobody Ever Grew A Culture (synthetic)',

  patient: {
    family: 'Raghunathan',
    given: ['Priya'],
    gender: 'female',
    birthDate: '1992-01-30',
    city: 'San Leandro',
    state: 'CA',
    languages: ['English', 'Tamil'],
    contact: { relationship: 'Partner (emergency contact)', family: 'Byrne', given: ['Aoife'] },
  },

  coverage: {
    type: 'Commercial PPO',
    subscriberId: 'UHC123456',
    payor: 'UNITEDHEALTHCARE',
    planNote: 'Individual deductible $4,000; ~$3,400 remaining this plan year',
  },

  conditions: [
    { slug: 'pr-condition-fuo', onset: { daysAgo: 49 }, display: 'Fever of unknown origin', note: 'Seven weeks. Three antibiotic courses without response.' },
    { slug: 'pr-condition-arthralgia', onset: { daysAgo: 42 }, display: 'Polyarthralgia — wrists, knees', note: 'Symmetric. Worse during fever spikes.' },
    { slug: 'pr-condition-pharyngitis', onset: { daysAgo: 49 }, display: 'Recurrent sore throat', note: 'Culture negative on two occasions.' },
    { slug: 'pr-condition-hypothyroid', onset: '2019', display: 'Hypothyroidism', note: 'Stable on levothyroxine. Unrelated.' },
  ],

  medications: [
    { slug: 'pr-med-levothyroxine', started: '2019', display: 'Levothyroxine 75 mcg oral tablet', dosage: 'Levothyroxine 75 mcg PO daily' },
    { slug: 'pr-med-amoxclav', status: 'completed', started: { daysAgo: 45 }, display: 'Amoxicillin-clavulanate 875 mg oral tablet', dosage: '875 mg PO BID for 10 days', note: 'First empiric course. No response.' },
    { slug: 'pr-med-doxycycline', status: 'completed', started: { daysAgo: 30 }, display: 'Doxycycline 100 mg oral capsule', dosage: '100 mg PO BID for 14 days', note: 'Second empiric course, covering tick-borne illness. No response.' },
    { slug: 'pr-med-ceftriaxone', status: 'completed', started: { daysAgo: 12 }, display: 'Ceftriaxone 1 g injection', dosage: '1 g IV daily for 7 days during admission', note: 'Third empiric course. No response.' },
    { slug: 'pr-med-naproxen', started: { daysAgo: 40 }, display: 'Naproxen 500 mg oral tablet', dosage: '500 mg PO BID PRN', note: 'Partial relief of joint pain and fever.' },
  ],

  encounters: [
    { slug: 'pr-enc-urgent-1', date: { daysAgo: 45 }, display: 'Urgent care visit', reason: 'Fever and sore throat. Rapid strep negative. Started on amoxicillin-clavulanate.' },
    { slug: 'pr-enc-pcp-1', date: { daysAgo: 38 }, display: 'PCP visit', reason: 'Fevers continuing into week two. Joint pain now present. Blood cultures drawn.' },
    { slug: 'pr-enc-pcp-2', date: { daysAgo: 30 }, display: 'PCP visit', reason: 'Still febrile daily. Doxycycline started empirically for possible tick-borne illness.' },
    {
      slug: 'pr-enc-admit',
      date: { daysAgo: 12 },
      end: { daysAgo: 5 },
      display: 'Inpatient admission — fever of unknown origin workup',
      reason: 'Admitted for systematic FUO workup after six weeks of daily fevers. Broad cultures, serologies, CT, echocardiogram.',
    },
    {
      slug: 'pr-enc-current',
      date: { daysAgo: 1 },
      display: 'PCP visit — post-discharge follow-up',
      reason:
        'Chief complaint: fevers unchanged since discharge, now with right upper abdominal discomfort and new fatigue. Discussing a fourth antibiotic course versus further workup.',
    },
  ],

  observations: [
    {
      slug: 'pr-social-intake',
      date: '2019-02-14',
      category: 'social-history',
      display: 'Social history — new-patient intake',
      value:
        'Software engineer. Born in Chennai, India; moved to the US at age 6. No recent travel. No animal exposures. No tick exposure recalled. No IV drug use. Lives with partner.',
    },

    // CLUE #1 — the fever PATTERN, recorded by nursing, never characterized by a physician
    {
      slug: 'pr-clue1-fever-curve',
      date: { daysAgo: 10 },
      category: 'vital-signs',
      display: 'Inpatient nursing vitals summary',
      value:
        'Temperature charted q4h. Daily single spike to 39.4–39.8°C between 16:00 and 20:00, returning to 36.8°C or below by morning on every one of seven inpatient days. Afebrile between spikes without antipyretics on three of those days.',
      encounter: 'pr-enc-admit',
    },

    // CLUE #2 — the rash that comes WITH the fever and is gone by rounds
    {
      slug: 'pr-clue2-nursing-rash',
      date: { daysAgo: 9 },
      category: 'exam',
      display: 'Inpatient nursing note',
      value:
        'Salmon-coloured blotchy rash noted across trunk and upper arms during evening temperature spike. Not itchy. Faded and no longer visible at 06:00 assessment. Noted on two separate evenings.',
      encounter: 'pr-enc-admit',
    },

    // CLUE #3 — the ferritin nobody plotted
    { slug: 'pr-clue3-ferritin-current', date: { daysAgo: 1 }, display: 'Ferritin', value: 'Ferritin 14,200 ng/mL.', flag: 'H' },
    { slug: 'pr-ferritin-admit', date: { daysAgo: 11 }, display: 'Ferritin', value: 'Ferritin 6,800 ng/mL. Noted as "elevated, likely acute phase reactant."', flag: 'H', encounter: 'pr-enc-admit' },
    { slug: 'pr-ferritin-week2', date: { daysAgo: 38 }, display: 'Ferritin', value: 'Ferritin 1,240 ng/mL.', flag: 'H' },

    // The tipping point: this is no longer just Still's
    { slug: 'pr-plt-current', date: { daysAgo: 1 }, display: 'CBC with differential', value: 'White cells 16.8 with neutrophil predominance. Platelets 96 — down from 410 three weeks ago. Thrombocytopenia new. Mild anemia.', flag: 'L' },
    { slug: 'pr-lft-current', date: { daysAgo: 1 }, display: 'Hepatic function panel', value: 'AST 210, ALT 178, both rising from normal at admission. Triglycerides 480. Fibrinogen 140 — low.', flag: 'H' },
    { slug: 'pr-cbc-admit', date: { daysAgo: 11 }, display: 'CBC with differential', value: 'White cells 18.2 with neutrophil predominance. Platelets 410. Haemoglobin 11.9.', flag: 'H', encounter: 'pr-enc-admit' },

    // The negative workup — absence, densely documented, which is the point
    { slug: 'pr-cultures', date: { daysAgo: 11 }, display: 'Blood cultures', value: 'Six sets drawn over seven days, two while febrile and off antibiotics. No growth at five days on all sets.', encounter: 'pr-enc-admit' },
    { slug: 'pr-serologies', date: { daysAgo: 10 }, display: 'Infectious serology panel', value: 'EBV, CMV, HIV, parvovirus B19, hepatitis B and C, Bartonella, Coxiella, Brucella — all negative. Interferon-gamma release assay for tuberculosis negative.', encounter: 'pr-enc-admit' },
    { slug: 'pr-ana', date: { daysAgo: 10 }, display: 'Autoimmune serology', value: 'Antinuclear antibody negative. Rheumatoid factor negative. Complement normal. Note: seronegative result recorded, no further autoimmune workup pursued.', encounter: 'pr-enc-admit' },
    { slug: 'pr-crp', date: { daysAgo: 1 }, display: 'C-reactive protein and ESR', value: 'CRP 218 mg/L. ESR 92 mm/hr. Both persistently high across all seven weeks.', flag: 'H' },

    // Boring distractors
    { slug: 'pr-lab-tsh-2021', date: '2021-03-08', display: 'Thyroid stimulating hormone', value: 'TSH 1.8 — well replaced.' },
    { slug: 'pr-lab-cmp-2022', date: '2022-04-19', display: 'Comprehensive metabolic panel', value: 'Unremarkable.' },
    { slug: 'pr-lab-lipids-2024', date: '2024-05-30', display: 'Lipid panel', value: 'Unremarkable.' },
    { slug: 'pr-lab-cbc-2024', date: '2024-05-30', display: 'CBC with differential', value: 'Unremarkable. Platelets 388.' },

    {
      slug: 'pr-note-current',
      date: { daysAgo: 1 },
      category: 'exam',
      display: 'PCP progress note',
      value:
        'Seven weeks febrile. Three antibiotic courses without response. Extensive infectious workup negative. Patient exhausted and frightened. Considering a fourth empiric course versus repeat imaging. Requesting help.',
      encounter: 'pr-enc-current',
    },
  ],

  reports: [
    { slug: 'pr-ct-admit', date: { daysAgo: 11 }, display: 'CT chest, abdomen and pelvis with contrast', conclusion: 'Mild splenomegaly and scattered small reactive-appearing lymph nodes. No abscess, no mass, no source of infection identified.', encounter: 'pr-enc-admit' },
    { slug: 'pr-echo-admit', date: { daysAgo: 10 }, display: 'Transthoracic echocardiogram', conclusion: 'No valvular vegetation. Normal ventricular function. No evidence of endocarditis.', encounter: 'pr-enc-admit' },
  ],

  serviceRequests: [
    {
      slug: 'pr-referral-rheum',
      status: 'draft',
      date: { daysAgo: 5 },
      display: 'Rheumatology referral',
      note: 'Suggested at discharge. Next available appointment is in eleven weeks. Referral not yet placed.',
    },
  ],
};
