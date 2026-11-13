export const revalidate = 300;

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { IndianRupee, ArrowRight, Megaphone } from 'lucide-react';
import { jsonLd } from '@/lib/json-ld';
import { getFundingRounds } from '@/lib/funding/rounds';
import { byCity, byInvestor, fundingFaq, inScope, monthsWithRounds, moneyLabel, newestFirst, summarize, summaryText } from '@/lib/funding/insights';
import { breadcrumbSchema, datasetSchema, faqSchema, roundsItemListSchema } from '@/lib/funding/schema';
import FundingRoundList from './_components/FundingRoundList';
import FundingFaq from './_components/FundingFaq';
import FundingExplore from './_components/FundingExplore';

const FundingDashboard = dynamic(() => import('./FundingDashboard'));

const PAGE_URL = 'https://udyaibase.com/funding';
const istDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** India-first: the page targets "AI startup funding India"; the dashboard's Global switch shows everything. */
async function loadIndia() {
  const all = await getFundingRounds().catch((e) => { console.error('[funding] rounds', e); return []; });
  const india = inScope(all, 'india');
  return { all, india, summary: summarize(india) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { india, summary } = await loadIndia();
  const year = summary.year;
  // The layout adds "| Udyaibase"; an absolute title keeps this one inside Google's ~60 characters.
  const title = `AI Startup Funding India ${year} — Live Tracker, Deals & Trends`;
  const deals = india.length >= 100 ? `${Math.floor(india.length / 10) * 10}+` : `${india.length}`;
  const description = india.length
    ? `Track ${deals} Indian AI startup funding rounds live — ${moneyLabel(summary.paise, summary.cents).split(' (')[0]} raised, top investors, city and sector trends. Updated daily.`
    : 'Live tracker of Indian AI startup funding rounds — deals, investors, city and sector trends. Updated daily.';
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, type: 'website', url: PAGE_URL, siteName: 'Udyaibase', images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }] },
    twitter: { card: 'summary_large_image', title, description, images: ['https://udyaibase.com/og-image.webp'] },
  };
}

export default async function FundingPage() {
  const { all, india, summary } = await loadIndia();
  const updated = istDate(summary.latestDate ?? new Date());
  const latest = newestFirst(india).slice(0, 25);
  const faq = fundingFaq(summary, 'india', updated);
  const cities = byCity(india).filter((c) => c.deals >= 3).slice(0, 8);
  const months = monthsWithRounds(india, 3).slice(0, 8);
  const investors = byInvestor(india).filter((i) => i.deals >= 2).slice(0, 8);

  const schemas = [
    datasetSchema({
      name: `AI Startup Funding in India (${summary.year}) — Udyaibase Tracker`,
      description: `Funding rounds raised by AI startups headquartered in India: ${summary.deals} rounds worth ${moneyLabel(summary.paise, summary.cents)}, with round type, amount, date, investors and city.`,
      url: PAGE_URL,
      dateModified: summary.latestDate,
      keywords: ['AI startup funding India', 'Indian AI startups', 'venture capital', 'AI funding rounds', 'AI investors India'],
      spatial: 'India',
    }),
    roundsItemListSchema('Latest AI funding rounds in India', PAGE_URL, latest),
    faqSchema(faq),
    breadcrumbSchema([{ name: 'Home', url: 'https://udyaibase.com' }, { name: 'AI Startup Funding India', url: PAGE_URL }]),
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-10">
      {schemas.map((s, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(s) }} />)}

      {/* Header */}
      <div className="mb-4 sm:mb-10 text-center">
        <div className="flex items-center justify-center gap-1.5 sm:gap-3 mb-1.5 sm:mb-2">
          <IndianRupee className="w-4 h-4 sm:w-8 sm:h-8 text-brand" aria-hidden />
          <h1 className="font-sora font-extrabold text-lg sm:text-4xl md:text-5xl text-navy dark:text-white tracking-tight">
            AI Startup Funding in India <span className="text-brand">— Live Tracker</span>
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-jakarta text-xs sm:text-base max-w-2xl mx-auto mt-2 sm:mt-4 px-1 sm:px-0">
          Every funding round raised by Indian AI startups, updated daily.
        </p>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 font-jakarta">
          Updated <time dateTime={(summary.latestDate ?? new Date().toISOString()).slice(0, 10)}>{updated}</time>
        </p>

        <div className="mt-3 sm:mt-8 flex flex-wrap justify-center gap-2 sm:gap-4">
          <Link href="/advertise" className="group flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg sm:rounded-xl px-3 sm:px-5 py-2 sm:py-3 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[color:color-mix(in_srgb,var(--brand-color)_10%,transparent)] text-brand group-hover:bg-brand group-hover:text-white transition-colors">
              <Megaphone className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-sora font-bold text-navy dark:text-white leading-none">Announce your round</span>
              <span className="text-xs text-brand font-semibold mt-0.5 leading-none">Premium PR Service <ArrowRight className="inline w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" aria-hidden /></span>
            </div>
          </Link>
        </div>
      </div>

      {/* Interactive dashboard (India by default, Global switch) */}
      <FundingDashboard data={all as any} />

      <div className="mt-6 sm:mt-10 space-y-4 sm:space-y-8">
        <FundingRoundList
          id="latest-rounds"
          title="Latest AI funding rounds in India"
          intro="The 25 most recent rounds raised by Indian AI startups. Open any round for its investors and details."
          rounds={latest}
        />
        <FundingExplore cities={cities} months={months} investors={investors} />
        {/* Written from live data: plain, quotable sentences for search engines and AI answers. */}
        <section aria-labelledby="in-numbers" className="card p-4 sm:p-6">
          <h2 id="in-numbers" className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white mb-2">Indian AI funding in numbers</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">{summaryText(summary, 'india')}</p>
        </section>
        <FundingFaq id="faq"title="VC funding for AI startups in India: FAQ" faq={faq} />
      </div>
    </div>
  );
}
