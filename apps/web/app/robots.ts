import { MetadataRoute } from 'next';
import { getSeoConfig } from '@/lib/seo-config';

const DISALLOWED_PATHS = [
  '/api/',
  '/_next/',
  '/founder/',
  '/organizer/',
  '/employer/',
  '/submit-startup',
  '/submit-tool',
  '/search',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSeoConfig();
  const domain = seo.canonicalDomain.replace(/\/$/, '');

  if (seo.noindex) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: domain,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PATHS,
      },
    ],
    ...(seo.autoSitemap
      ? {
          sitemap: [
            `${domain}/sitemap.xml`,
            `${domain}/news/sitemap.xml`,
            `${domain}/stories/sitemap.xml`,
            `${domain}/tools/sitemap.xml`,
            `${domain}/tools/category/sitemap.xml`,
            `${domain}/startups/sitemap.xml`,
            `${domain}/events/sitemap.xml`,
            `${domain}/jobs/sitemap.xml`,
            `${domain}/india-ai/sitemap.xml`,
            `${domain}/opinions/sitemap.xml`,
            `${domain}/authors/sitemap.xml`,
            `${domain}/funding/sitemap.xml`,
            `${domain}/tools/compare/sitemap.xml`,
            `${domain}/tools/alternatives/sitemap.xml`,
          ],
        }
      : {}),
    host: domain,
  };
}
