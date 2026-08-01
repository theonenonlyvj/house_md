import { NextResponse } from 'next/server';
import { fhirRead } from '../../../../../src/server-lib/medplum';

export const dynamic = 'force-dynamic';

// Provenance drawer: any citation opens the real resource. Dev-local ids return a
// labeled stub so the drawer never lies about its source.
export async function GET(_req: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await ctx.params;
  if (id.startsWith('dev-')) {
    return NextResponse.json({
      resourceType: type,
      id,
      note: 'DEV-LOCAL chart resource — hosted Medplum patient pending (plug Noah’s seed into src/case/default-case.ts)',
    });
  }
  try {
    const r = await fhirRead(type, id);
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e).slice(0, 300) }, { status: 502 });
  }
}
