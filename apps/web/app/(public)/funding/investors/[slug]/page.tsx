import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { jsonLd } from '@/lib/json-ld';
import { getFundingRounds } from '@/lib/funding/rounds';
import {
  byCity, byInvestor, bySector, byStage, HUB_MIN_ROUNDS, inScope, investorName, moneyLabel, newestFirst, roundsWithInvestor,
  slugify, summarize, type Group,
} from '@/lib/funding/insights';
import { fitTitle, metaSnippet } from '@/lib/seo-text';
import { breadcrumbSchema, roundsItemListSchema } from '@/lib/funding/schema';
import FundingRoundList from '../../_components/FundingRoundList';

/** /funding/investors/<slug> — an investor's Indian AI startup deals ("Peak XV AI investments"). */
export const revalidate = 3600;
export async function generateStaticParams() { return []; }

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function loadInvestor(slug: string) {
  const india = inScope(await getFundingRounds(), 'india');
  const rounds = newestFirst(roundsWithInvestor(india, slug));
  const name = investorName(rounds, slug);
  if (!rounds.length || !name) return null;
  const led = rounds.filter((r) => (r.leadInvestors ?? []).some((i) => slugify(i) === slug)).length;
  // Who else is on the same deals, most often first.
  const coInvestors = byInvestor(rounds).filter((g) => g.slug !== slug).slice(0, 8);
  return { name, rounds, led, coInvestors };
}

function overview(d: NonNullable<Awaited<ReturnType<typeof loadInvestor>>>): string {
  const s = summarize(d.rounds);
  const first = d.rounds[d.rounds.length - 1];
  const parts = [
    `${d.name} has backed ${s.deals} Indian AI startup funding round${s.deals === 1 ? '' : 's'} tracked by Udyaibase, worth ${moneyLabel(s.paise, s.cents)} in total${d.led ? `, leading ${d.led} of them` : ''}.`,
    `Its most recent deal was ${d.rounds[0].startupName.trim()} (${longDate(d.rounds[0].announcedAt)})${s.deals > 1 ? `; the earliest on record is ${first.startupName.trim()} (${longDate(first.announcedAt)})` : ''}.`,
  ];
  const sectors = bySector(d.rounds).filter((g) => g.name !== 'Other');
  if (sectors.length) parts.push(`It invests most in ${list(sectors.slice(0, 3).map((g) => g.name))}.`);
  if (d.coInvestors.length) parts.push(`Frequent co-investors include ${list(d.coInvestors.slice(0, 3).map((g) => g.name))}.`);
  return parts.join(' ');
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const d = await loadInvestor(slug);
  if (!d) return { title: 'Investor Not Found', robots: { index: false } };
  const title = fitTitle([`${d.name} AI Investments in India: ${d.rounds.length} Startup Deals`, `${d.name} — AI Startup Investments`, d.name]);
  const url = `https://udyaibase.com/funding/investors/${slug}`;
  return {
    title,
    description: metaSnippet(overview(d)),
    alternates: { canonical: url },
    robots: d.rounds.length < HUB_MIN_ROUNDS.investor ? { index: false, follow: true } : undefined,
    openGraph: { title, url, type: 'profile', images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }] },
  };
}

export default async function InvestorPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const d = await loadInvestor(slug);
  if (!d) notFound();

  const url = `https://udyaibase.com/funding/investors/${slug}`;
  const text = overview(d);
  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url,
      name: `${d.name} — AI startup investments in India`,
      description: text,
      mainEntity: { '@type': 'Organization', name: d.name, description: `Investor in ${d.rounds.length} Indian AI startup funding rounds.` },
    },
    roundsItemListSchema(`${d.name} portfolio: Indian AI startup deals`, url, d.rounds.slice(0, 50)),
    breadcrumbSchema([
      { name: 'Home', url: 'https://udyaibase.com' },
      { name: 'AI Startup Funding India', url: 'https://udyaibase.com/funding' },
      { name: d.name, url },
    ]),
  ];

  const groupList = (heading: string, gs: Group[], link?: (g: Group) => string) => gs.length ? (
    <div>
      <h2 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white mb-2">{heading}</h2>
      <ul className="space-y-1.5 text-sm font-jakarta">
        {gs.map((g) => (
          <li key={g.slug} className="flex items-baseline justify-between gap-3">
            {link ? <Link href={link(g)} className="text-gray-700 dark:text-gray-300 hover:text-brand truncate">{g.name}</Link> : <span className="text-gray-700 dark:text-gray-300 truncate">{g.name}</span>}
            <span className="text-xs text-gray-400 shrink-0">{g.deals}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
      {schemas.map((s, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />)}

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <Link href="/funding" className="hover:text-brand">AI Startup Funding India</Link>
        <ChevronRight className="w-3 h-3" aria-hidden />
        <span className="text-gray-600 dark:text-gray-300 truncate">{d.name}</span>
      </nav>

      <header>
        <h1 className="font-sora font-extrabold text-2xl sm:text-4xl text-navy dark:text-white tracking-tight">{d.name}: AI Startup Investments in India</h1>
        <p className="mt-3 text-sm sm:text-lg text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed max-w-3xl">{text}</p>
      </header>

      <FundingRoundList id="portfolio" title={`${d.name} portfolio: Indian AI startups`} rounds={d.rounds.slice(0, 50)} />

      <section className="card p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6" aria-label="Breakdown">
        {groupList('Frequent co-investors', d.coInvestors, (g) => `/funding/investors/${g.slug}`)}
        {groupList('Sectors', bySector(d.rounds).slice(0, 8))}
        {groupList('Cities', byCity(d.rounds).slice(0, 8), (g) => `/funding/india/${g.slug}`)}
      </section>
      <section className="card p-4 sm:p-6" aria-label="Stages">
        {groupList('Rounds by stage', byStage(d.rounds).slice(0, 8))}
      </section>

      <div className="text-center">
        <Link href="/funding" className="inline-flex items-center gap-2 text-sm font-semibold font-jakarta text-brand hover:underline">← All AI startup funding in India</Link>
      </div>
    </div>
  );
}
