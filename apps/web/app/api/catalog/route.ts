import { NextResponse } from 'next/server';
import { currentCatalog } from '@udyaibase/utils/catalog';
import { catalogVersionInForce, ensureCatalog } from '@/lib/catalog/server';

export const dynamic = 'force-dynamic';

/**
 * The plan catalog in force: public prices and limits, the same figures the pricing pages print. Browser components
 * that show a plan's price or limit read it from here (lib/catalog/use-catalog.ts) instead of the values in their bundle.
 */
export async function GET() {
  await ensureCatalog();
  return NextResponse.json({ version: catalogVersionInForce(), catalog: currentCatalog() }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
