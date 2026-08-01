// Every mock scenario Stedi test mode documents, values verbatim from
// https://www.stedi.com/docs/healthcare/api-reference/mock-requests-eligibility-checks (2026-08-01).
// Each request is sent as-is (plus nothing): provider/subscriber/dependents/encounter per docs.

const P = { organizationName: 'Provider Name', npi: '1999999984' };
const MED = { serviceTypeCodes: ['30'] };
const DENTAL = { serviceTypeCodes: ['35'] };

export const SCENARIOS = [
  {
    group: 'Medical — active coverage',
    items: [
      { key: 'aetna', label: 'Aetna', desc: 'Active "Gold Plan" with copays, coinsurance, deductible, out-of-pocket.',
        request: { tradingPartnerServiceId: '60054', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '20040404', memberId: 'AETNA12345' }, encounter: MED } },
      { key: 'ambetter', label: 'Ambetter', desc: 'Active coverage sample.',
        request: { tradingPartnerServiceId: '68069', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', dateOfBirth: '19940404', memberId: 'AMBETTER123' }, encounter: MED } },
      { key: 'cigna', label: 'Cigna — James Jones', desc: 'Active "Open Access Plus", group ACME, Inc.',
        request: { tradingPartnerServiceId: '62308', provider: P, subscriber: { firstName: 'James', lastName: 'Jones', dateOfBirth: '19910202', memberId: '23456789100' }, encounter: MED } },
      { key: 'humana', label: 'Humana', desc: 'Active coverage sample.',
        request: { tradingPartnerServiceId: '61101', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19750505', memberId: 'HUMANA123' }, encounter: MED } },
      { key: 'kaiser', label: 'Kaiser Permanente NorCal', desc: 'Active coverage sample.',
        request: { tradingPartnerServiceId: 'KSRCN', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '20020202', memberId: 'KAISER123456' }, encounter: MED } },
      { key: 'cms', label: 'CMS (Medicare)', desc: 'Part A/B breakdown; per-service covered vs non-covered (dental, LTC).',
        request: { tradingPartnerServiceId: 'CMS', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19550505', memberId: 'CMS12345678' }, encounter: MED } },
      { key: 'uhc', label: 'UnitedHealthcare', desc: 'Richest response: "Gold Plan HMO", 30+ benefit rows incl. $15 specialist copay.',
        request: { tradingPartnerServiceId: '87726', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19710101', memberId: 'UHC123456' }, encounter: MED } },
    ],
  },
  {
    group: 'Cigna personas (varied benefit shapes)',
    items: [
      ['arrojo', 'Rolando Arrojo', '19710102', '5643296'],
      ['beck', 'Rod Beck', '19720203', 'R5TJR4HR4H'],
      ['cone', 'David Cone', '19730304', '5642296'],
      ['castillo', 'Frank Castillo', '19750405', 'FTRJRG3254'],
      ['fossum', 'Casey Fossum', '19760506', '5641296'],
      ['garces', 'Rich Garces', '19770607', 'DHW5445'],
    ].map(([key, name, dob, memberId]) => {
      const [firstName, lastName] = name.split(' ');
      return { key: `cigna-${key}`, label: `Cigna — ${name}`, desc: 'Alternate Cigna mock subscriber.',
        request: { tradingPartnerServiceId: '62308', provider: P, subscriber: { firstName, lastName, dateOfBirth: dob, memberId }, encounter: MED } };
    }),
  },
  {
    group: 'Inactive coverage',
    items: [
      { key: 'uhc-inactive', label: 'UnitedHealthcare — inactive member', desc: 'planStatus 6 (Inactive) — the "not covered" demo contrast.',
        request: { tradingPartnerServiceId: '87726', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19710101', memberId: 'UHCINACTIVE' }, encounter: MED } },
    ],
  },
  {
    group: 'Dependent checks',
    items: [
      { key: 'dep-aetna', label: 'Aetna — dependent Jordan', desc: 'Subscriber John + dependent Jordan Doe; benefits for the dependent.',
        request: { tradingPartnerServiceId: '60054', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', memberId: 'AETNA9wcSu' }, dependents: [{ firstName: 'Jordan', lastName: 'Doe', dateOfBirth: '20010714' }], encounter: MED } },
      { key: 'dep-anthem', label: 'Anthem BCBS CA — dependent John', desc: 'Dependent is the subscriber’s spouse.',
        request: { tradingPartnerServiceId: '040', provider: P, subscriber: { firstName: 'Jane', lastName: 'Doe', memberId: 'CGMBCBSCA123' }, dependents: [{ firstName: 'John', lastName: 'Doe', dateOfBirth: '19750101' }], encounter: MED } },
      { key: 'dep-bcbstx', label: 'BCBS Texas — dependent Jane', desc: 'Dependent child sample.',
        request: { tradingPartnerServiceId: 'G84980', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', memberId: 'A2CBCBSTX123' }, dependents: [{ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '20150101' }], encounter: MED } },
      { key: 'dep-cigna', label: 'Cigna — dependent Jordan', desc: 'Dependent child sample.',
        request: { tradingPartnerServiceId: '62308', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', memberId: 'CIGNAJTUxNm' }, dependents: [{ firstName: 'Jordan', lastName: 'Doe', dateOfBirth: '20150920' }], encounter: MED } },
      { key: 'dep-oscar', label: 'Oscar Health — dependent Jane', desc: 'Dependent sample.',
        request: { tradingPartnerServiceId: 'OSCAR', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', memberId: 'OSCAR123456' }, dependents: [{ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '20010101' }], encounter: MED } },
      { key: 'dep-uhc', label: 'UnitedHealthcare — dependent Jane', desc: 'Dependent spouse sample.',
        request: { tradingPartnerServiceId: '87726', provider: P, subscriber: { firstName: 'John', lastName: 'Doe', memberId: 'UHC202649' }, dependents: [{ firstName: 'Jane', lastName: 'Doe', dateOfBirth: '19521121' }], encounter: MED } },
    ],
  },
  {
    group: 'Dental (service type 35)',
    items: [
      { key: 'dental-ameritas', label: 'Ameritas', desc: 'Dental benefits; individual provider "Plaque Penguin".',
        request: { tradingPartnerServiceId: 'AMTAS00425', provider: { firstName: 'Plaque', lastName: 'Penguin', npi: '1999999984' }, subscriber: { firstName: 'Falcon', lastName: 'Dent', dateOfBirth: '19850607', memberId: '007007007' }, encounter: DENTAL } },
      { key: 'dental-anthem', label: 'Anthem BCBS CA', desc: 'Dental benefits sample.',
        request: { tradingPartnerServiceId: '84103', provider: { organizationName: 'One', npi: '1999999984' }, subscriber: { firstName: 'Aardvark', lastName: 'Dent', dateOfBirth: '19701212', memberId: 'AFK987654321' }, encounter: DENTAL } },
      { key: 'dental-cigna', label: 'Cigna', desc: 'Dental benefits sample.',
        request: { tradingPartnerServiceId: '62308', provider: { organizationName: 'One', npi: '1999999984' }, subscriber: { firstName: 'Jaguar', lastName: 'Dent', dateOfBirth: '19960505', memberId: 'U3141592653' }, encounter: DENTAL } },
      { key: 'dental-cigna-proc', label: 'Cigna — procedure D4341', desc: 'Procedure-level coverage query (periodontal scaling) across 13 dental service types.',
        request: { tradingPartnerServiceId: '62308', provider: { organizationName: 'Smith Associates', npi: '1999999984' }, subscriber: { firstName: 'James', lastName: 'Doe', dateOfBirth: '19010101', memberId: 'U9876543210' },
          encounter: { serviceTypeCodes: ['35', '24', '28', '41', '23', '36', '37', '25', '40', '27', '39', '38', '26'], productOrServiceIDQualifier: 'AD', procedureCode: 'D4341', dateOfService: '20260401' } } },
      { key: 'dental-metlife', label: 'MetLife', desc: 'Dental benefits sample.',
        request: { tradingPartnerServiceId: '10134', provider: { organizationName: 'One', npi: '1999999984' }, subscriber: { firstName: 'Elephant', lastName: 'Dent', dateOfBirth: '19840229', memberId: '88877788' }, encounter: DENTAL } },
      { key: 'dental-uhc', label: 'UnitedHealthcare', desc: 'Dental benefits sample.',
        request: { tradingPartnerServiceId: '52133', provider: { organizationName: 'One', npi: '1999999984' }, subscriber: { firstName: 'Beaver', lastName: 'Dent', dateOfBirth: '19690628', memberId: '404404404' }, encounter: DENTAL } },
    ],
  },
  {
    group: 'MBI lookup (Medicare)',
    items: [
      { key: 'mbi-lookup', label: 'MBI lookup by SSN', desc: 'SSN → Medicare Beneficiary Identifier + benefits (payer MBILU).',
        request: { controlNumber: '112233445', tradingPartnerServiceId: 'MBILU', provider: P, subscriber: { lastName: 'Doe', dateOfBirth: '19550505', ssn: '123456789' }, encounter: MED } },
    ],
  },
  {
    group: 'Error simulations (AAA rejection codes)',
    items: [
      ['UHCAAA42', '42 — Unable to respond at current time', 'Jane', '20010101'],
      ['UHCAAA43', '43 — Invalid/missing provider ID', 'Jane', '19700101'],
      ['UHCAAA72', '72 — Invalid/missing member ID', 'John', '19900101'],
      ['UHCAAA73', '73 — Invalid/missing subscriber name', 'John', '19900101'],
      ['UHCAAA75', '75 — Subscriber not found', 'Jane', '19900101'],
      ['UHCAAA79', '79 — Invalid participant identification', 'John', '19700101'],
    ].map(([memberId, label, firstName, dob]) => ({
      key: memberId.toLowerCase(), label: `UHC — AAA ${label}`, desc: 'Returns subscriber.aaaErrors with follow-up action + possible resolutions.',
      request: { tradingPartnerServiceId: '87726', provider: { organizationName: 'Medical Provider', npi: '1999999984' }, subscriber: { firstName, lastName: 'Doe', dateOfBirth: dob, memberId }, encounter: MED } })),
  },
  {
    group: 'Stedi Agent test',
    items: [
      { key: 'stedi-agent', label: 'Stedi payer — Bernie Prohas (AAA 73)', desc: 'Failing check used to demo "Resolve with Stedi Agent" in the portal.',
        request: { tradingPartnerServiceId: 'STEDI', provider: { organizationName: 'STEDI', npi: '1999999984' }, subscriber: { firstName: 'Bernie', lastName: 'Prohas', memberId: '23051322' }, encounter: MED } },
    ],
  },
];

// Verbatim raw-X12 270 sample (Aetna dependent) — demos the /raw-x12 endpoint.
export const X12_SAMPLE = {
  label: 'Aetna dependent check as raw X12 270',
  x12: 'ISA*00*          *00*          *ZZ*AV09311993     *01*030240928      *210101*1200*^*00501*000000001*0*P*>~GS*HS*1510848*030240928*20210101*120000*1*X*005010X279A1~ST*270*0001*005010X279A1~BHT*0022*13*00000000000000000000000000*20210101*1200~HL*1**20*1~NM1*PR*2*Aetna*****PI*60054~HL*2*1*21*1~NM1*1P*2*Provider Name*****XX*1999999984~HL*3*2*22*1~NM1*IL*1*Doe*John****MI*AETNA9wcSu~HL*4*3*23*0~TRN*1*00000000000000000000000000*3117151744~NM1*03*1*Doe*Jordan~DMG*D8*20010714~EQ*30~SE*14*0001~GE*1*1~IEA*1*000000001~',
};
