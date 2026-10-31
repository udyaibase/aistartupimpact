import { jsonLd } from "@/lib/json-ld";
import { Metadata } from 'next';
import {
  Flag,
  MapPin,
  Rocket,
  Trophy,
  IndianRupee,
  Users,
  GraduationCap,
  FileText,
  Newspaper
} from 'lucide-react';
import { sql } from '@/lib/db';
import FundingTracker from '@/components/india-ai/FundingTracker';
import NewsletterCapture from '@/components/india-ai/NewsletterCapture';
import GovernmentSchemes from '@/components/india-ai/GovernmentSchemes';
import PolicyLiveFeed from '@/components/india-ai/PolicyLiveFeed';
import AITalentResearchHubsDB from '@/components/india-ai/AITalentResearchHubsDB';

import { RealIndiaMap } from '@/components/ClientOnly';

export const revalidate = 300;

interface StatItem {
  id: string;
  metricKey: string;
  metricLabel: string;
  metricValue: string;
  metricChange: string | null;
  metricIcon: string | null;
  displayOrder?: number;
}

interface DisbursementStat {
  metricKey: string;
  metricValue: string;
  metricChange: string | null;
  source: string | null;
}

interface MissionPillar {
  id: string;
  component: string;
  budgetAllocated: string | bigint;
  budgetDisbursed: string | bigint | null;
  description: string | null;
  keyInitiatives: string[];
  displayOrder: number | null;
}

interface CityRow {
  id: string;
  cityName: string;
  slug: string;
  state: string;
  latitude: number;
  longitude: number;
  topSectors: string[];
  totalFunding: string;
  aliases: string[];
  totalStartups: number;
}

interface StartupRow {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl: string | null;
  headquartersCity: string;
  stage: string;
  totalFundingInr: string;
  foundedYear: number;
}

interface FundingRow {
  id: string;
  roundType: string;
  amountInr: string;
  announcedAt: string;
  leadInvestors: string[];
  startupName: string;
  startupSlug: string;
  startupLogo: string | null;
  headquartersCity: string | null;
}

// SEO Metadata with target keywords
export const metadata: Metadata = {
  title: 'India AI Startups - Live Ecosystem Map | IndiaAI Mission, Funding & Policy',
  description: 'Explore India\'s AI ecosystem — thousands of startups, live funding data, IndiaAI Mission ₹10,372Cr budget tracker, AI policy updates, and top AI companies in Bangalore, Mumbai, Hyderabad. Real-time intelligence on India\'s AI revolution.',
  keywords: [
    'India AI startups',
    'AI funding India',
    'Indian AI companies',
    'IndiaAI Mission',
    'AI startups Bangalore',
    'Top AI startups India',
    'AI policy India',
    'AI ecosystem India',
    'Bangalore AI startups',
    'Mumbai AI companies',
    'AI talent India',
    'AI research India'
  ],
  openGraph: {
    title: 'India AI Startups - Live Ecosystem Map',
    description: 'Explore India\'s AI revolution with real-time data on startups, funding, IndiaAI Mission tracker, policy updates, and talent insights.',
    type: 'website',
    url: 'https://udyaibase.com/india-ai',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'India AI Startups - Live Ecosystem Map',
    description: 'Real-time intelligence on India\'s AI revolution — startups, funding, policy, and IndiaAI Mission tracker.',
  },
  alternates: {
    canonical: 'https://udyaibase.com/india-ai',
  },
};

// Fetch all data server-side
async function getIndiaAIData() {
  const [computedStartupCount, thisMonthStartups, totalFundingResult, thisMonthFundingResult, manualStats, cities, mission, missionDisbursement, , recentFunding, allStartups] = await Promise.all([
    // Live computed: total startups
    sql`
      SELECT COUNT(*)::int as count
      FROM "Startup"
      WHERE "isIndian" = true
        AND "deletedAt" IS NULL
        AND "isApproved" = true
    `,
    // Live computed: startups this month
    sql`
      SELECT COUNT(*)::int as count
      FROM "Startup"
      WHERE "isIndian" = true
        AND "deletedAt" IS NULL
        AND "isApproved" = true
        AND "createdAt" >= date_trunc('month', NOW())
    `,
    // Live computed: total funding
    sql`
      SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
      FROM "FundingRound" fr
      JOIN "Startup" s ON fr."startupId" = s.id
      WHERE s."isIndian" = true
        AND s."deletedAt" IS NULL
    `,
    // Live computed: funding this month
    sql`
      SELECT COALESCE(SUM("amountInr"), 0)::bigint as total
      FROM "FundingRound" fr
      JOIN "Startup" s ON fr."startupId" = s.id
      WHERE s."isIndian" = true
        AND s."deletedAt" IS NULL
        AND fr."announcedAt" >= date_trunc('month', NOW())
    `,
    // Manual stats (AI Engineers, Global Rank — can't be auto-computed)
    sql`
      SELECT id, "metricKey", "metricLabel", "metricValue", "metricChange", "metricIcon", source
      FROM "IndiaAIStats"
      WHERE "isActive" = true
        AND "metricKey" IN ('ai_engineers', 'global_rank')
      ORDER BY "displayOrder" ASC
    `,
    // Cities for map — get ALL cities that have real startups, with coordinates from IndiaAICity
    sql`
      SELECT 
        c.id,
        c."cityName",
        c.slug,
        c.state,
        c.latitude::float as latitude,
        c.longitude::float as longitude,
        c."topSectors",
        c."totalFunding",
        c.aliases,
        COUNT(s.id)::int as "totalStartups"
      FROM "IndiaAICity" c
      INNER JOIN "Startup" s 
        ON (
          LOWER(s."headquartersCity") = LOWER(c."cityName")
          OR LOWER(s."headquartersCity") = ANY(
            SELECT LOWER(unnest(c.aliases))
          )
        )
      WHERE c."isActive" = true
        AND c.latitude != 0
        AND c.longitude != 0
        AND s."isIndian" = true
        AND s."deletedAt" IS NULL
        AND s."isApproved" = true
      GROUP BY c.id, c."cityName", c.slug, c.state, c.latitude, c.longitude, c."topSectors", c."totalFunding", c.aliases
      HAVING COUNT(s.id) > 0
      ORDER BY COUNT(s.id) DESC
      LIMIT 50
    `,
    // IndiaAI Mission
    sql`
      SELECT id, component, "budgetAllocated", "budgetDisbursed", description, "keyInitiatives", "displayOrder"
      FROM "IndiaAIMissionTracker"
      WHERE "isActive" = true
      ORDER BY "displayOrder" ASC
    `,
    // Mission disbursement summary
    sql`
      SELECT "metricKey", "metricValue", "metricChange", source
      FROM "IndiaAIStats"
      WHERE "isActive" = true
        AND "metricKey" LIKE 'mission_%'
      ORDER BY "displayOrder" ASC
    `,
    // Research Hubs
    sql`
      SELECT id, name, slug, type, city, description, "focusAreas", "phdPrograms", "researchPapers", "notableProjects", website, latitude, longitude
      FROM "ResearchHub"
      WHERE "isActive" = true
      ORDER BY "displayOrder" ASC
      LIMIT 5
    `,
    // Recent Funding - Connect to existing FundingRound table
    sql`
      SELECT 
        fr.id,
        fr."roundType",
        fr."amountInr",
        fr."announcedAt",
        fr."leadInvestors",
        s.name as "startupName",
        s.slug as "startupSlug",
        s."logoUrl" as "startupLogo",
        s."headquartersCity"
      FROM "FundingRound" fr
      JOIN "Startup" s ON fr."startupId" = s.id
      WHERE s."isIndian" = true
        AND fr."announcedAt" >= NOW() - INTERVAL '90 days'
      ORDER BY fr."announcedAt" DESC
      LIMIT 10
    `,
    // All Indian AI Startups for the map — only those with a headquarters city
    sql`
      SELECT 
        id,
        name,
        slug,
        tagline,
        "logoUrl",
        "headquartersCity",
        stage,
        "totalFundingInr",
        "foundedYear"
      FROM "Startup"
      WHERE "isIndian" = true
        AND "deletedAt" IS NULL
        AND "isApproved" = true
        AND "headquartersCity" IS NOT NULL
        AND "headquartersCity" != ''
      ORDER BY "totalFundingInr" DESC
      LIMIT 500
    `,
  ]);

  // Build computed stats from real data
  const totalStartups = computedStartupCount[0]?.count || 0;
  const monthlyStartups = thisMonthStartups[0]?.count || 0;
  const totalFunding = Number(totalFundingResult[0]?.total || 0);
  const monthlyFunding = Number(thisMonthFundingResult[0]?.total || 0);

  // Format funding — amountInr is stored in PAISE (1 INR = 100 paise)
  function formatFundingCr(amountPaise: number): string {
    const inr = amountPaise / 100;
    const crores = inr / 10000000;
    if (crores >= 100000) {
      return `₹${(crores / 100000).toFixed(1)}L Cr`;
    }
    if (crores >= 1000) {
      return `₹${Math.round(crores).toLocaleString('en-IN')} Cr`;
    }
    if (crores >= 1) {
      return `₹${Math.round(crores).toLocaleString('en-IN')} Cr`;
    }
    const lakhs = inr / 100000;
    return `₹${Math.round(lakhs)}L`;
  }

  const stats = [
    {
      id: 'computed-startups',
      metricKey: 'total_startups',
      metricLabel: 'Active AI Startups',
      metricValue: `${totalStartups.toLocaleString('en-IN')}+`,
      metricChange: monthlyStartups > 0 ? `+${monthlyStartups} this month` : 'Updated live',
      metricIcon: 'rocket',
      displayOrder: 1,
    },
    {
      id: 'computed-funding',
      metricKey: 'total_funding',
      metricLabel: 'Total Funding Tracked',
      metricValue: `${formatFundingCr(totalFunding)}+`,
      metricChange: monthlyFunding > 0 ? `+${formatFundingCr(monthlyFunding)} this month` : 'Updated live',
      metricIcon: 'currency',
      displayOrder: 2,
    },
    ...(manualStats as StatItem[]),
  ];

  // Add sector mapping (you can enhance this based on your data)
  const startupsWithSectors = (allStartups as StartupRow[]).map((s) => ({
    ...s,
    sector: s.stage?.includes('FinTech') ? 'FinTech' :
            s.stage?.includes('Health') ? 'HealthTech' :
            s.stage?.includes('Ed') ? 'EdTech' : 'SaaS',
    headquartersCity: s.headquartersCity || 'Other',
  }));

  return {
    stats,
    cities: cities as CityRow[],
    mission: mission as MissionPillar[],
    missionDisbursement: missionDisbursement as DisbursementStat[],
    recentFunding: recentFunding as FundingRow[],
    allStartups: startupsWithSectors,
  };
}

function formatCurrency(paise: number): string {
  const inr = paise / 100;
  const crores = inr / 10000000;
  if (crores >= 1) return `₹${Math.round(crores).toLocaleString('en-IN')}Cr`;
  const lakhs = inr / 100000;
  if (lakhs >= 1) return `₹${Math.round(lakhs)}L`;
  return `₹${Math.round(inr).toLocaleString('en-IN')}`;
}

function formatBudget(value: number | string | bigint): string {
  const crores = Number(value) / 10000000000;
  return `₹${crores.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

const iconMap: Record<string, typeof Rocket> = {
  rocket: Rocket,
  currency: IndianRupee,
  users: Users,
  trophy: Trophy,
};

export default async function IndiaAIPage() {
  const { stats, cities, mission, missionDisbursement, recentFunding, allStartups } = await getIndiaAIData();

  // Extract computed startup count for dynamic subtitle
  const startupStat = stats.find((s) => s.metricKey === 'total_startups');
  const startupCount = startupStat?.metricValue || '3,000+';

  // Calculate mission totals — total budget from pillars, disbursement from official stat
  const totalBudget = mission.reduce((sum, item) => sum + Number(item.budgetAllocated), 0);
  const disbursedStat = missionDisbursement.find((s) => s.metricKey === 'mission_total_disbursed');
  const totalDisbursedCr = disbursedStat ? parseFloat(disbursedStat.metricValue) : 0;
  const totalDisbursed = totalDisbursedCr * 10000000000;
  const disbursementPercentage = totalBudget > 0 ? (totalDisbursed / totalBudget) * 100 : 0;
  const fy25Stat = missionDisbursement.find((s) => s.metricKey === 'mission_fy25_released');
  const fy26Stat = missionDisbursement.find((s) => s.metricKey === 'mission_fy26_released');
  const fy27Stat = missionDisbursement.find((s) => s.metricKey === 'mission_fy27_be');

  // JSON-LD Schema Markup for SEO
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Udyaibase - India AI Ecosystem',
    url: 'https://udyaibase.com/india-ai',
    logo: 'https://udyaibase.com/logo.png',
    description: 'Comprehensive database and intelligence platform for India\'s AI startup ecosystem',
    sameAs: [
      'https://twitter.com/udyaibase',
      'https://linkedin.com/company/udyaibase',
    ],
  };

  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'India AI Startups Database 2026',
    description: `Comprehensive database of ${startupCount} AI startups in India with funding data, city-wise distribution, and ecosystem insights`,
    url: 'https://udyaibase.com/india-ai',
    keywords: 'India AI startups, AI funding India, Indian AI companies, AI ecosystem',
    creator: {
      '@type': 'Organization',
      name: 'Udyaibase',
    },
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: 'https://udyaibase.com/api/india-ai/stats',
    },
  };

  return (
    <>
      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(datasetSchema) }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
        {/* ============================================
            SECTION 1: HERO WITH LIVE STATS
            ============================================ */}
        <section aria-label="India AI live statistics" className="mb-8 sm:mb-12 lg:mb-16 text-center">
          <div className="inline-flex items-center gap-2 badge-brand mb-2 sm:mb-3 text-xs sm:text-xs">
            <Flag className="w-3 h-3" /> India AI Ecosystem — Live
          </div>
          <h1 className="font-sora font-extrabold text-lg sm:text-xl md:text-2xl lg:text-3xl text-navy dark:text-white max-w-4xl mx-auto px-2">
            India&apos;s AI Revolution — Live
          </h1>
          <p className="text-gray-600 dark:text-gray-300 font-jakarta text-xs sm:text-xs lg:text-sm mt-2 sm:mt-3 max-w-2xl mx-auto px-4 leading-relaxed">
            Real-time intelligence on <strong>{startupCount} AI startups</strong>, funding, policy, and talent shaping India&apos;s AI future
          </p>

          {/* Live Stats Counters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mt-5 sm:mt-6 lg:mt-8">
            {stats.map((stat) => {
              const Icon = (stat.metricIcon && iconMap[stat.metricIcon]) || Rocket;
              return (
                <div key={stat.id} className="card p-3 sm:p-4 lg:p-5 text-center hover:shadow-lg transition-shadow">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center mx-auto mb-2">
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand" />
                  </div>
                  <div className="font-sora font-extrabold text-base sm:text-lg md:text-xl lg:text-2xl text-brand mb-0.5 sm:mb-1">
                    {stat.metricValue}
                  </div>
                  <div className="text-xs sm:text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-1">
                    {stat.metricChange}
                  </div>
                  <div className="text-xs sm:text-xs text-gray-700 dark:text-gray-300 font-jakarta font-semibold leading-tight">
                    {stat.metricLabel}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Newsletter CTA */}
          <NewsletterCapture source="india-ai-hero" />
        </section>

        {/* ============================================
            SECTION 2: INTERACTIVE INDIA AI MAP
            ============================================ */}
        <section aria-label="Interactive India AI ecosystem map" className="mb-8 sm:mb-12 lg:mb-16">
          <h2 className="section-title justify-center mb-2 sm:mb-3 text-xl sm:text-2xl">
            <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
            Live India AI Ecosystem Map
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto text-sm sm:text-base px-4 leading-relaxed">
            Interactive map showing <strong>AI startups across India</strong> — filter by sector, stage, and year
          </p>

          {/* Interactive Map Component */}
          <RealIndiaMap cities={cities} allStartups={allStartups} />
        </section>

        {/* ============================================
            SECTION 3: LIVE AI FUNDING TRACKER
            ============================================ */}
        <FundingTracker recentFunding={recentFunding} />

        {/* ============================================
            SECTION 4: INDIAAI MISSION TRACKER
            ============================================ */}
        <section aria-label="IndiaAI Mission budget tracker" className="mb-12 sm:mb-16">
          <h2 className="section-title justify-center mb-3">
            <Flag className="w-6 h-6" />
            IndiaAI Mission Tracker
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
            Track the <strong>₹10,372 Cr IndiaAI Mission</strong> budget allocation and disbursement
          </p>

          {/* Mission Summary */}
          <div className="card p-4 sm:p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
              <div className="text-center">
                <div className="text-xl sm:text-3xl font-bold text-brand mb-1">
                  {formatBudget(totalBudget)}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Outlay (2024–29)</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  {formatBudget(totalDisbursed)}
                </div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Funds Released</div>
                {disbursedStat?.metricChange && (
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">{disbursedStat.metricChange}</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {disbursementPercentage.toFixed(1)}%
                </div>
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Disbursement Rate</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4 sm:mb-6">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3" role="progressbar" aria-valuenow={Math.round(disbursementPercentage)} aria-valuemin={0} aria-valuemax={100} aria-label="Mission fund disbursement progress">
                <div
                  className="bg-gradient-to-r from-brand to-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(disbursementPercentage, 100)}%` }}
                />
              </div>
            </div>

            {/* Year-wise Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {fy25Stat && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">₹{fy25Stat.metricValue} Cr</div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">FY 2024–25 Released</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{fy25Stat.metricChange}</div>
                </div>
              )}
              {fy26Stat && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">₹{fy26Stat.metricValue} Cr</div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">FY 2025–26 Released</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{fy26Stat.metricChange}</div>
                </div>
              )}
              {fy27Stat && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 text-center">
                  <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">₹{fy27Stat.metricValue} Cr</div>
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">FY 2026–27 (BE)</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{fy27Stat.metricChange}</div>
                </div>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
              Source: Rajya Sabha reply by MoS Jitin Prasada (April 2026); PIB; IndiaAI portal
            </p>
          </div>

          {/* 7 Official Pillars */}
          <h3 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white mb-3 text-center">
            Official 7-Pillar Structure
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {mission.filter((c) => c.component !== 'Overheads & Contingency').map((component) => {
              const pctOfTotal = totalBudget > 0 ? ((Number(component.budgetAllocated) / totalBudget) * 100).toFixed(1) : '0';
              const initiatives: string[] = component.keyInitiatives || [];
              return (
                <div key={component.id} className="card p-4 sm:p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-sora font-bold text-sm sm:text-base text-navy dark:text-white leading-tight flex-1">
                      {component.component}
                    </h4>
                    <span className="text-xs font-semibold text-brand bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      {pctOfTotal}%
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
                    {component.description}
                  </p>

                  <div className="flex justify-between text-xs sm:text-sm mb-2">
                    <span className="text-gray-500 dark:text-gray-400">Approved Outlay:</span>
                    <span className="font-bold text-brand">
                      {formatBudget(component.budgetAllocated)}
                    </span>
                  </div>

                  {/* Allocation bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-brand h-1.5 rounded-full transition-all"
                      style={{ width: `${pctOfTotal}%` }}
                    />
                  </div>

                  {initiatives.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {initiatives.slice(0, 3).map((item: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                          <span className="text-brand mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ============================================
            SECTION 5: GOVERNMENT SCHEMES & POLICY HUB
            ============================================ */}
        <section aria-label="Government AI schemes and policy hub" className="mb-8 sm:mb-12 lg:mb-16">
          <h2 className="section-title justify-center mb-2 sm:mb-3 text-xl sm:text-2xl">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            Government Schemes & Policy Hub
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto text-sm sm:text-base px-4 leading-relaxed">
            Complete directory of <strong>AI funding schemes</strong>, eligibility criteria, and application support
          </p>

          <div className="mb-8 sm:mb-10 lg:mb-12">
            <h3 className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white mb-4 sm:mb-6 text-center flex items-center justify-center gap-2">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
              Available Schemes & Programs
            </h3>
            <GovernmentSchemes />
          </div>

          <div>
            <h3 className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white mb-4 sm:mb-6 text-center flex items-center justify-center gap-2">
              <Newspaper className="w-5 h-5 sm:w-6 sm:h-6 text-brand" />
              AI Policy Live Feed
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-300 mb-4 sm:mb-6 max-w-2xl mx-auto text-xs sm:text-sm px-4 leading-relaxed">
              Latest updates from MeitY, NITI Aayog, Data Protection Board, and AI Safety Committee
            </p>
            <PolicyLiveFeed />
          </div>
        </section>

        {/* ============================================
            SECTION 6: AI TALENT & RESEARCH
            ============================================ */}
        <section aria-label="AI talent and research hubs" className="mb-12 sm:mb-16">
          <h2 className="section-title justify-center mb-3">
            <GraduationCap className="w-6 h-6" />
            AI Talent & Research Hubs
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-4 max-w-2xl mx-auto text-sm sm:text-base">
            India&apos;s Leading AI Research Institutions & Talent Centers
          </p>

          <AITalentResearchHubsDB />
        </section>

        {/* ============================================
            FINAL CTA BLOCK
            ============================================ */}
        <div className="card p-6 sm:p-8 lg:p-12 text-center bg-gradient-to-br from-brand/10 to-blue-50 dark:from-brand/20 dark:to-gray-800">
          <h2 className="font-sora font-bold text-xl sm:text-2xl lg:text-3xl text-navy dark:text-white mb-3 sm:mb-4 px-2">
            Stay Updated on India&apos;s AI Revolution
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6 sm:mb-8 max-w-2xl mx-auto text-sm sm:text-base px-4 leading-relaxed">
            Get weekly insights on <strong>AI funding India</strong>, policy updates, and ecosystem trends
          </p>
          <NewsletterCapture source="india-ai-footer" />
          <p className="text-xs sm:text-xs text-gray-500 dark:text-gray-400 mt-3 sm:mt-4">
            Join 5,200+ founders, investors, and AI enthusiasts
          </p>
        </div>
      </div>
    </>
  );
}
