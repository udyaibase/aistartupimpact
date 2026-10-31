/**
 * Public visibility rule for job listings, shared by every public surface
 * (jobs page, detail page, sitemap, startup profile, website widget, schema).
 * Visibility never depends on a cron: a listing past its closing date is hidden immediately.
 * Listings on moderation hold (reported, awaiting admin review) are hidden too.
 */

/** Raw-SQL condition; `alias` is the JobBoardListing table alias used in the query. */
export function publicListingCondition(alias = 'l'): string {
  const a = alias ? `${alias}.` : '';
  return `${a}"status" = 'OPEN' AND ${a}"deletedAt" IS NULL AND ${a}"moderationHold" = false AND (${a}"expiresAt" IS NULL OR ${a}"expiresAt" > NOW())`;
}

/** Prisma `where` equivalent. */
export function publicListingWhere(now = new Date()) {
  return {
    status: 'OPEN' as const,
    deletedAt: null,
    moderationHold: false,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export function isListingPublic(l: { status: string; deletedAt: Date | string | null; expiresAt: Date | string | null; moderationHold?: boolean }, now = Date.now()): boolean {
  if (l.status !== 'OPEN' || l.deletedAt || l.moderationHold) return false;
  return !l.expiresAt || new Date(l.expiresAt).getTime() > now;
}


/** JobPosting baseSalary; Google rejects salary markup without a unit. */
export function jobPostingSalary(l: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null }) {
  if (!l.salaryMin && !l.salaryMax) return undefined;
  return {
    '@type': 'MonetaryAmount',
    currency: l.salaryCurrency || 'INR',
    value: {
      '@type': 'QuantitativeValue',
      ...(l.salaryMin ? { minValue: l.salaryMin } : {}),
      ...(l.salaryMax ? { maxValue: l.salaryMax } : {}),
      unitText: 'YEAR',
    },
  };
}
