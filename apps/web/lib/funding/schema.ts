/**
 * Structured data for funding pages (tracker, monthly reports, city hubs, investor pages).
 * Dataset makes the tracker eligible for Google Dataset Search; ItemList links the rounds' own pages; FAQPage
 * is built from the same FAQ text the page shows.
 */
import { inrPaiseOf, moneyLabel, type Faq, type FundingRoundRow } from '@/lib/funding/insights';
import { roundLabel } from '@/lib/funding/format';

const SITE = 'https://udyaibase.com';

export function datasetSchema(opts: { name: string; description: string; url: string; dateModified: string | null; keywords: string[]; spatial?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    keywords: opts.keywords,
    isAccessibleForFree: true,
    license: `${SITE}/terms`,
    creator: { '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Udyaibase', url: SITE },
    ...(opts.dateModified ? { dateModified: opts.dateModified.slice(0, 10) } : {}),
    ...(opts.spatial ? { spatialCoverage: { '@type': 'Place', name: opts.spatial } } : {}),
    variableMeasured: ['Funding amount (INR)', 'Funding amount (USD)', 'Round type', 'Announcement date', 'Lead investors', 'Headquarters city'],
    measurementTechnique: 'Compiled from public funding announcements and founder submissions, reviewed by the Udyaibase team.',
    distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentUrl: `${SITE}/funding#funding-data` }],
  };
}

export function roundsItemListSchema(name: string, url: string, rounds: FundingRoundRow[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: rounds.length,
    itemListElement: rounds.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: r.slug ? `${SITE}/funding/${r.slug}` : `${SITE}/startups/${r.startupSlug}`,
      name: `${r.startupName.trim()} ${roundLabel(r.roundType)} — ${moneyLabel(inrPaiseOf(r))}`,
    })),
  };
}

export function faqSchema(faq: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function breadcrumbSchema(crumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}
