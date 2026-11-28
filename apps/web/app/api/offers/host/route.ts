import { NextResponse } from 'next/server';
import { publicOffer } from '@/lib/offers/claim';

export const dynamic = 'force-dynamic';

/** The offer advertised on the host sign-up page, if one is running and marked public. Public and read-only. */
export async function GET() {
  const offer = await publicOffer('HOST');
  return NextResponse.json(
    { offer: offer ? { headline: offer.headline, placesLeft: offer.placesLeft, endsAt: offer.endsAt.toISOString() } : null },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  );
}
