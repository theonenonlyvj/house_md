#!/usr/bin/env node
// Seeds ANY case definition from scripts/cases/ into hosted Medplum.
//
//   node scripts/seed-case.mjs tuan-pham        # one case
//   node scripts/seed-case.mjs --all            # every case in scripts/cases/
//
// Idempotent: every resource carries a stable identifier under SYSTEM, so reruns
// upsert in place rather than duplicating. Replaces the per-patient seed scripts —
// the chart content lives in the case definition, never in this file.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { medplumToken, upsertByIdentifier, ROOT } from './lib.mjs';

const SYSTEM = 'https://housemd.example/seed';
const SYNTHETIC_NOTE =
  'Synthetic demo record. Terminology coding intentionally omitted (text-only) pending clinical review.';
const CASES_DIR = resolve(ROOT, 'scripts/cases');

// --- Relative dates (DEMO_SPEC §9: demo dates are relative; the demo never goes stale) ---
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};
// A case date is either a literal ISO day ('2019-03-08') or { daysAgo: 16 }.
const resolveDate = (value) => (typeof value === 'object' && value !== null ? daysAgo(value.daysAgo) : value);

function usage(code) {
  const available = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `  ${f.replace(/\.mjs$/, '')}`)
    .join('\n');
  console.log(`Usage: node scripts/seed-case.mjs <case-id> | --all\n\nAvailable cases:\n${available}`);
  process.exit(code);
}

async function seedCase(token, def) {
  const ids = {};
  const seed = async (slug, resource) => {
    const identifier = { system: SYSTEM, value: slug };
    const saved = await upsertByIdentifier(token, { ...resource, identifier: [identifier] }, identifier);
    ids[slug] = `${saved.resourceType}/${saved.id}`;
    process.stdout.write('.');
    return saved;
  };

  // --- Patient ---
  const p = def.patient;
  const patient = await seed(def.slug, {
    resourceType: 'Patient',
    active: true,
    name: [{ use: 'official', family: p.family, given: p.given }],
    gender: p.gender,
    birthDate: p.birthDate,
    address: [{ use: 'home', city: p.city, state: p.state, country: 'US' }],
    communication: (p.languages || []).map((language, i) => ({
      language: { text: language },
      ...(i === 0 ? { preferred: true } : {}),
    })),
    ...(p.contact
      ? {
          contact: [
            {
              relationship: [{ text: p.contact.relationship }],
              name: { family: p.contact.family, given: p.contact.given },
            },
          ],
        }
      : {}),
    extension: [
      { url: 'https://housemd.example/fhir/StructureDefinition/synthetic-data', valueBoolean: true },
    ],
  });
  const subject = { reference: `Patient/${patient.id}`, display: `${p.given.join(' ')} ${p.family}` };

  // --- Builders (text-only CodeableConcepts; AGENTS.md forbids invented SNOMED/LOINC) ---
  const category = (code) => [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code }] },
  ];
  const encounterRefs = {};

  for (const c of def.conditions || []) {
    await seed(c.slug, {
      resourceType: 'Condition',
      subject,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: c.clinicalStatus || 'active',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: c.verification || 'confirmed',
          },
        ],
      },
      code: { text: c.display },
      onsetDateTime: resolveDate(c.onset),
      recordedDate: resolveDate(c.onset),
      note: [{ text: c.note ? `${c.note} ${SYNTHETIC_NOTE}` : SYNTHETIC_NOTE }],
    });
  }

  for (const m of def.medications || []) {
    await seed(m.slug, {
      resourceType: 'MedicationRequest',
      status: m.status || 'active',
      intent: 'order',
      subject,
      medicationCodeableConcept: { text: m.display },
      authoredOn: resolveDate(m.started),
      dosageInstruction: [{ text: m.dosage }],
      note: [{ text: m.note ? `${m.note} ${SYNTHETIC_NOTE}` : SYNTHETIC_NOTE }],
    });
  }

  // Encounters seed before the findings that reference them.
  for (const e of def.encounters || []) {
    const date = resolveDate(e.date);
    const saved = await seed(e.slug, {
      resourceType: 'Encounter',
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: e.class || 'AMB' },
      subject,
      type: [{ text: e.display }],
      period: { start: date, end: resolveDate(e.end) || date },
      reasonCode: [{ text: e.reason }],
    });
    encounterRefs[e.slug] = { reference: `Encounter/${saved.id}` };
  }

  for (const o of def.observations || []) {
    await seed(o.slug, {
      resourceType: 'Observation',
      status: 'final',
      subject,
      category: category(o.category || 'laboratory'),
      code: { text: o.display },
      effectiveDateTime: resolveDate(o.date),
      valueString: o.value,
      note: [{ text: SYNTHETIC_NOTE }],
      ...(o.encounter ? { encounter: encounterRefs[o.encounter] } : {}),
      ...(o.flag
        ? {
            interpretation: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                    code: o.flag,
                  },
                ],
                text: o.flag === 'H' ? 'HIGH' : o.flag === 'L' ? 'LOW' : o.flag,
              },
            ],
          }
        : {}),
    });
  }

  for (const r of def.reports || []) {
    await seed(r.slug, {
      resourceType: 'DiagnosticReport',
      status: 'final',
      subject,
      code: { text: r.display },
      effectiveDateTime: resolveDate(r.date),
      conclusion: r.conclusion,
      ...(r.encounter ? { encounter: encounterRefs[r.encounter] } : {}),
    });
  }

  for (const s of def.serviceRequests || []) {
    await seed(s.slug, {
      resourceType: 'ServiceRequest',
      status: s.status || 'active',
      intent: 'order',
      subject,
      code: { text: s.display },
      authoredOn: resolveDate(s.date),
      note: [{ text: s.note || SYNTHETIC_NOTE }],
    });
  }

  for (const pr of def.procedures || []) {
    await seed(pr.slug, {
      resourceType: 'Procedure',
      status: 'completed',
      subject,
      code: { text: pr.display },
      performedDateTime: resolveDate(pr.date),
      note: [{ text: pr.note ? `${pr.note} ${SYNTHETIC_NOTE}` : SYNTHETIC_NOTE }],
    });
  }

  // --- Coverage: member id must match the Stedi sandbox scenario the case names ---
  if (def.coverage) {
    const c = def.coverage;
    await seed(`coverage-${def.id}`, {
      resourceType: 'Coverage',
      status: 'active',
      type: { text: c.type },
      subscriberId: c.subscriberId,
      beneficiary: { reference: `Patient/${patient.id}` },
      payor: [{ display: c.payor }],
      class: [
        {
          type: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'plan' }],
            text: 'plan',
          },
          value: c.type,
          name: c.planNote,
        },
      ],
    });
  }

  process.stdout.write('\n');
  return { ids, patientId: patient.id };
}

// --- main ---
const arg = process.argv[2];
if (!arg || arg === '--help' || arg === '-h') usage(arg ? 0 : 1);

const wanted =
  arg === '--all'
    ? readdirSync(CASES_DIR)
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => f.replace(/\.mjs$/, ''))
    : [arg];

const token = await medplumToken();
const outDir = resolve(ROOT, 'scripts/out');
mkdirSync(outDir, { recursive: true });

for (const id of wanted) {
  let def;
  try {
    def = (await import(resolve(CASES_DIR, `${id}.mjs`))).default;
  } catch {
    console.error(`No case definition at scripts/cases/${id}.mjs`);
    usage(1);
  }
  process.stdout.write(`${def.title}\n  `);
  const { ids, patientId } = await seedCase(token, def);
  writeFileSync(resolve(outDir, `${def.id}-ids.json`), `${JSON.stringify(ids, null, 2)}\n`);
  console.log(
    `  Seeded synthetic Patient/${patientId} plus ${Object.keys(ids).length - 1} chart resources → scripts/out/${def.id}-ids.json`
  );
}
console.log(`\nDone. ${wanted.length} case${wanted.length === 1 ? '' : 's'} seeded. Dates are relative to today.`);
