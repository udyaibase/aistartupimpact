import { MetadataRoute } from 'next';
import { getSeoConfig } from '@/lib/seo-config';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getSeoConfig();
  const domain = seo.canonicalDomain.replace(/\/$/, '');

  return [
    { url: domain, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${domain}/news`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${domain}/stories`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${domain}/startups`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${domain}/tools`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${domain}/funding`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${domain}/events`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${domain}/india-ai`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${domain}/india-ai/schemes`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${domain}/opinions`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${domain}/jobs`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${domain}/hire/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${domain}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${domain}/newsletter`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${domain}/advertise`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${domain}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${domain}/privacy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${domain}/terms`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${domain}/cookie-policy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/content-guidelines`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/copyright`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/disclaimer`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/trademark`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/refund`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/verification-policy`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${domain}/careers`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${domain}/milestones`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];
}
