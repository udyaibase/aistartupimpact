import { z } from 'zod';

/**
 * Server checks for what founders submit about their listings. These are public pages, and server actions can be
 * called with any data, so the browser form's checks aren't enough. Limits are generous on purpose: they stop abuse,
 * not real listings.
 */

/** A full http(s) address on a public host. Rejects javascript: and data: links, embedded logins and local addresses. */
export function isPublicWebUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;
  // A bare IP address isn't a company website (and covers private ranges).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return false;
  return true;
}

const URL_HELP = 'must be a full web address, like https://example.com';
const webUrl = (label: string) => z.string().trim().max(2000, `${label} is too long`).refine(isPublicWebUrl, `${label} ${URL_HELP}`);
const optionalWebUrl = (label: string) => z.union([z.literal(''), webUrl(label)]).optional().nullable();

const text = (label: string, min: number, max: number) =>
  z.string({ required_error: `${label} is required` }).trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be ${max.toLocaleString('en-IN')} characters or fewer`);
const optionalText = (label: string, max: number) =>
  z.string().trim().max(max, `${label} must be ${max.toLocaleString('en-IN')} characters or fewer`).optional().nullable();
const shortList = (label: string, items: number, length: number) =>
  z.array(z.string().trim().max(length, `Each item in ${label} must be ${length} characters or fewer`)).max(items, `${label} can have up to ${items} items`);

const year = (label: string) => {
  const latest = new Date().getFullYear() + 1;
  return z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a year` }).int()
    .min(1900, `${label} looks wrong`).max(latest, `${label} can’t be after ${latest}`);
};
const amount = (label: string) => z.number().min(0, `${label} can’t be negative`).max(1e15, `${label} looks too large`);

const faqs = z.array(z.object({
  question: z.string().trim().max(500, 'FAQ questions must be 500 characters or fewer'),
  answer: z.string().trim().max(5000, 'FAQ answers must be 5,000 characters or fewer'),
  order: z.number().optional(),
}).passthrough()).max(50, 'You can add up to 50 FAQs').optional();

const socialLinks = z.array(z.object({
  platform: z.string().trim().max(50, 'Social platform names must be 50 characters or fewer'),
  url: webUrl('Each social link'),
}).passthrough()).max(30, 'You can add up to 30 social links').optional();

const founderDetails = z.array(z.object({
  name: z.string().trim().max(200, 'Founder names must be 200 characters or fewer'),
  role: optionalText('Founder role', 200),
  prev: optionalText('Founder background', 500),
  bio: optionalText('Founder bio', 5000),
  avatar: optionalWebUrl('Founder photo'),
  linkedin: optionalWebUrl('Founder LinkedIn'),
  twitter: optionalWebUrl('Founder Twitter'),
}).passthrough()).max(50, 'You can add up to 50 founders').optional();

const fundingRounds = z.array(z.object({
  roundType: z.string().trim().max(100, 'Funding round types must be 100 characters or fewer'),
  amountUsd: amount('Funding amount').optional().nullable(),
  amountInr: amount('Funding amount').optional().nullable(),
  leadInvestors: shortList('lead investors', 50, 200).optional(),
  allInvestors: shortList('investors', 200, 200).optional(),
}).passthrough()).max(100, 'You can add up to 100 funding rounds').optional();

export const startupSubmissionSchema = z.object({
  name: text('Startup name', 2, 120),
  tagline: text('Tagline', 1, 500),
  description: text('Description', 1, 20000),
  websiteUrl: webUrl('Website'),
  linkedinUrl: optionalWebUrl('LinkedIn'),
  twitterUrl: optionalWebUrl('Twitter'),
  logoUrl: optionalWebUrl('Logo'),
  foundedYear: year('Founded year'),
  employeeCount: z.number().int().min(0, 'Team size can’t be negative').max(10_000_000, 'Team size looks too large').optional().nullable(),
  headquartersCity: optionalText('City', 200),
  category: optionalText('Category', 200),
  businessType: optionalText('Business type', 200),
  totalFundingInr: amount('Total funding').optional().nullable(),
  founders: shortList('founders', 50, 200),
  faqs,
  fundingRounds,
  foundersData: founderDetails,
  socialLinks,
}).passthrough();

export const toolSubmissionSchema = z.object({
  name: text('Tool name', 2, 120),
  tagline: text('Tagline', 1, 500),
  description: text('Description', 1, 20000),
  websiteUrl: webUrl('Website'),
  affiliateUrl: optionalWebUrl('Affiliate link'),
  pricingUrl: optionalWebUrl('Pricing page'),
  demoVideoUrl: optionalWebUrl('Demo video'),
  logoUrl: optionalWebUrl('Logo'),
  twitterUrl: optionalWebUrl('Twitter'),
  linkedinUrl: optionalWebUrl('LinkedIn'),
  startingPrice: amount('Starting price').optional().nullable(),
  freeTrialDays: z.number().int().min(0, 'Free trial days can’t be negative').max(3650, 'Free trial looks too long').optional().nullable(),
  launchYear: year('Launch year'),
  founderNames: shortList('founder names', 50, 200).optional(),
  features: shortList('features', 100, 500),
  useCases: shortList('use cases', 100, 500),
  pros: shortList('pros', 100, 500).optional(),
  cons: shortList('cons', 100, 500).optional(),
  screenshotUrls: z.array(webUrl('Each screenshot')).max(30, 'You can add up to 30 screenshots'),
  tagIds: shortList('tags', 200, 100).optional(),
  headquartersCity: optionalText('City', 200),
  headquartersCountry: optionalText('Country', 200),
  faqs,
  socialLinks,
}).passthrough();
