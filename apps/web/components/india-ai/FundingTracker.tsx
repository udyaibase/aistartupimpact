import Link from 'next/link';
import { TrendingUp, Building2, MapPin, Calendar, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { roundLabel } from '@/lib/funding/format';

interface FundingRound {
  id: string;
  roundType: string;
  amountInr: string;
  announcedAt: string;
  leadInvestors: string[];
  startupName: string;
  startupSlug: string;
  startupLogo: string | null;
  headquartersCity: string | null;
  /** The round's own page; null until the slug migration has run. */
  slug?: string | null;
}

interface FundingTrackerProps {
  recentFunding: FundingRound[];
}

function formatAmount(paise: string): string {
  const amount = Number(paise);
  // amountInr is stored in PAISE (1 INR = 100 paise)
  const inr = amount / 100;
  const crores = inr / 10000000; // 1 Cr = 10,000,000

  if (crores >= 1000) {
    return `₹${(crores / 1000).toFixed(1)}K Cr`;
  }
  if (crores >= 1) {
    return `₹${Math.round(crores).toLocaleString('en-IN')}Cr`;
  }
  
  const lakhs = inr / 100000; // 1 Lakh = 100,000
  if (lakhs >= 1) {
    return `₹${Math.round(lakhs).toLocaleString('en-IN')}L`;
  }
  
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FundingTracker({ recentFunding }: FundingTrackerProps) {
  // Calculate total funding this month
  const now = new Date();
  const thisMonthFunding = recentFunding
    .filter((f) => {
      const fundingDate = new Date(f.announcedAt);
      return fundingDate.getMonth() === now.getMonth() && fundingDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, f) => sum + Number(f.amountInr), 0);

  return (
    <div className="mb-8 sm:mb-12 lg:mb-16">
      <h2 className="section-title justify-center mb-2 sm:mb-3 text-xl sm:text-2xl">
        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
        Live AI Funding Tracker
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-300 mb-4 sm:mb-8 max-w-2xl mx-auto text-xs sm:text-base px-4 leading-relaxed">
        Latest <strong>AI funding India</strong> deals — updated daily with real-time data
      </p>

      {/* Funding Summary */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-6 text-center">
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2">
          <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          This Month
        </div>
        <div className="text-2xl sm:text-4xl font-bold text-brand mb-0.5 sm:mb-1">
          {formatAmount(thisMonthFunding.toString())}
        </div>
        <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
          Raised by {recentFunding.filter((f) => {
            const fundingDate = new Date(f.announcedAt);
            return fundingDate.getMonth() === now.getMonth();
          }).length} Indian AI startups
        </div>
      </div>

      {/* Recent Funding Cards */}
      <div className="space-y-3 sm:space-y-4">
        {recentFunding.length === 0 ? (
          <div className="card p-8 sm:p-12 text-center">
            <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
              No recent funding data available
            </p>
          </div>
        ) : (
          recentFunding.map((funding) => (
            <Link
              key={funding.id}
              href={funding.slug ? `/funding/${funding.slug}` : `/startups/${funding.startupSlug}`}
              className="group card p-3 sm:p-6 hover:shadow-lg transition-all block"
            >
              <div className="flex gap-3 sm:gap-4">
                {/* Startup Logo */}
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                    {funding.startupLogo ? (
                      <Image
                        src={funding.startupLogo}
                        alt={funding.startupName}
                        width={64}
                        height={64}
                        sizes="(max-width: 640px) 40px, 64px"
                        className="object-contain"
                      />
                    ) : (
                      <Building2 className="w-5 h-5 sm:w-8 sm:h-8 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Funding Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1 sm:mb-2">
                    <div className="min-w-0">
                      <h3 className="font-sora font-bold text-sm sm:text-lg text-navy dark:text-white group-hover:text-brand transition-colors truncate">
                        {funding.startupName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {roundLabel(funding.roundType)}
                        </span>
                        {funding.headquartersCity && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                            <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            {funding.headquartersCity}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-base sm:text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatAmount(funding.amountInr)}
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 flex items-center gap-0.5 sm:gap-1 justify-end mt-0.5 sm:mt-1">
                        <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        {formatDate(funding.announcedAt)}
                      </div>
                    </div>
                  </div>

                  {/* Lead Investors */}
                  {funding.leadInvestors && funding.leadInvestors.length > 0 && (
                    <div className="mt-1.5 sm:mt-3">
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1">Lead Investors:</div>
                      <div className="flex flex-wrap gap-1">
                        {funding.leadInvestors.slice(0, 3).map((investor, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          >
                            {investor}
                          </span>
                        ))}
                        {funding.leadInvestors.length > 3 && (
                          <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">
                            +{funding.leadInvestors.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <div className="hidden sm:flex items-center">
                  <ArrowRight className="w-5 h-5 text-brand group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* View All Link */}
      <div className="text-center mt-4 sm:mt-6">
        <Link
          href="/funding"
          className="inline-flex items-center gap-2 text-brand font-semibold hover:underline text-sm sm:text-base"
        >
          View All Funding Rounds
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
