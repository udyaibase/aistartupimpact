import { getDomain, getPublicSuffix } from 'tldts';
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

/**
 * Registrable domain (eTLD+1) from the Public Suffix List, including its private section, shared by every check
 * that compares a website or work email to a company. acme.co.in → acme.co.in, app.acme.com.au → acme.com.au, and
 * hosting platforms count as suffixes: acme.vercel.app → acme.vercel.app, so a mailbox at vercel.app never matches it.
 * A bare suffix (vercel.app, co.in) or an IP address comes back as the host itself.
 */
export function registrableDomain(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}

/**
 * Big platforms where a company's "website" is often just a page on someone else's domain. Their own root site
 * (google.com, linkedin.com) is a real company domain; a page or subdomain on them (sites.google.com/view/acme,
 * linkedin.com/company/acme, linktr.ee/acme) is not.
 */
const PLATFORM_DOMAINS = new Set([
  'google.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'github.com',
  'gitlab.com', 'medium.com', 'linktr.ee', 'apple.com', 'producthunt.com', 'crunchbase.com', 'wellfound.com', 'angel.co',
  'bit.ly', 'wa.me', 'whatsapp.com', 't.me', 'notion.so', 'tracxn.com', 'substack.com', 'behance.net', 'dribbble.com',
  'wix.com', 'webflow.com', 'canva.com', 'canva.site', 'carrd.co', 'beacons.ai', 'bio.link', 'about.me',
]);

function parseSite(websiteUrl: string): { host: string; path: string } | null {
  try {
    const u = new URL(/^https?:\/\//i.test(websiteUrl.trim()) ? websiteUrl.trim() : `https://${websiteUrl.trim()}`);
    return { host: u.hostname.toLowerCase().replace(/\.$/, ''), path: u.pathname.replace(/\/+$/, '') };
  } catch {
    return null;
  }
}

/** A website that's only a page or subdomain on a big platform (see PLATFORM_DOMAINS), not a company domain. */
export function isPlatformPage(websiteUrl: string | null | undefined): boolean {
  if (!websiteUrl) return false;
  const site = parseSite(websiteUrl);
  if (!site) return false;
  const reg = registrableDomain(site.host);
  if (!PLATFORM_DOMAINS.has(reg)) return false;
  const bareHost = site.host.replace(/^www\./, '');
  return bareHost !== reg || site.path !== '';
}

/**
 * True when the site lives on a hosting platform's own suffix (acme.vercel.app, acme.github.io, acme.notion.site):
 * a separate company for matching, but nobody has a mailbox there and its DNS belongs to the platform.
 */
export function isPlatformHosted(websiteUrl: string | null | undefined): boolean {
  if (!websiteUrl) return false;
  const site = parseSite(websiteUrl);
  if (!site) return false;
  const priv = getPublicSuffix(site.host, { allowPrivateDomains: true });
  const icann = getPublicSuffix(site.host, { allowPrivateDomains: false });
  return !!priv && priv !== icann;
}

/**
 * The company domain behind a website, or null when there isn't one: no usable address, a bare suffix, or just a
 * page on a big platform (see isPlatformPage).
 */
export function websiteDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  const site = parseSite(websiteUrl);
  if (!site || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(site.host)) return null;
  if (!getDomain(site.host, { allowPrivateDomains: true })) return null;
  if (isPlatformPage(websiteUrl)) return null;
  return registrableDomain(site.host);
}
