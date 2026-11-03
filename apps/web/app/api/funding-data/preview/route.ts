import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { facets, loadDataset, selectStartups } from '@/lib/funding/dataset';
import { packOptions, parseFilters, PACKS } from '@/lib/funding/packs';

export const dynamic = 'force-dynamic';

/**
 * Live count for the dataset picker: how many startups match the filters, which packs make sense, and the top
 * few names (a taste, not the data). With `facets: true`, also the sector, stage and city choices.
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `funding-preview:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const filters = parseFilters(body.filters);
  const all = await loadDataset();
  const { matched, startups } = selectStartups(all, filters, 5);
  return NextResponse.json({
    matched,
    directoryTotal: all.length,
    packs: packOptions(matched, all.length).map((o) => ({ ...o, name: PACKS[o.key].name, totalPaise: PACKS[o.key].totalPaise, blurb: PACKS[o.key].blurb })),
    sample: startups.map((s) => s.name),
    ...(body.facets ? { facets: facets(all) } : {}),
  });
}
