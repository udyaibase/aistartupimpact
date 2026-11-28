

export const pricingModels = ['FREE', 'FREEMIUM', 'PAID', 'ENTERPRISE', 'OPEN_SOURCE'];

export const listingTiers = ['STANDARD', 'PRIORITY', 'FEATURED'];

export const statuses = ['PENDING', 'APPROVED', 'ARCHIVED'];

export interface Tool {
  id: string;
  name: string;
  slug: string;
  slugChangedAt?: string | null;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl: string;
  affiliateUrl?: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number | null;
  freeTrialDays?: number | null;
  demoVideoUrl?: string;
  avgRating: number;
  listingTier: string;
  status: string;
  categoryId: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  launchYear?: number;
  founderNames?: string[];
  headquartersCountry?: string;
  headquartersCity?: string;
  screenshotUrls?: string[];
  screenshotMeta?: Record<string, any>;
  twitterUrl?: string;
  linkedinUrl?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  parentIcon?: string | null;
}
