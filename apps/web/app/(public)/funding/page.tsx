export const revalidate = 120;

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Metadata } from 'next';
import { IndianRupee, TrendingUp, Calendar, ArrowRight, Clock, Building2, Megaphone } from 'lucide-react';
import { FundingDashboardSchema } from '@/components/seo';

import { getAllFundingRoundsDirect } from '@/lib/db';

const FundingDashboard = dynamic(() => import('./FundingDashboard'));

export const metadata: Metadata = {
  title: 'Funding Dashboard — AI Startups Funding Rounds Tracker',
  description: 'Filterable tracker of all AI startup funding rounds. Track deals, top investors, and total capital flow in the AI ecosystem.',
  alternates: { canonical: 'https://udyaibase.com/funding' },
  openGraph: {
    title: 'Funding Dashboard — AI Startups Funding Rounds Tracker',
    description: 'Filterable tracker of all AI startup funding rounds. Track deals, top investors, and total capital flow.',
    type: 'website',
    url: 'https://udyaibase.com/funding',
    siteName: 'Udyaibase',
    images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }],
  },
};

export default async function FundingPage() {
  const siteUrl = 'https://udyaibase.com';

  // Real DB connection 
  const rounds = await getAllFundingRoundsDirect();

  // Helper function to get most active investor
  const getMostActiveInvestor = (rounds: any[]): string => {
    const counts = new Map<string, number>();
    rounds.forEach(r => {
      r.leadInvestors?.forEach((inv: string) => {
        counts.set(inv, (counts.get(inv) || 0) + 1);
      });
    });
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'Various Investors';
  };

  // Calculate stats from DB data
  // amountUsd is stored in cents in the DB, so divide by 100 to get dollars
  const totalRaisedDollars = rounds.reduce((sum, r) => sum + (Number(r.amountUsd || 0) / 100), 0);

  const formatTotalRaised = (dollars: number): string => {
    if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
    if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(0)}M`;
    if (dollars >= 1e3) return `$${(dollars / 1e3).toFixed(0)}K`;
    return `$${dollars.toFixed(0)}`;
  };

  const stats = {
    totalRaisedUsd: totalRaisedDollars,
    totalRaisedDisplay: formatTotalRaised(totalRaisedDollars),
    totalDeals: rounds.length,
    avgDealSizeUsd: rounds.length > 0 ? totalRaisedDollars / rounds.length : 0,
    topInvestor: getMostActiveInvestor(rounds),
    lastUpdated: rounds[0]?.announcedAt || new Date().toISOString()
  };

  return (
    <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-10">
      <FundingDashboardSchema rounds={rounds as any} stats={stats} />

      {/* Header */}
      <div className="mb-4 sm:mb-10 text-center">
        <div className="flex items-center justify-center gap-1.5 sm:gap-3 mb-1.5 sm:mb-2">
          <IndianRupee className="w-4 h-4 sm:w-8 sm:h-8 text-brand" />
          <h1 className="font-sora font-extrabold text-lg sm:text-4xl md:text-5xl text-navy dark:text-white tracking-tight">
            AI Startups <span className="text-brand">Funding Tracker</span>
          </h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-sm max-w-2xl mx-auto mt-1.5 sm:mt-4 px-1 sm:px-0">
          The most comprehensive, continuously-updated dashboard of capital raised by Artificial Intelligence startups.
        </p>

        {/* Stats Bar */}
        <div className="mt-2 sm:mt-6 mb-2 sm:mb-4">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-jakarta">
            <strong className="text-brand font-bold">{stats.totalRaisedDisplay}</strong> raised across{' '}
            <strong className="text-brand font-bold">{stats.totalDeals}</strong> deals • Updated{' '}
            <span className="text-gray-500">
              {new Date(stats.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </p>
        </div>

        <div className="mt-3 sm:mt-8 flex flex-wrap justify-center gap-2 sm:gap-4">
          <Link href="/advertise" className="group flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-brand/30 rounded-lg sm:rounded-xl px-3 sm:px-5 py-2 sm:py-3 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-brand/10 text-brand group-hover:bg-brand group-hover:text-white transition-colors">
              <Megaphone className="w-3 h-3 sm:w-4 sm:h-4" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-sora font-bold text-navy dark:text-white leading-none">Announce your round</span>
              <span className="text-xs text-brand font-semibold mt-0.5 leading-none">Premium PR Service <ArrowRight className="inline w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" /></span>
            </div>
          </Link>
        </div>
      </div>

      {/* Mount our Client Dashboard */}
      <FundingDashboard data={rounds as any} />


    </div>
  );
}
