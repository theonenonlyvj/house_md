// "The Hands Told You First" — synthetic case in the DEMO_SPEC mold.
//
// 71-year-old carried for six years as hypertensive heart failure with preserved
// ejection fraction. She actually has transthyretin cardiac amyloidosis (ATTR).
// The harbingers are all in the chart, years ahead of the heart: bilateral carpal
// tunnel releases in 2016 and 2018, lumbar spinal stenosis surgery in 2019. The
// discordance nobody reconciled: thick walls on echo, LOW voltage on ECG — the
// opposite of what hypertensive hypertrophy does.
//
// Why this case earns a different panel than Tuan Pham: it trips cardiac + renal +
// neuro + heme, so seating produces cardiology, nephrology, neurology and
// hematology. Hematology is not decorative — ATTR must be separated from AL
// amyloidosis (light chains) because the treatments differ completely and AL kills
// fast. That separation is the panel's real job here.
//
// Stedi sandbox note: the test payer only answers for its fixed test subscribers,
// so every seeded case carries the same UHC123456 member id. The Medplum → Stedi
// lookup is real; the sandbox's identity space is just very small.
export default {
  id: 'marguerite-adeyemi',
  slug: 'patient-marguerite-adeyemi',
  title: 'The Hands Told You First (synthetic)',

  patient: {
    family: 'Adeyemi',
    given: ['Marguerite'],
    gender: 'female',
    birthDate: '1955-08-22',
    city: 'Oakland',
    state: 'CA',
    languages: ['English', 'Yoruba'],
    contact: { relationship: 'Son (emergency contact)', family: 'Adeyemi', given: ['Tobi'] },
  },

  coverage: {
    type: 'Commercial PPO',
    subscriberId: 'UHC123456',
    payor: 'UNITEDHEALTHCARE',
    planNote: 'Individual deductible $4,000; ~$3,400 remaining this plan year',
  },

  conditions: [
    { slug: 'ma-condition-htn', onset: '2009', display: 'Hypertension', note: 'Long-standing. Assumed cause of the wall thickening.' },
    {
      slug: 'ma-condition-hfpef',
      onset: '2020',
      display: 'Heart failure with preserved ejection fraction',
      note: 'Attributed to hypertensive heart disease. Etiology never formally investigated.',
    },
    { slug: 'ma-condition-ckd', onset: '2022', display: 'Chronic kidney disease, stage 3a', note: 'Attributed to hypertension and age.' },
    {
      slug: 'ma-condition-neuropathy',
      onset: '2021',
      display: 'Peripheral neuropathy, lower extremities',
      note: 'Non-diabetic. Cause not established. Referred to neurology 2021; workup incomplete.',
    },
    { slug: 'ma-condition-afib', onset: '2023', display: 'Atrial fibrillation, paroxysmal', note: 'Rate controlled.' },
    {
      slug: 'ma-condition-anemia',
      onset: '2023',
      display: 'Anemia, mild normocytic',
      note: 'Attributed to chronic kidney disease. Never separately investigated.',
    },
  ],

  medications: [
    { slug: 'ma-med-lisinopril', started: '2009', display: 'Lisinopril 20 mg oral tablet', dosage: 'Lisinopril 20 mg PO daily' },
    { slug: 'ma-med-furosemide', started: '2020', display: 'Furosemide 40 mg oral tablet', dosage: 'Furosemide 40 mg PO daily' },
    { slug: 'ma-med-apixaban', started: '2023', display: 'Apixaban 5 mg oral tablet', dosage: 'Apixaban 5 mg PO BID' },
    {
      slug: 'ma-med-metoprolol',
      started: { daysAgo: 21 },
      display: 'Metoprolol succinate 100 mg oral tablet',
      dosage: 'Metoprolol succinate 100 mg PO daily (uptitrated from 25 mg)',
      note: 'Uptitrated for rate control and HFpEF. This is the escalation under question.',
    },
  ],

  procedures: [
    // The harbingers — years before any cardiac complaint, in a different clinic's notes.
    { slug: 'ma-proc-ctr-right', date: '2016-02-17', display: 'Right carpal tunnel release', note: 'Idiopathic. No diabetes, no thyroid disease.' },
    { slug: 'ma-proc-ctr-left', date: '2018-06-05', display: 'Left carpal tunnel release', note: 'Idiopathic. Second side within two years.' },
    { slug: 'ma-proc-lumbar', date: '2019-11-12', display: 'Lumbar decompression for spinal stenosis', note: 'Symptomatic canal narrowing.' },
  ],

  encounters: [
    { slug: 'ma-enc-annual-2017', date: '2017-04-10', display: 'Annual PCP visit', reason: 'Routine. Blood pressure at goal.' },
    { slug: 'ma-enc-annual-2019', date: '2019-04-22', display: 'Annual PCP visit', reason: 'Routine. Recovering from lumbar surgery.' },
    { slug: 'ma-enc-cards-2020', date: '2020-08-14', display: 'Cardiology consultation', reason: 'Dyspnea on exertion, leg swelling. Echo ordered.' },
    { slug: 'ma-enc-neuro-2021', date: '2021-05-19', display: 'Neurology consultation', reason: 'Numbness and burning in both feet. EMG ordered; patient did not complete workup.' },
    { slug: 'ma-enc-annual-2024', date: '2024-04-30', display: 'Annual PCP visit', reason: 'Routine. Reports she tires faster than last year.' },
    {
      slug: 'ma-enc-ed-current',
      class: 'EMER',
      date: { daysAgo: 2 },
      display: 'Emergency department visit',
      reason:
        'Chief complaint: near-syncope on standing, worsening fatigue and leg swelling since the beta blocker was increased three weeks ago. Systolic 84 in triage.',
    },
  ],

  observations: [
    {
      slug: 'ma-social-intake-2015',
      date: '2015-03-11',
      category: 'social-history',
      display: 'Social history — new-patient intake',
      value:
        'Retired schoolteacher. Born in Ibadan, Nigeria; immigrated 1979. Family history: father died at 68 of "an enlarged heart," never formally diagnosed. No tobacco, no alcohol.',
    },

    // CLUE #1 — the discordance. Thick walls, small voltage. Filed, never reconciled.
    {
      slug: 'ma-clue1-ecg-2023',
      date: '2023-02-08',
      category: 'procedure',
      display: 'ECG',
      value:
        'Low QRS voltage in the limb leads. Atrial fibrillation, rate 78. Comment: voltage lower than expected given the degree of wall thickening on prior echo.',
      flag: 'A',
    },

    // CLUE #2 — a persistent troponin nobody ever explained away.
    {
      slug: 'ma-clue2-troponin-2024',
      date: '2024-04-30',
      display: 'High-sensitivity troponin T',
      value: 'Mildly elevated at 38 ng/L. Third consecutive elevated value since 2022. No acute coronary syndrome. No explanation documented.',
      flag: 'H',
    },
    { slug: 'ma-troponin-2022', date: '2022-06-30', display: 'High-sensitivity troponin T', value: 'Mildly elevated at 31 ng/L. Attributed to chronic kidney disease.', flag: 'H' },

    // CLUE #3 — proteinuria that does not fit the hypertensive story
    {
      slug: 'ma-clue3-urine-2024',
      date: '2024-04-30',
      display: 'Urine protein-to-creatinine ratio',
      value: 'Elevated at 1.9 g/g. Out of proportion to the degree of kidney impairment. Nephrology referral discussed, not placed.',
      flag: 'H',
    },

    { slug: 'ma-ntprobnp-current', date: { daysAgo: 2 }, display: 'NT-proBNP', value: 'Markedly elevated at 4,180 pg/mL, rising from 1,900 in 2023.', flag: 'H' },
    { slug: 'ma-egfr-2024', date: '2024-04-30', display: 'Estimated GFR', value: 'eGFR 51 mL/min/1.73m² — stable stage 3a.' },

    // The half-done exclusion: SPEP alone does not rule out light-chain amyloidosis.
    // Serum free light chains were never sent. The chart LOOKS like AL was excluded.
    {
      slug: 'ma-spep-2022',
      date: '2022-06-30',
      display: 'Serum protein electrophoresis',
      value:
        'No monoclonal band detected. Recorded in the chart as "paraprotein negative." Serum free light chain assay and immunofixation were not performed.',
    },

    // Boring distractors
    { slug: 'ma-lab-cmp-2017', date: '2017-04-10', display: 'Comprehensive metabolic panel', value: 'Unremarkable.' },
    { slug: 'ma-lab-lipids-2018', date: '2018-04-14', display: 'Lipid panel', value: 'LDL 96. At goal on diet alone.' },
    { slug: 'ma-lab-tsh-2019', date: '2019-04-22', display: 'Thyroid stimulating hormone', value: 'TSH 2.1 — normal.' },
    { slug: 'ma-lab-a1c-2021', date: '2021-05-19', display: 'Hemoglobin A1c', value: 'A1c 5.4 — no diabetes.' },
    { slug: 'ma-lab-cbc-2023', date: '2023-02-08', display: 'CBC with differential', value: 'Mild normocytic anemia, haemoglobin 10.4. Otherwise unremarkable.', flag: 'L' },
    { slug: 'ma-lab-cmp-2024', date: '2024-04-30', display: 'Comprehensive metabolic panel', value: 'Creatinine 1.14, otherwise unremarkable.' },

    {
      slug: 'ma-note-metoprolol-uptitration',
      date: { daysAgo: 21 },
      category: 'exam',
      display: 'Cardiology progress note',
      value: 'Persistent dyspnea and AF with RVR. Increase metoprolol succinate to 100 mg daily. Continue furosemide.',
    },
    {
      slug: 'ma-ed-nursing-note',
      date: { daysAgo: 2 },
      category: 'exam',
      display: 'ED nursing note',
      value: 'Patient reports she "goes grey" when she stands. Son notes her tongue looks larger than it used to. Bruising around both eyes without trauma.',
      encounter: 'ma-enc-ed-current',
    },
  ],

  reports: [
    {
      slug: 'ma-echo-2020',
      date: '2020-08-14',
      display: 'Transthoracic echocardiogram',
      conclusion:
        'Increased left ventricular wall thickness (14 mm). Ejection fraction preserved at 58%. Grade II diastolic dysfunction. Biatrial enlargement. Findings consistent with hypertensive heart disease.',
    },
    {
      slug: 'ma-echo-current',
      date: { daysAgo: 2 },
      display: 'Transthoracic echocardiogram',
      conclusion:
        'Left ventricular wall thickness now 17 mm. Ejection fraction 49%. Reduced global longitudinal strain with apical sparing. Small pericardial effusion. Biatrial enlargement.',
      encounter: 'ma-enc-ed-current',
    },
  ],

  serviceRequests: [
    {
      slug: 'ma-referral-nephrology-2024',
      status: 'draft',
      date: '2024-04-30',
      display: 'Nephrology referral — proteinuria',
      note: 'Discussed with patient. Referral never placed.',
    },
    {
      slug: 'ma-emg-2021',
      status: 'revoked',
      date: '2021-05-19',
      display: 'EMG / nerve conduction study',
      note: 'Ordered by neurology. Patient did not attend. Neuropathy never characterized.',
    },
  ],
};
