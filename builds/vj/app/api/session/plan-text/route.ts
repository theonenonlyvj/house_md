import { NextResponse } from 'next/server';
import { getPatientPlanText } from '../../../../src/server-lib/council';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ text: getPatientPlanText() });
}
