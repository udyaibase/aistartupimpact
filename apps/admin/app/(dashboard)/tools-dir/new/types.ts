

export const pricingModels = ['FREE', 'FREEMIUM', 'PAID', 'ENTERPRISE', 'OPEN_SOURCE'];

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  parentIcon?: string | null;
}

/** The fields of the add-tool form. */
export interface NewToolForm {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  affiliateUrl: string;
  demoVideoUrl: string;
  categoryId: string;
  pricingModel: string;
  pricingUrl: string;
  startingPrice: number | null;
  freeTrialDays: number | null;
  hasApi: boolean;
  hasMobileApp: boolean;
  launchYear: number;
  founderNames: string;
  headquartersCountry: string;
  headquartersCity: string;
  avgRating: number;
  features: string;
  useCases: string;
  twitterUrl: string;
  linkedinUrl: string;
}
