import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getFounderSession } from '@/lib/founder-auth';
import {
  getEntitlements,
  canAccessZone,
  getZoneTier,
  FREE_DAYS_PER_ZONE,
  type AdvZoneSlot, selfServeAdsEnabled, SELF_SERVE_ADS_OFF,
} from '@/lib/advertise';

export const dynamic = 'force-dynamic';

const VALID_ZONES: AdvZoneSlot[] = [
  'PROMO_BADGE_HEADER', 'HOMEPAGE_HERO', 'POWERED_BY_SECTION',
  'FOUNDER_SPOTLIGHT', 'FEATURED_PARTNER', 'WEBSITE_NEWSLETTER_FEATURED', 'LINKEDIN_NEWSLETTER_FEATURED',
  'LATEST_STORIES_CARD_1', 'AI_TOOL_PICKS', 'STORIES_PAGE_FEATURED', 'AI_TOOLS_PAGE_FEATURED', 'STARTUP_DIRECTORY_FEATURED',
];

// POST — activate a zone's 3 free days
export async function POST(request: NextRequest) {
  if (!selfServeAdsEnabled()) return NextResponse.json(SELF_SERVE_ADS_OFF, { status: 503 });
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const zone = body.zone as AdvZoneSlot;

    if (!zone || !VALID_ZONES.includes(zone)) {
      return NextResponse.json({ success: false, error: 'Invalid zone' }, { status: 400 });
    }

    const entitlements = await getEntitlements(session.userId);

    if (!entitlements.packageId) {
      return NextResponse.json({ success: false, error: 'No active package. Purchase a package first.' }, { status: 403 });
    }

    if (!canAccessZone(entitlements.tier, zone)) {
      return NextResponse.json({
        success: false,
        error: `Your ${entitlements.tier} package does not include ${zone}. Upgrade to access this zone.`,
      }, { status: 403 });
    }

    // Check if already activated
    const existing = entitlements.activatedZones.find(a => a.zone === zone);
    if (existing) {
      return NextResponse.json({
        success: false,
        error: `Zone ${zone} is already activated (status: ${existing.status}). Use the extend endpoint for more days.`,
      }, { status: 409 });
    }

    const startsAt = new Date();
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + FREE_DAYS_PER_ZONE);

    const activation = await prisma.advZoneActivation.create({
      data: {
        packageId: entitlements.packageId,
        zone,
        zoneTier: getZoneTier(zone),
        status: 'ACTIVE',
        startsAt,
        endsAt,
        freeDaysUsed: FREE_DAYS_PER_ZONE,
        extensionDays: 0,
        extensionRate: 0,
        extensionTotal: 0,
      },
    });

    return NextResponse.json({ success: true, activation });
  } catch (err) {
    console.error('[zones/activate POST]', err);
    return NextResponse.json({ success: false, error: 'Something went wrong' }, { status: 500 });
  }
}
