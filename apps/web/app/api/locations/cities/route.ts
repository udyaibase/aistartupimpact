import { NextResponse } from 'next/server';
import { getExtraCities } from '@/lib/locations';

export const revalidate = 300;

/** Admin-added cities for the city pickers (the shared list ships with the code). */
export async function GET() {
  return NextResponse.json({ cities: await getExtraCities() }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
