import { NextResponse } from 'next/server';
import { loadChart } from '../../../src/server-lib/chart';

export const dynamic = 'force-dynamic';

// Read-only chart summary for the EHR launch screen — real hosted-Medplum data,
// never touches the live council session.
export async function GET() {
  try {
    const chart = await loadChart();
    return NextResponse.json({
      banner: chart.banner,
      source: chart.source,
      resources: chart.aliases.map((a) => ({
        resourceType: a.resourceType,
        display: a.display,
        date: a.date || '',
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e).slice(0, 200) }, { status: 502 });
  }
}
