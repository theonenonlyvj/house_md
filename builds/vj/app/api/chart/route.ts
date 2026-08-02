import { NextResponse } from 'next/server';
import { loadChart } from '../../../src/server-lib/chart';
import { CASES, caseById, DEFAULT_CASE_ID } from '../../../src/case/cases';
import { runEligibility } from '../../../src/server-lib/stedi';
import { decideSeating, deriveFeatures } from '../../../src/council/seating';
import { ROSTER, personaById } from '../../../src/council/personas';

export const dynamic = 'force-dynamic';

// Read-only chart summary for the provider app — real hosted-Medplum data, never
// touches the live council session. `?case=<id>` picks the patient; the roster of
// seeded patients ships alongside so the provider page can offer a list.
//
// Coverage is pulled here too, so benefits are already on screen before anyone
// convenes. A failed eligibility call renders as unavailable, never as a number.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const caseId = url.searchParams.get('case') || DEFAULT_CASE_ID;
  const cfg = caseById(caseId);
  if (!cfg) {
    return NextResponse.json({ error: `Unknown case "${caseId}"` }, { status: 404 });
  }

  const roster = CASES.map((c) => ({
    id: c.id,
    family: c.patientLocator.nameFallback?.family || c.id,
    given: c.patientLocator.nameFallback?.given || '',
    reasonForVisit: c.reasonForVisit,
  }));

  try {
    const chart = await loadChart(cfg);
    // Coverage is a separate provider; a failure there must not blank the chart.
    const benefits = await runEligibility(cfg.stediScenario)
      .then((r) => r.facts)
      .catch(() => null);

    // Who this record alone would convene. The same pure functions the consult
    // uses, minus the clinician's spoken presentation — so the provider can see the
    // likely panel before convening, and watch it change once they actually speak.
    const features = deriveFeatures(chart.resources, { age: chart.age, sex: chart.sex }, cfg.chiefComplaint);
    const preview = decideSeating(features, ROSTER, cfg.clinicianSpecialty).seats
      .filter((s) => s.status !== 'human' && personaById(s.personaId || '')?.kind !== 'chair')
      .map((s) => ({
        specialty: s.specialty,
        status: s.status,
        name: s.personaName,
        reason: s.reasons[0],
      }));

    return NextResponse.json({
      caseId: cfg.id,
      roster,
      banner: chart.banner,
      source: chart.source,
      benefits,
      age: chart.age,
      sex: chart.sex,
      chiefComplaint: cfg.chiefComplaint,
      preview,
      resources: chart.aliases.map((a) => ({
        resourceType: a.resourceType,
        display: a.display,
        fact: a.fact,
        date: a.date || '',
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ roster, error: String(e.message || e).slice(0, 200) }, { status: 502 });
  }
}
