import { Metadata } from 'next';
import type { SeoConfig } from './seo-config';
import type { BrandConfig } from './brand';

const DEFAULT_DOMAIN = 'https://udyaibase.com';
const DEFAULT_NAME = 'Udyaibase';
const DEFAULT_TWITTER = '@aikitstartup';

function domain(seo?: Partial<SeoConfig>) {
  return (seo?.canonicalDomain || DEFAULT_DOMAIN).replace(/\/$/, '');
}

// ─── Site-level schemas (injected once in root layout) ───────────────────────

export function generateWebSiteSchema(seo?: Partial<SeoConfig>) {
  const d = domain(seo);
  const name = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: d,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${d}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateOrganizationSchema(seo?: Partial<SeoConfig>, brand?: Partial<BrandConfig>) {
  const d = domain(seo);
  const name = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  const sameAs = [
    seo?.socialTwitter,
    seo?.socialLinkedin,
    seo?.socialYoutube,
    seo?.socialInstagram,
    seo?.socialFacebook,
  ].filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    alternateName: "AI Startup India",
    description: seo?.metaDescription || "Udyaibase is India's leading platform for AI startup news, funding updates, founder stories, curated AI tools, ecosystem insights, and emerging innovation.",
    url: d,
    logo: brand?.logoLight || brand?.ogImage || `${d}/logo.png`,
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: seo?.contactEmail || "support@udyaibase.com",
    },
  };
}

// ─── Central Article Type → Schema Type Mapping ────────────────────────────────

export function articleTypeToSchemaType(type?: string): string {
  switch (type) {
    case 'NEWS':
    case 'FOUNDER_STORY':
    case 'STARTUP_UPDATE':
      return 'NewsArticle';
    case 'OPINION':
    case 'GUIDE':
    case 'COMPARISON':
    case 'REPORT':
      return 'Article';
    case 'TOOL_REVIEW':
      return 'Review';
    default:
      return 'NewsArticle';
  }
}

// ─── Page-level schemas ───────────────────────────────────────────────────────

export function generateBreadcrumbSchema(
  crumbs: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function generateArticleSchema(data: {
  title: string;
  excerpt: string;
  content?: string;
  author: { name: string; slug: string; url?: string };
  date: string;
  updatedAt?: string;
  url: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  publisherName?: string;
  publisherLogoUrl?: string;
  isStory?: boolean;
  articleType?: string;
  founderData?: {
    name: string;
    slug: string;
    startupSlug?: string;
  };
}, seo?: Partial<SeoConfig>) {
  const d = domain(seo);
  const siteName = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  const siteLogo = `${d}/og-image.webp`;
  const publishedDate = new Date(data.date).toISOString();
  const modifiedDate = data.updatedAt
    ? new Date(data.updatedAt).toISOString()
    : publishedDate;

  const speakable = {
    '@type': 'SpeakableSpecification',
    cssSelector: ['h1', '.article-lede', '.article-content'],
  };

  return {
    '@context': 'https://schema.org',
    '@type': data.articleType ? articleTypeToSchemaType(data.articleType) : (data.isStory ? 'Article' : 'NewsArticle'),
    '@id': data.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': data.url },
    headline: data.title,
    description: data.excerpt,
    image: data.imageUrl
      ? [{ '@type': 'ImageObject', url: data.imageUrl, width: 1200, height: 630 }]
      : [{ '@type': 'ImageObject', url: siteLogo, width: 2250, height: 1181 }],
    datePublished: publishedDate,
    dateModified: modifiedDate,
    author: {
      '@type': 'Person',
      name: data.author.name,
      url: data.author.url || `${d}/authors/${data.author.slug}`,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${d}/#organization`,
      name: data.publisherName || siteName,
      logo: {
        '@type': 'ImageObject',
        url: data.publisherLogoUrl || siteLogo,
      },
    },
    keywords: data.tags ? data.tags.join(', ') : data.category || '',
    articleSection: data.category || 'Technology',
    inLanguage: 'en-IN',
    isAccessibleForFree: true,
    speakable,
    about: data.isStory && data.founderData
      ? {
          '@type': 'Person',
          '@id': `${d}/founder/${data.founderData.slug}#person`,
          name: data.founderData.name,
          ...(data.founderData.startupSlug ? {
            worksFor: {
              '@type': 'Organization',
              '@id': `${d}/startups/${data.founderData.startupSlug}#organization`
            }
          } : {})
        }
      : data.category
      ? { '@type': 'Thing', name: data.category }
      : undefined,
  };
}

export function generateToolSchema(data: {
  name: string;
  description: string;
  url: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  pricing?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: data.name,
    description: data.description,
    url: data.url,
    applicationCategory: data.category || 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: data.pricing === 'Free' ? '0' : undefined,
      priceCurrency: 'USD',
      description: data.pricing || 'Freemium',
    },
    ...(data.rating && data.reviewCount
      ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: data.rating,
          reviewCount: data.reviewCount,
          bestRating: 5,
          worstRating: 1,
        },
      }
      : {}),
  };
}

export function generateItemListSchema(data: {
  name: string;
  description: string;
  url: string;
  items: { name: string; url: string; description?: string; position: number }[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: data.name,
    description: data.description,
    url: data.url,
    numberOfItems: data.items.length,
    itemListElement: data.items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      url: item.url,
      description: item.description,
    })),
  };
}

export function generateCollectionPageSchema(data: {
  name: string;
  description: string;
  url: string;
}, seo?: Partial<SeoConfig>) {
  const d = domain(seo);
  const siteName = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: data.name,
    description: data.description,
    url: data.url,
    publisher: {
      '@type': 'Organization',
      '@id': `${d}/#organization`,
      name: siteName,
    },
    inLanguage: 'en-IN',
  };
}

export function generatePersonSchema(data: {
  name: string;
  slug: string;
  bio?: string;
  role?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
}, seo?: Partial<SeoConfig>) {
  const d = domain(seo);
  const siteName = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  const sameAs = [data.twitter, data.linkedin, data.website].filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: data.name,
    description: data.bio,
    jobTitle: data.role,
    url: `${d}/authors/${data.slug}`,
    worksFor: {
      '@type': 'Organization',
      '@id': `${d}/#organization`,
      name: siteName,
    },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function generateFAQSchema(
  faqs: { question: string; answer: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

// ─── Next.js Metadata builder ─────────────────────────────────────────────────

/** The SEO fields an editor sets on an article in the admin; each one, when set, wins over the defaults. */
export type ArticleSeoFields = {
  title: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  ogImage?: string | null;
  noIndex?: boolean | null;
};

export function withArticleSeo(meta: Metadata, a: ArticleSeoFields): Metadata {
  const title = a.seoTitle?.trim() || undefined;
  const description = a.seoDescription?.trim() || undefined;
  const images = a.ogImage ? [{ url: a.ogImage, width: 1200, height: 630, alt: a.title }] : undefined;
  return {
    ...meta,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(a.canonicalUrl ? { alternates: { ...meta.alternates, canonical: a.canonicalUrl } } : {}),
    ...(a.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { ...meta.openGraph, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(images ? { images } : {}) },
    twitter: { ...meta.twitter, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(images ? { images: images.map((i) => i.url) } : {}) },
  } as Metadata;
}

export function buildArticleMetadata(article: Omit<ArticleSeoFields, 'title'> & {
  title: string;
  excerpt?: string | null;
  coverImage?: string | null;
  publishedAt?: string | null;
  author?: { name?: string | null; slug?: string | null } | null;
  category?: { name?: string | null } | null;
  slug: string;
  type?: string;
}, seo?: Partial<SeoConfig>): Metadata {
  const d = domain(seo);
  const siteName = seo?.metaTitle?.split('–')[0]?.trim() || DEFAULT_NAME;
  const twitterHandle = seo?.twitterHandle || DEFAULT_TWITTER;
  const path = articlePath(article.type, article.slug);
  const canonical = `${d}${path}`;
  const description = article.excerpt || '';
  const images = article.coverImage
    ? [{ url: article.coverImage, width: 1200, height: 630, alt: article.title }]
    : [{ url: `${d}/og-image.webp`, width: 2250, height: 1181 }];

  return withArticleSeo({
    title: article.title,
    description,
    alternates: { canonical },
    authors: article.author?.name ? [{ name: article.author.name }] : undefined,
    openGraph: {
      title: article.title,
      description,
      type: 'article',
      url: canonical,
      siteName,
      locale: 'en_IN',
      images,
      ...(article.publishedAt
        ? { publishedTime: new Date(article.publishedAt).toISOString() }
        : {}),
      ...(article.category?.name ? { section: article.category.name } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description,
      images: images.map((i) => i.url),
      creator: twitterHandle,
      site: twitterHandle,
    },
  }, article);
}

// ─── Interfaces (kept for backward compat) ───────────────────────────────────
export interface Author {
  name: string;
  slug: string;
  bio?: string;
  url?: string;
}

export interface ArticleData {
  title: string;
  excerpt: string;
  content?: string;
  author: Author;
  date: string;
  updatedAt?: string;
  url: string;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  publisherName?: string;
  publisherLogoUrl?: string;
}

/** Public path of an article: stories and opinions have their own sections, everything else is under /news. */
export function articlePath(type: string | null | undefined, slug: string): string {
  return type === 'OPINION' ? `/opinions/${slug}` : type === 'STORY' ? `/stories/${slug}` : `/news/${slug}`;
}
