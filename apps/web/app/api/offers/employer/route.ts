import { NextResponse } from 'next/server';
import { publicEmployerOffer } from '@/lib/offers/claim';

export const dynamic = 'force-dynamic';

/**
 * The offer advertised on the employer sign-up page, if one is running and marked public
 * (Admin → Billing → Offers). Public and read-only: a headline, the places left and the end date.
 */
export async function GET() {
  const offer = await publicEmployerOffer();
  return NextResponse.json(
    { offer: offer ? { headline: offer.headline, placesLeft: offer.placesLeft, endsAt: offer.endsAt.toISOString() } : null },
    // Shared for a minute: "places left" may trail by a few, which the grant itself (exact) makes harmless.
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  );
}
