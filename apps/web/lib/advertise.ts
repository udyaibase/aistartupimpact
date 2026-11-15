import { sql } from '@/lib/db';

// ── Availability ─────────────────────────────────────────

/**
 * Self-serve ad purchases are switched off until the flow is finished: no public page shows the zones a founder
 * buys, no GST invoice is issued for these payments, and activation relies on the webhook alone. While off, the
 * purchase routes refuse to create orders, so nobody can pay for something that isn't delivered.
 * Set ADVERTISE_SELF_SERVE=on to open them again.
 */
export const selfServeAdsEnabled = () => process.env.ADVERTISE_SELF_SERVE === 'on';
export const SELF_SERVE_ADS_OFF = { success: false, error: 'Advertising packages can’t be bought online yet. Contact us to book a placement.', code: 'ADS_UNAVAILABLE' } as const;

// ── Pricing Constants (single source of truth) ───────────

export const GST_RATE = 0.18;

export const PACKAGE_PRICES: Record<PackageTier, number> = {
  FREE: 0,
  STARTER: 299900,
  GROWTH: 599900,
  PREMIUM: 999900,
};

export const ZONE_EXTENSION_RATES: Record<ZoneTier, number> = {
  TIER_1: 19900,
  TIER_2: 14900,
  TIER_3: 9900,
};

export const SOCIAL_POST_PRICES: Record<SocialPostType, number> = {
  LINKEDIN: 99900,
  INSTAGRAM: 99900,
  BUNDLE: 179900,
};

export const FREE_DAYS_PER_ZONE = 3;
export const PACKAGE_VALIDITY_DAYS = 365;
export const FREE_TIER_MONTHLY_POSTS = 3;
export const TEAM_LIMITS: Record<PackageTier, number> = {
  FREE: 1,
  STARTER: 5,
  GROWTH: 5,
  PREMIUM: Infinity,
};

// ── Types ─────────────────────────────────────────────────

export type PackageTier = 'FREE' | 'STARTER' | 'GROWTH' | 'PREMIUM';
export type ZoneTier = 'TIER_1' | 'TIER_2' | 'TIER_3';
export type SocialPostType = 'LINKEDIN' | 'INSTAGRAM' | 'BUNDLE';

export type AdvZoneSlot =
  | 'PROMO_BADGE_HEADER' | 'HOMEPAGE_HERO' | 'POWERED_BY_SECTION'
  | 'FOUNDER_SPOTLIGHT' | 'FEATURED_PARTNER' | 'WEBSITE_NEWSLETTER_FEATURED' | 'LINKEDIN_NEWSLETTER_FEATURED'
  | 'LATEST_STORIES_CARD_1' | 'AI_TOOL_PICKS' | 'STORIES_PAGE_FEATURED' | 'AI_TOOLS_PAGE_FEATURED' | 'STARTUP_DIRECTORY_FEATURED';

// ── Zone → Tier Mapping ──────────────────────────────────

const ZONE_TIER_MAP: Record<AdvZoneSlot, ZoneTier> = {
  PROMO_BADGE_HEADER: 'TIER_1',
  HOMEPAGE_HERO: 'TIER_1',
  POWERED_BY_SECTION: 'TIER_1',
  FOUNDER_SPOTLIGHT: 'TIER_2',
  FEATURED_PARTNER: 'TIER_2',
  WEBSITE_NEWSLETTER_FEATURED: 'TIER_2',
  LINKEDIN_NEWSLETTER_FEATURED: 'TIER_2',
  LATEST_STORIES_CARD_1: 'TIER_3',
  AI_TOOL_PICKS: 'TIER_3',
  STORIES_PAGE_FEATURED: 'TIER_3',
  AI_TOOLS_PAGE_FEATURED: 'TIER_3',
  STARTUP_DIRECTORY_FEATURED: 'TIER_3',
};

// Which package tiers can access which zone tiers
const TIER_ACCESS: Record<PackageTier, ZoneTier[]> = {
  FREE: [],
  STARTER: ['TIER_3'],
  GROWTH: ['TIER_2', 'TIER_3'],
  PREMIUM: ['TIER_1', 'TIER_2', 'TIER_3'],
};

// Package tier ordering for upgrades
const TIER_ORDER: Record<PackageTier, number> = {
  FREE: 0, STARTER: 1, GROWTH: 2, PREMIUM: 3,
};

// ── Entitlements ─────────────────────────────────────────

export interface Entitlements {
  packageId: string | null;
  tier: PackageTier;
  status: string;
  expiresAt: Date | null;
  availableZones: AdvZoneSlot[];
  activatedZones: { zone: AdvZoneSlot; freeUsed: boolean; status: string }[];
  canPostSocial: boolean;
  founderPostLimit: number | null;
  teamMemberLimit: number;
  hasAdvancedAnalytics: boolean;
}

export async function getEntitlements(founderId: string): Promise<Entitlements> {
  const packages = await sql`
    SELECT id, tier, status, "expiresAt"
    FROM "AdvPackage"
    WHERE "founderId" = ${founderId}
      AND status = 'ACTIVE'
      AND "expiresAt" > NOW()
    ORDER BY "purchasedAt" DESC
    LIMIT 1
  `;

  const pkg = packages[0];
  if (!pkg) {
    return {
      packageId: null,
      tier: 'FREE',
      status: 'ACTIVE',
      expiresAt: null,
      availableZones: [],
      activatedZones: [],
      canPostSocial: false,
      founderPostLimit: FREE_TIER_MONTHLY_POSTS,
      teamMemberLimit: TEAM_LIMITS.FREE,
      hasAdvancedAnalytics: false,
    };
  }

  const tier = pkg.tier as PackageTier;
  const accessibleTiers = TIER_ACCESS[tier];
  const availableZones = (Object.entries(ZONE_TIER_MAP) as [AdvZoneSlot, ZoneTier][])
    .filter(([, zt]) => accessibleTiers.includes(zt))
    .map(([slot]) => slot);

  const activations = await sql`
    SELECT zone, status, "freeDaysUsed"
    FROM "AdvZoneActivation"
    WHERE "packageId" = ${pkg.id}
  `;

  return {
    packageId: pkg.id,
    tier,
    status: pkg.status,
    expiresAt: new Date(pkg.expiresAt),
    availableZones,
    activatedZones: activations.map((a: Record<string, unknown>) => ({
      zone: a.zone as AdvZoneSlot,
      freeUsed: (a.freeDaysUsed as number) > 0,
      status: a.status as string,
    })),
    canPostSocial: tier === 'GROWTH' || tier === 'PREMIUM',
    founderPostLimit: tier === 'FREE' ? FREE_TIER_MONTHLY_POSTS : null,
    teamMemberLimit: TEAM_LIMITS[tier],
    hasAdvancedAnalytics: tier !== 'FREE',
  };
}

// ── Validation Helpers ───────────────────────────────────

export function getZoneTier(zone: AdvZoneSlot): ZoneTier {
  const tier = ZONE_TIER_MAP[zone];
  if (!tier) throw new Error(`Unknown zone: ${zone}`);
  return tier;
}

export function canAccessZone(packageTier: PackageTier, zone: AdvZoneSlot): boolean {
  const zoneTier = getZoneTier(zone);
  return TIER_ACCESS[packageTier].includes(zoneTier);
}

export function isValidUpgrade(from: PackageTier, to: PackageTier): boolean {
  return TIER_ORDER[to] > TIER_ORDER[from];
}

export function getUpgradePrice(from: PackageTier, to: PackageTier): number {
  if (!isValidUpgrade(from, to)) return 0;
  return PACKAGE_PRICES[to] - PACKAGE_PRICES[from];
}

export function calculateGst(amountPaise: number): number {
  return Math.round(amountPaise * GST_RATE);
}

export function calculateTotal(amountPaise: number): { amount: number; gst: number; total: number } {
  const gst = calculateGst(amountPaise);
  return { amount: amountPaise, gst, total: amountPaise + gst };
}

export function calculateExtensionCost(zone: AdvZoneSlot, extraDays: number): { amount: number; gst: number; total: number } {
  const zoneTier = getZoneTier(zone);
  const rate = ZONE_EXTENSION_RATES[zoneTier];
  const amount = rate * extraDays;
  return calculateTotal(amount);
}

export function getFounderPostCountThisMonth(founderId: string): Promise<number> {
  return sql`
    SELECT COUNT(*)::int as count
    FROM "Article"
    WHERE "founderAuthorId" = ${founderId}
      AND "createdAt" >= date_trunc('month', NOW())
      AND "createdAt" < date_trunc('month', NOW()) + interval '1 month'
  `.then(r => r[0]?.count || 0);
}
