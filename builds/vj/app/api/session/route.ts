import { NextResponse } from 'next/server';
import { getState } from '../../../src/server-lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getState());
}
