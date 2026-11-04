/**
 * Which edits to a public listing go live straight away, and which wait for an admin. Decided field by field, so a
 * founder's description can publish while their new website waits, with the old website still showing.
 */

export type ListingType = 'startup' | 'tool';
export type ListingFields = Record<string, unknown>;

/** Who the listing says it is. These always wait for an admin. */
export const IDENTITY_FIELDS = ['name', 'websiteUrl', 'logoUrl'] as const;

export function decideListingEdit(
  listing: { isLive: boolean; isVerified: boolean },
  changedFields: string[],
): { publish: string[]; review: string[] } {
  // Not public yet: the whole listing gets reviewed before it appears, so nothing waits separately.
  if (!listing.isLive) return { publish: changedFields, review: [] };
  if (!listing.isVerified) return { publish: [], review: changedFields };
  const identity = IDENTITY_FIELDS as readonly string[];
  return {
    publish: changedFields.filter((f) => !identity.includes(f)),
    review: changedFields.filter((f) => identity.includes(f)),
  };
}

/** A stable form for comparing values: empty means empty however it's stored, and key order doesn't matter. */
export function canonicalValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) {
    const items = value.map(canonicalValue).filter((v) => v !== null);
    return items.length === 0 ? null : items;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, canonicalValue(v)] as const)
      .filter(([, v]) => v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length === 0 ? null : Object.fromEntries(entries);
  }
  return value;
}

export const sameListingValue = (a: unknown, b: unknown) => JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));

/** The fields present in `incoming` whose value differs from `current`. */
export function changedListingFields(current: ListingFields, incoming: ListingFields): string[] {
  return Object.keys(incoming).filter((f) => incoming[f] !== undefined && !sameListingValue(current[f], incoming[f]));
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', tagline: 'Tagline', description: 'Description', websiteUrl: 'Website', logoUrl: 'Logo',
  linkedinUrl: 'LinkedIn', twitterUrl: 'Twitter', socialLinks: 'Social links', foundedYear: 'Founded year',
  headquartersCity: 'City', headquartersCountry: 'Country', stage: 'Stage', employeeCount: 'Team size',
  totalFundingInr: 'Total funding', category: 'Category', businessType: 'Business type', status: 'Company status',
  faqs: 'FAQs', fundingRounds: 'Funding rounds', foundersData: 'Founder details', founders: 'Founder names',
  affiliateUrl: 'Affiliate link', categoryId: 'Category', pricingModel: 'Pricing model', pricingUrl: 'Pricing page',
  startingPrice: 'Starting price', hasApi: 'API available', hasMobileApp: 'Mobile app', launchYear: 'Launch year',
  founderNames: 'Founder names', screenshotUrls: 'Screenshots', demoVideoUrl: 'Demo video', freeTrialDays: 'Free trial',
  features: 'Key features', useCases: 'Use cases', pros: 'Pros', cons: 'Cons', tagIds: 'Tags',
};

export const listingFieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

/** A short, readable version of a field's value, for review screens. */
export function listingValueText(value: unknown): string {
  const v = canonicalValue(value);
  if (v === null) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

/** Registrable domains, shared by every check that compares a website or work email to a company. */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'ac.in', 'edu.in', 'gov.in', 'res.in',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.sg', 'com.my', 'co.jp',
  'com.br', 'co.za', 'com.mx', 'co.id', 'com.ph', 'com.cn', 'com.hk', 'com.tw', 'co.kr',
]);

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export function websiteDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  try {
    return registrableDomain(new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`).hostname);
  } catch {
    return null;
  }
}
