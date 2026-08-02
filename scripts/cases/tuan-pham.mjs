// "The Medicine Is the Poison" — docs/DEMO_SPEC.md §3.
// Chronic Strongyloides acquired in childhood, misread as adult-onset asthma. The
// steroids are converting a silent 50-year infection into early hyperinfection.
// Three clues planted at realistic depths: the 2016 intake geography, the 2019
// eosinophilia nobody followed up, the ED nursing note describing larva currens.
// Organ systems the record should trip: pulmonary + gi + infectious.
export default {
  id: 'tuan-pham',
  slug: 'patient-tuan-pham',
  title: 'The Medicine Is the Poison (synthetic)',

  patient: {
    family: 'Pham',
    given: ['Tuan'],
    gender: 'male',
    birthDate: '1964-03-14',
    city: 'Berkeley',
    state: 'CA',
    languages: ['English', 'Vietnamese'],
    contact: { relationship: 'Daughter (emergency contact)', family: 'Pham', given: ['Linh'] },
  },

  coverage: {
    type: 'Commercial PPO',
    subscriberId: 'UHC123456',
    payor: 'UNITEDHEALTHCARE',
    planNote: 'Individual deductible $4,000; ~$3,400 remaining this plan year',
  },

  conditions: [
    { slug: 'condition-t2dm', onset: '2015', display: 'Type 2 diabetes mellitus', note: 'Well controlled, latest A1c 6.9.' },
    { slug: 'condition-hypertension', onset: '2012', display: 'Hypertension', note: 'Controlled on lisinopril.' },
    { slug: 'condition-gerd', onset: '2018', display: 'GERD', note: 'On omeprazole.' },
    {
      slug: 'condition-asthma-adult-onset',
      onset: '2024',
      display: 'Asthma, adult-onset',
      note: 'No childhood history. Diagnosed clinically. Never confirmed by spirometry.',
    },
  ],

  medications: [
    { slug: 'med-metformin', started: '2015', display: 'Metformin 1000 mg oral tablet', dosage: 'Metformin 1000 mg PO BID' },
    { slug: 'med-lisinopril', started: '2012', display: 'Lisinopril 20 mg oral tablet', dosage: 'Lisinopril 20 mg PO daily' },
    { slug: 'med-omeprazole', started: '2018', display: 'Omeprazole 20 mg oral capsule', dosage: 'Omeprazole 20 mg PO daily' },
    { slug: 'med-albuterol', started: '2024', display: 'Albuterol HFA inhaler', dosage: 'Albuterol HFA inhaler, 2 puffs PRN wheezing' },
    {
      slug: 'med-prednisone',
      started: { daysAgo: 16 }, // the loaded gun
      display: 'Prednisone 40 mg oral tablet',
      dosage: 'Prednisone 40 mg PO daily',
      note: 'For asthma exacerbation, taper planned.',
    },
  ],

  encounters: [
    { slug: 'encounter-annual-2017', date: '2017-05-02', display: 'Annual PCP visit', reason: 'Routine annual visit. No new concerns.' },
    { slug: 'encounter-annual-2021', date: '2021-06-15', display: 'Annual PCP visit', reason: 'Routine annual visit. Chronic conditions stable.' },
    { slug: 'encounter-annual-2023', date: '2023-09-11', display: 'Annual PCP visit', reason: 'Routine annual visit. Medications refilled.' },
    {
      slug: 'encounter-asthma-2024',
      date: '2024-03-05',
      display: 'PCP visit — new respiratory complaint',
      reason: 'Wheezing, dyspnea on exertion. Trial albuterol. Refer to pulmonology for spirometry.',
    },
    {
      slug: 'encounter-ed-current',
      class: 'EMER',
      date: { daysAgo: 1 },
      display: 'Emergency department visit',
      reason:
        'Chief complaint: worsening shortness of breath, new diffuse abdominal pain, nausea, 2 days loose stools, fever 100.8°F',
    },
  ],

  observations: [
    // CLUE #1 — the geography, buried in a 2016 new-patient intake
    {
      slug: 'clue1-intake-social-history-2016',
      date: '2016-04-11',
      category: 'social-history',
      display: 'Social history — new-patient intake',
      value:
        'New-patient intake: Born in rural Tây Ninh province, Vietnam. Worked in family rice paddies as a child. Immigrated to the US in 1984 via refugee camp in Thailand.',
    },
    {
      slug: 'social-occupation-tobacco',
      date: '2016-04-11',
      category: 'social-history',
      display: 'Occupation and tobacco history',
      value: 'Occupation: retired machinist. Tobacco: former smoker, quit 2005, ~20 pack-years. Alcohol: rare/social.',
    },

    // CLUE #2 — the parasite waving, flagged HIGH, never followed up
    {
      slug: 'clue2-cbc-2019-03-08',
      date: '2019-03-08',
      display: 'CBC with differential',
      value: 'Eosinophils 14% (absolute 1,100/µL) — flagged HIGH. No follow-up documented.',
      flag: 'H',
    },
    { slug: 'cbc-2022-06-14', date: '2022-06-14', display: 'CBC with differential', value: 'Eosinophils 6% — mildly elevated, not flagged' },
    // Steroids suppress eosinophils: the drug causing the crisis erased the clue that flags it.
    { slug: 'cbc-admission', date: { daysAgo: 3 }, display: 'CBC with differential', value: 'Eosinophils 0%' },

    // Boring distractor labs 2016–2025 — the chart has to feel real
    { slug: 'lab-cmp-2016', date: '2016-09-20', display: 'Comprehensive metabolic panel', value: 'Unremarkable.' },
    { slug: 'lab-a1c-2017', date: '2017-09-18', display: 'Hemoglobin A1c', value: 'A1c 7.1 — well controlled.' },
    { slug: 'lab-lipids-2018', date: '2018-09-24', display: 'Lipid panel', value: 'Unremarkable.' },
    { slug: 'lab-cmp-2019', date: '2019-09-16', display: 'Comprehensive metabolic panel', value: 'Unremarkable.' },
    { slug: 'lab-a1c-2020', date: '2020-10-05', display: 'Hemoglobin A1c', value: 'A1c 7.0 — well controlled.' },
    { slug: 'lab-lipids-2021', date: '2021-09-13', display: 'Lipid panel', value: 'Unremarkable.' },
    { slug: 'lab-cmp-2023', date: '2023-09-11', display: 'Comprehensive metabolic panel', value: 'Unremarkable.' },
    { slug: 'lab-a1c-2025', date: '2025-03-10', display: 'Hemoglobin A1c', value: 'A1c 6.9 — well controlled.' },

    { slug: 'pcp-note-prednisone-start', date: { daysAgo: 16 }, category: 'exam', display: 'PCP progress note', value: 'Asthma worse. Start prednisone 40 mg daily burst with taper.' },

    // CLUE #3 — larva currens, one line in an ED nursing note
    {
      slug: 'clue3-ed-nursing-note',
      date: { daysAgo: 1 },
      category: 'exam',
      display: 'ED nursing note',
      value: 'Wife reports faint red streaks on his lower back overnight, resolved by morning.',
      encounter: 'encounter-ed-current',
    },
  ],

  reports: [
    {
      slug: 'dx-chest-xray-ed',
      date: { daysAgo: 1 },
      display: 'Chest X-ray',
      conclusion: 'Patchy bilateral infiltrates.',
      encounter: 'encounter-ed-current',
    },
  ],

  serviceRequests: [
    {
      slug: 'referral-pulmonology-2024',
      status: 'revoked',
      date: '2024-03-05',
      display: 'Pulmonology referral — spirometry',
      note: 'Patient no-showed. Spirometry never performed.',
    },
  ],
};
