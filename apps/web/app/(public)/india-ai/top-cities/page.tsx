import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
import { jsonLd } from '@/lib/json-ld';
import { getMapData } from '@/lib/india-ai/map-data';
import { buildCityRows, rupees, type CityMetrics } from '@/components/india-ai/map-model';
import { slugify } from '@/lib/funding/insights';

/**
 * "Top AI cities in India": every city and state ranked by AI startups, with funding, open jobs and upcoming events.
 * Same data as the live map. A page meant to rank and be cited ("top AI cities India", "AI startup hubs India").
 */
export const revalidate = 3600;

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, '&');
const PAGE_URL = 'https://udyaibase.com/india-ai/top-cities';

async function load() {
  const data = await getMapData();
  const cities = buildCityRows(data).filter((c) => c.metrics.startups > 0)
    .sort((a, b) => b.metrics.startups - a.metrics.startups || b.metrics.fundingPaise - a.metrics.fundingPaise);
  const states = new Map<string, CityMetrics & { cities: number }>();
  for (const c of cities) {
    const s = states.get(c.state) ?? { startups: 0, fundingPaise: 0, jobs: 0, events: 0, cities: 0 };
    states.set(c.state, { startups: s.startups + c.metrics.startups, fundingPaise: s.fundingPaise + c.metrics.fundingPaise, jobs: s.jobs + c.metrics.jobs, events: s.events + c.metrics.events, cities: s.cities + 1 });
  }
  const stateRows = [...states.entries()].map(([name, m]) => ({ name, ...m })).sort((a, b) => b.startups - a.startups);
  const totalStartups = cities.reduce((n, c) => n + c.metrics.startups, 0);
  return { cities, stateRows, totalStartups };
}

export async function generateMetadata(): Promise<Metadata> {
  const { cities, totalStartups } = await load();
  const year = new Date().getFullYear();
  const top = cities.slice(0, 3).map((c) => c.cityName);
  const title = `Top AI Cities in India ${year}: Startup Hubs Ranked`;
  const description = `${top.join(', ')} lead India's AI startup ecosystem. ${cities.length} cities ranked by ${totalStartups} AI startups, funding raised, open AI jobs and events.`;
  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, url: PAGE_URL, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function TopCitiesPage() {
  const { cities, stateRows, totalStartups } = await load();
  const year = new Date().getFullYear();
  const top = cities[0];
  const share = (n: number) => (totalStartups ? Math.round((n / totalStartups) * 100) : 0);
  const byFunding = [...cities].sort((a, b) => b.metrics.fundingPaise - a.metrics.fundingPaise)[0];
  const byJobs = [...cities].sort((a, b) => b.metrics.jobs - a.metrics.jobs)[0];

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Top AI cities in India (${year})`,
      url: PAGE_URL,
      numberOfItems: Math.min(cities.length, 25),
      itemListElement: cities.slice(0, 25).map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: `${c.cityName}, ${c.state}`, url: `https://udyaibase.com/india-ai/cities/${c.slug}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
        { '@type': 'ListItem', position: 2, name: 'India AI', item: 'https://udyaibase.com/india-ai' },
        { '@type': 'ListItem', position: 3, name: 'Top AI cities', item: PAGE_URL },
      ],
    },
  ];

  const th = 'px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400';
  const td = 'px-3 py-2.5 text-sm font-jakarta';

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {schemas.map((s, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />)}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <Link href="/india-ai" className="hover:text-brand">India AI</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <span className="text-gray-600 dark:text-gray-300">Top AI cities</span>
      </nav>

      <header>
        <h1 className="font-sora font-extrabold text-2xl sm:text-4xl text-navy dark:text-white tracking-tight">Top AI Cities in India ({year})</h1>
        {top && (
          <p className="mt-3 text-sm sm:text-lg text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed max-w-3xl">
            Udyaibase tracks {totalStartups} AI startups across {cities.length} Indian cities. {top.cityName} is India&apos;s largest AI startup hub with {top.metrics.startups} startups ({share(top.metrics.startups)}% of the total)
            {cities[1] && <>, followed by {cities[1].cityName} ({cities[1].metrics.startups}){cities[2] ? <> and {cities[2].cityName} ({cities[2].metrics.startups})</> : null}</>}.
            {byFunding && <> {byFunding.cityName} leads on funding raised ({rupees(byFunding.metrics.fundingPaise)})</>}
            {byJobs && byJobs.metrics.jobs > 0 && <>, and {byJobs.cityName} has the most open AI jobs ({byJobs.metrics.jobs})</>}.
          </p>
        )}
        <Link href="/india-ai" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><MapPin className="w-4 h-4" aria-hidden /> See them on the live map</Link>
      </header>

      <section aria-labelledby="cities-heading" className="card overflow-hidden">
        <h2 id="cities-heading" className="px-4 sm:px-6 pt-4 sm:pt-6 font-sora font-bold text-lg sm:text-xl text-navy dark:text-white">AI startup hubs in India, ranked</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr><th className={th}>#</th><th className={th}>City</th><th className={th}>AI startups</th><th className={th}>Funding raised</th><th className={th}>Open AI jobs</th><th className={th}>Upcoming events</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {cities.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                  <td className={`${td} font-bold text-gray-400`}>{i + 1}</td>
                  <td className={td}>
                    <Link href={`/india-ai/cities/${c.slug}`} className="font-sora font-bold text-navy dark:text-white hover:text-brand">{c.cityName}</Link>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{c.state}</span>
                  </td>
                  <td className={`${td} font-semibold text-navy dark:text-white`}>{c.metrics.startups}<span className="ml-1 text-xs text-gray-400">({share(c.metrics.startups)}%)</span></td>
                  <td className={td}>{c.metrics.fundingPaise > 0 ? <Link href={`/funding/india/${slugify(c.cityName)}`} className="hover:text-brand">{rupees(c.metrics.fundingPaise)}</Link> : '—'}</td>
                  <td className={td}>{c.metrics.jobs > 0 ? <Link href={`/jobs?location=${encodeURIComponent(c.cityName)}`} className="hover:text-brand">{c.metrics.jobs}</Link> : '—'}</td>
                  <td className={td}>{c.metrics.events || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="states-heading" className="card overflow-hidden">
        <h2 id="states-heading" className="px-4 sm:px-6 pt-4 sm:pt-6 font-sora font-bold text-lg sm:text-xl text-navy dark:text-white">Indian states by AI startups</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr><th className={th}>#</th><th className={th}>State</th><th className={th}>AI startups</th><th className={th}>Cities</th><th className={th}>Funding raised</th><th className={th}>Open AI jobs</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {stateRows.map((s, i) => (
                <tr key={s.name}>
                  <td className={`${td} font-bold text-gray-400`}>{i + 1}</td>
                  <td className={td}><span className="font-sora font-bold text-navy dark:text-white">{titleCase(s.name)}</span></td>
                  <td className={`${td} font-semibold text-navy dark:text-white`}>{s.startups}</td>
                  <td className={td}>{s.cities}</td>
                  <td className={td}>{s.fundingPaise > 0 ? rupees(s.fundingPaise) : '—'}</td>
                  <td className={td}>{s.jobs || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">
        Startups are counted by headquarters city. Funding is the total of funding rounds tracked on Udyaibase; jobs are open on-site and hybrid roles; events are upcoming in-person events. Updated hourly.
      </p>
    </div>
  );
}
