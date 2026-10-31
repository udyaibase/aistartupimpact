import Link from 'next/link';
import Image from 'next/image';
import { cache } from 'react';
import { Metadata } from 'next';
import { Building2, MapPin, IndianRupee, TrendingUp, ExternalLink, ChevronRight, Globe, Users, Calendar, Star, ArrowUpRight, Tag, ThumbsUp, Shield, BookOpen, Cpu, Briefcase, Clock } from 'lucide-react';
import { sql } from '@/lib/db';
import { appendUtmParams } from '@/lib/utm';
// import EmbedBadge from '@/components/EmbedBadge'; // Temporarily hidden - can be shown in future
import ClaimStartupCard from '@/components/ClaimStartupCard';
import { detectCategory } from '@/lib/categories';
import WriteStartupReviewClient from '@/components/WriteStartupReviewClient';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import FoundersSection from '@/components/FoundersSection';
import BookmarkButton from '@/components/BookmarkButton';
import { StartupSchema, FAQSchema } from '@/components/seo';
import { generateStartupFAQs, formatUsd as formatUsdUtil } from '@/lib/seo-utils';
import FAQSection from '@/components/FAQSection';
import SimilarStartupsCarousel from '@/components/SimilarStartupsCarousel';
import ImpactScoreBadge from '@/components/ImpactScoreBadge';
import { calculateImpactScore } from '@/lib/impact-score';
import ShareMenu from '@/components/shared/ShareMenu';
import ReportButton from '@/components/ReportButton';
import SubscribeForm from '@/components/SubscribeForm';
import SignInGate from '@/components/SignInGate';
import TrackView from '@/components/TrackView';
import { SignedIn, SignedOut } from '@/components/auth/SignedIn';

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const rows = await sql`
      SELECT slug FROM "Startup"
      WHERE "isApproved" = true AND "deletedAt" IS NULL
      ORDER BY "impactScore" DESC NULLS LAST
      LIMIT 200
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

const getStartup = cache(async (slug: string) => {
  try {
    let rows;
    try {
      rows = await sql`
        SELECT id, name, slug, tagline,
               LEFT(description, 2500) AS description,
               "logoUrl", "websiteUrl", "linkedinUrl", "twitterUrl", "socialLinks", stage, status,
               "headquartersCity", "foundedYear", "employeeCount",
               "isFeatured", "impactScore", founders, "foundersData",
               "isVerified", "verifiedAt", "claimedBy", category, "businessType",
               to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
               to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"
        FROM "Startup"
        WHERE slug = ${slug} AND "deletedAt" IS NULL
        LIMIT 1
      `;
    } catch (columnError: any) {
      if (columnError.message?.includes('category') || columnError.message?.includes('businessType') || columnError.message?.includes('column')) {
        rows = await sql`
          SELECT id, name, slug, tagline,
                 LEFT(description, 2500) AS description,
                 "logoUrl", "websiteUrl", "linkedinUrl", "twitterUrl", "socialLinks", stage, status,
                 "headquartersCity", "foundedYear", "employeeCount",
                 "isFeatured", "impactScore", founders, "foundersData",
                 "isVerified", "verifiedAt", "claimedBy",
                 to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
                 to_char("updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "updatedAt"
          FROM "Startup"
          WHERE slug = ${slug} AND "deletedAt" IS NULL
          LIMIT 1
        `;
      } else {
        throw columnError;
      }
    }

    if (!rows.length) return null;
    const s = rows[0] as any;

    const category = s.category || '';
    const city = s.headquartersCity || '';

    // Fetch all dependent data in parallel
    const [rounds, news, stories, products, similarCandidates, founderProfile, boardJobs, startupUpdates, startupMilestones] = await Promise.all([
      sql`
        SELECT "roundType", "amountUsd", "amountInr",
               "announcedAt"::text AS "announcedAt",
               "leadInvestors", "allInvestors"
        FROM "FundingRound"
        WHERE "startupId" = ${s.id}
        ORDER BY "announcedAt" DESC
      `,
      sql`
        SELECT title, slug, "publishedAt"::text AS "publishedAt"
        FROM "Article"
        WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
          AND "startupId" = ${s.id}
        ORDER BY "publishedAt" DESC
        LIMIT 4
      `,
      sql`
        SELECT title, slug, excerpt, "publishedAt"::text AS "publishedAt"
        FROM "Article"
        WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
          AND type = 'STORY'
          AND "startupId" = ${s.id}
        ORDER BY "publishedAt" DESC
        LIMIT 3
      `,
      sql`
        SELECT name, slug, tagline, "logoUrl", "pricingModel", "avgRating"
        FROM "AiTool"
        WHERE status = 'APPROVED' AND "deletedAt" IS NULL
          AND "startupId" = ${s.id}
        ORDER BY "createdAt" DESC
      `,
      // Single UNION ALL query for similar startups instead of 4 sequential queries
      sql`
        (SELECT name, slug, tagline, "logoUrl", stage, "headquartersCity", category, "businessType", 1 AS priority
         FROM "Startup"
         WHERE "deletedAt" IS NULL AND "isApproved" = true AND slug != ${slug}
           AND category = ${category} AND stage = ${s.stage}
         ORDER BY "impactScore" DESC NULLS LAST LIMIT 3)
        UNION ALL
        (SELECT name, slug, tagline, "logoUrl", stage, "headquartersCity", category, "businessType", 2 AS priority
         FROM "Startup"
         WHERE "deletedAt" IS NULL AND "isApproved" = true AND slug != ${slug}
           AND category = ${category}
         ORDER BY "impactScore" DESC NULLS LAST LIMIT 6)
        UNION ALL
        (SELECT name, slug, tagline, "logoUrl", stage, "headquartersCity", category, "businessType", 3 AS priority
         FROM "Startup"
         WHERE "deletedAt" IS NULL AND "isApproved" = true AND slug != ${slug}
           AND "headquartersCity" = ${city}
           AND "headquartersCity" IS NOT NULL AND "headquartersCity" != ''
         ORDER BY "impactScore" DESC NULLS LAST LIMIT 2)
        UNION ALL
        (SELECT name, slug, tagline, "logoUrl", stage, "headquartersCity", category, "businessType", 4 AS priority
         FROM "Startup"
         WHERE "deletedAt" IS NULL AND "isApproved" = true AND slug != ${slug}
           AND stage = ${s.stage}
         ORDER BY "impactScore" DESC NULLS LAST LIMIT 3)
      `,
      s.claimedBy
        ? sql`SELECT name, role, bio, avatar, linkedin, twitter, website FROM "FounderUser" WHERE id = ${s.claimedBy} LIMIT 1`
        : Promise.resolve([]),
      sql`
        SELECT jl.id, jl.title, jl.slug, jl.city AS location, jl."workType" AS type,
               jl."salaryMin" AS "salaryRangeMin", jl."salaryMax" AS "salaryRangeMax",
               jl."publishedAt"::text AS "createdAt", 'board' AS source
        FROM "JobBoardListing" jl
        LEFT JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE e."startupId" = ${s.id}
          AND e."startupClaimMethod" IN ('DOMAIN_OTP', 'ADMIN', 'FOUNDER')
          AND jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnProfile" = true
        ORDER BY jl."publishedAt" DESC
        LIMIT 10
      `,
      sql`
        SELECT id, title, slug, excerpt, "publishedAt"::text AS "publishedAt", "contentText"
        FROM "Article"
        WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
          AND type = 'STARTUP_UPDATE' AND "startupId" = ${s.id}
        ORDER BY "publishedAt" DESC
        LIMIT 5
      `,
      sql`
        SELECT id, title, description, type, amount, currency, date::text AS date,
               "verificationStatus", "isPublic"
        FROM "FounderMilestone"
        WHERE "startupId" = ${s.id} AND status = 'ACTIVE' AND "isPublic" = true
        ORDER BY date DESC
        LIMIT 10
      `,
    ]);

    // Deduplicate similar startups by priority order (same logic, single pass)
    const seenSlugs = new Set<string>();
    const similar: any[] = [];
    const priorityReasons: Record<number, string> = {
      1: category, 2: category,
      3: city ? `In ${city}` : '', 4: '',
    };
    for (const r of (similarCandidates as any[])) {
      if (!seenSlugs.has(r.slug) && similar.length < 8) {
        seenSlugs.add(r.slug);
        similar.push({ ...r, matchReason: priorityReasons[r.priority] || '' });
      }
    }

    // Enrich foundersData with FounderUser profile
    let enrichedFoundersData = s.foundersData || [];
    if (founderProfile.length > 0) {
      const profile = founderProfile[0] as any;
      if (enrichedFoundersData.length > 0) {
        enrichedFoundersData[0] = {
          ...enrichedFoundersData[0],
          bio: profile.bio || enrichedFoundersData[0].bio,
          avatar: profile.avatar || enrichedFoundersData[0].avatar,
          linkedin: profile.linkedin || enrichedFoundersData[0].linkedin,
          twitter: profile.twitter || enrichedFoundersData[0].twitter,
          website: profile.website || enrichedFoundersData[0].website,
        };
      } else {
        enrichedFoundersData = [{
          name: profile.name, role: profile.role || 'Founder',
          bio: profile.bio, avatar: profile.avatar,
          linkedin: profile.linkedin, twitter: profile.twitter, website: profile.website,
        }];
      }
    }

    const jobs: any[] = boardJobs as any[];

    return {
      ...s,
      foundersData: enrichedFoundersData,
      fundingRounds: rounds,
      relatedNews: news,
      similarStartups: similar,
      reviews: [],
      avgRating: null,
      reviewCount: 0,
      founderStories: stories,
      products,
      jobs,
      startupUpdates,
      startupMilestones,
    };
  } catch (e) {
    console.error('[getStartup] ERROR:', e);
    return null;
  }
});

function formatUsd(usd: number | null) {
  if (!usd || Number(usd) === 0) return null;
  const u = Number(usd) / 100;
  if (u >= 1e9) return `$${(u / 1e9).toFixed(1)}B`;
  if (u >= 1e6) return `$${(u / 1e6).toFixed(0)}M`;
  return `$${(u / 1e3).toFixed(0)}K`;
}

function getRelativeTime(dateString: string | null | undefined) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'Just updated';
    }
    if (diffMins < 60) {
      return `Updated ${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `Updated ${diffHours}h ago`;
    }
    if (diffDays === 1) {
      return 'Updated yesterday';
    }
    if (diffDays < 7) {
      return `Updated ${diffDays}d ago`;
    }
    
    return `Updated on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch (e) {
    return null;
  }
}

function stageLabel(s: string) {
  return s?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
}

// Get industry tag - use selected category if available, otherwise detect
function getIndustryTag(startup: any): string | null {
  // First, check if startup has a manually selected category
  if (startup.category) {
    return startup.category;
  }
  
  // Fallback to auto-detection if no category is set
  const combined = `${startup.name || ''} ${startup.description || ''} ${startup.tagline || ''}`;
  return detectCategory(combined);
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const s = await getStartup(params.slug) as any;
  if (!s) return { title: 'Startup Not Found' };

  const title = `${s.name} - ${s.tagline || 'AI Startup'} | Udyaibase`;
  const description = (s.description || s.tagline || '').slice(0, 155);
  const url = `https://udyaibase.com/startups/${s.slug}`;

  // Use dynamic OG image (auto-generated from opengraph-image.tsx)
  const image = `${url}/opengraph-image`;

  return {
    title,
    description,
    keywords: [
      s.name,
      s.tagline,
      'AI startup India',
      s.headquartersCity,
      s.stage,
      'artificial intelligence',
      'machine learning',
      'India AI Mission',
      'startup funding'
    ].filter(Boolean).join(', '),
    authors: s.founders?.map((name: string) => ({ name })),
    creator: s.name,
    publisher: 'Udyaibase',
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Udyaibase',
      images: [{
        url: image,
        width: 1200,
        height: 630,
        alt: `${s.name} - ${s.tagline || 'AI Startup'}`
      }],
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      creator: '@udyaibase',
      site: '@udyaibase',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function StartupDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const startup: any = await getStartup(params.slug);

  if (!startup) {
    // Check if this is an old slug that was changed — redirect to new URL
    try {
      const redirectCheck = await sql`
        SELECT slug FROM "Startup"
        WHERE ${params.slug} = ANY("previousSlugs") AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (redirectCheck.length > 0) {
        const { redirect } = await import('next/navigation');
        redirect(`/startups/${(redirectCheck[0] as any).slug}`);
      }
    } catch (e: any) {
      if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">Startup not found</h1>
        <p className="text-gray-500 font-jakarta text-sm mb-6">We couldn&apos;t find a startup with this URL.</p>
        <Link href="/startups" className="btn-brand">Browse All Startups</Link>
      </div>
    );
  }

  const totalRaised = startup.fundingRounds.reduce((sum: number, r: any) => sum + Number(r.amountUsd || 0), 0);
  const industryTag = getIndustryTag(startup);
  const relativeTime = getRelativeTime(startup.updatedAt);

  // Load FAQs from database first
  let faqs: any[] = [];
  try {
    const dbFaqs = await sql`
      SELECT id, question, answer, "order"
      FROM "StartupFAQ"
      WHERE "startupId" = ${startup.id}
      ORDER BY "order" ASC
    `;
    
    if (dbFaqs.length > 0) {
      // Use database FAQs if they exist
      faqs = dbFaqs.map((faq: any) => ({
        question: faq.question,
        answer: faq.answer
      }));
    } else {
      // Fallback to generated FAQs if no database FAQs exist
      faqs = generateStartupFAQs(startup, totalRaised);
    }
  } catch (error) {
    console.error('Error loading FAQs:', error);
    // Fallback to generated FAQs on error
    faqs = generateStartupFAQs(startup, totalRaised);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-2 lg:px-4 py-6 sm:py-10">
      {/* JSON-LD Schema: Single @graph with WebPage + Organization + BreadcrumbList */}
      <StartupSchema startup={startup} />
      <TrackView entityType="startup" entityId={startup.id} />

      {/* FAQ Schema (separate) */}
      <FAQSchema faqs={faqs} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/startups" className="hover:text-brand">Startups</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">{startup.name}</span>
      </nav>

      {/* Claim Banner - Removed (now in sidebar only) */}

      {/* ── Header ── */}
      <div className="mb-6">
        {/* Row 1: Logo + Name/Tagline + Impact Score */}
        <div className="flex items-start gap-4 mb-4">
          {/* Logo */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0 shadow-md ring-2 ring-white dark:ring-gray-700 border border-brand/10 overflow-hidden">
            {startup.logoUrl ? (
              <Image src={startup.logoUrl} alt={startup.name} width={80} height={80} sizes="80px" className="w-full h-full object-cover rounded-xl sm:rounded-2xl" />
            ) : (
              <Building2 className="w-8 h-8 text-brand" />
            )}
            {startup.isVerified && <VerifiedBadge onLogo size="md" />}
          </div>

          {/* Name + Tagline (flex-1 so Impact Score stays right) */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white leading-tight">{startup.name}</h1>
                  {startup.isVerified && <VerifiedBadge size="md" showText />}
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-sm mt-1 line-clamp-2">{startup.tagline}</p>
              </div>
              {/* Impact Score — top right, parallel to logo */}
              {startup.impactScore > 0 && (() => {
                const totalFundingUsdCents = (startup.fundingRounds || []).reduce((sum: number, r: any) => sum + Number(r.amountUsd || 0), 0);
                const breakdown = calculateImpactScore({
                  totalFundingUsdCents,
                  employeeCount: startup.employeeCount,
                  stage: startup.stage,
                  foundedYear: startup.foundedYear,
                });
                return (
                  <div className="relative shrink-0">
                    <ImpactScoreBadge score={breakdown.total} breakdown={breakdown} />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Row 2: Tags (Left) + Actions (Right) */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left Side: Tags */}
          <div className="flex flex-wrap items-center gap-2">
            {industryTag && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-brand/10 dark:bg-brand/20 text-brand px-2 py-0.5 rounded-full">
                <Tag className="w-3 h-3" />{industryTag}
              </span>
            )}
            {startup.businessType && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-full">
                {startup.businessType}
              </span>
            )}
            <span className="text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
              {stageLabel(startup.stage)}
            </span>
            {startup.status && (
              <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                startup.status === 'ACTIVE'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                  : startup.status === 'PUBLIC'
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'
                  : startup.status === 'ACQUIRED'
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-900/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
                {startup.status === 'ACTIVE' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
                {startup.status}
              </span>
            )}
            {startup.headquartersCity && (
              <span className="flex items-center gap-1 text-[11px] text-gray-400 font-jakarta">
                <MapPin className="w-3 h-3" />{startup.headquartersCity}
              </span>
            )}
            {startup.isFeatured && (
              <span className="text-[11px] font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded-full">★ Featured</span>
            )}
            {totalRaised > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                {formatUsd(totalRaised)} raised
              </span>
            )}
            {relativeTime && (
              <span className="flex items-center gap-1 text-[11px] font-medium bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                <Clock className="w-3 h-3 text-gray-400 dark:text-gray-500" /> {relativeTime}
              </span>
            )}
            <ReportButton entityType="STARTUP" entityId={startup.id} entityName={startup.name} entitySlug={startup.slug} />
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 md:justify-end">
            {startup.websiteUrl && (
              <div className="relative group">
                <a href={appendUtmParams(startup.websiteUrl, 'ai_startups_directory', startup.slug)} target="_blank" rel="noopener noreferrer"
                  className="w-11 h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-500 dark:hover:border-blue-450 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors"
                >
                  <Globe className="w-5 h-5" />
                </a>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-dropdown hidden group-hover:flex flex-col items-center animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
                  <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">
                    {startup.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
                  </div>
                </div>
              </div>
            )}
            {startup.linkedinUrl && (
              <div className="relative group">
                <a href={startup.linkedinUrl} target="_blank" rel="noopener noreferrer"
                  className="w-11 h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm text-[#0A66C2] hover:scale-105 hover:border-[#0A66C2] hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-dropdown hidden group-hover:flex flex-col items-center animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
                  <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">
                    LinkedIn
                  </div>
                </div>
              </div>
            )}
            {startup.twitterUrl && (
              <div className="relative group">
                <a href={startup.twitterUrl} target="_blank" rel="noopener noreferrer"
                  className="w-11 h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm text-gray-900 dark:text-gray-100 hover:scale-105 hover:border-gray-900 dark:hover:border-gray-100 hover:bg-gray-50/30 dark:hover:bg-gray-950/20 transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-dropdown hidden group-hover:flex flex-col items-center animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
                  <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">
                    Twitter / X
                  </div>
                </div>
              </div>
            )}
            {Array.isArray(startup.socialLinks) && startup.socialLinks.map((link: any) => {
              const platform = link.platform;
              const url = link.url;
              if (!url) return null;

              let icon = <Globe className="w-5 h-5" />;
              let hoverColor = "hover:text-brand hover:border-brand";
              let hoverBg = "hover:bg-brand/10";
              let label = platform;

              switch (platform) {
                case 'facebook':
                  label = 'Facebook';
                  hoverColor = "hover:text-[#1877F2] hover:border-[#1877F2]";
                  hoverBg = "hover:bg-blue-50/30 dark:hover:bg-blue-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  );
                  break;
                case 'github':
                  label = 'GitHub';
                  hoverColor = "hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-900 dark:hover:border-gray-100";
                  hoverBg = "hover:bg-gray-50/30 dark:hover:bg-gray-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                    </svg>
                  );
                  break;
                case 'crunchbase':
                  label = 'Crunchbase';
                  hoverColor = "hover:text-[#0284c7] hover:border-[#0284c7]";
                  hoverBg = "hover:bg-sky-50/30 dark:hover:bg-sky-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 18.5c-3.58 0-6.5-2.92-6.5-6.5S8.42 5.5 12 5.5c2.19 0 4.12 1.08 5.31 2.74l-2.73 1.69A3.244 3.244 0 0 0 12 8.75c-1.79 0-3.25 1.46-3.25 3.25s1.46 3.25 3.25 3.25c1.17 0 2.2-.62 2.79-1.56l2.73 1.69c-1.26 1.76-3.3 2.62-5.52 2.62z"/>
                    </svg>
                  );
                  break;
                case 'instagram':
                  label = 'Instagram';
                  hoverColor = "hover:text-[#E1306C] hover:border-[#E1306C]";
                  hoverBg = "hover:bg-pink-50/30 dark:hover:bg-pink-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  );
                  break;
                case 'youtube':
                  label = 'YouTube';
                  hoverColor = "hover:text-[#FF0000] hover:border-[#FF0000]";
                  hoverBg = "hover:bg-red-50/30 dark:hover:bg-red-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.53 3.5 12 3.5 12 3.5s-7.53 0-9.388.555A3.002 3.002 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.47 20.5 12 20.5 12 20.5s7.53 0 9.388-.555a3.002 3.002 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  );
                  break;
                case 'producthunt':
                  label = 'Product Hunt';
                  hoverColor = "hover:text-[#DA552F] hover:border-[#DA552F]";
                  hoverBg = "hover:bg-orange-50/30 dark:hover:bg-orange-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12zm-1-17h3.5c2.485 0 4.5 2.015 4.5 4.5S16.985 16 14.5 16H11v4H8V7h3zm3 6c.828 0 1.5-.672 1.5-1.5S14.828 10 14 10h-3v3h3z"/>
                    </svg>
                  );
                  break;
                case 'discord':
                  label = 'Discord';
                  hoverColor = "hover:text-[#5865F2] hover:border-[#5865F2]";
                  hoverBg = "hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20";
                  icon = (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z"/>
                    </svg>
                  );
                  break;
              }

              return (
                <div key={platform} className="relative group animate-in fade-in zoom-in-95 duration-150">
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className={`w-11 h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm ${hoverColor} ${hoverBg} hover:scale-105 transition-all`}
                  >
                    {icon}
                  </a>
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-dropdown hidden group-hover:flex flex-col items-center animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
                    <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">
                      {label}
                    </div>
                  </div>
                </div>
              );
            })}
            <BookmarkButton type="startup" itemId={startup.slug} itemName={startup.name} variant="icon" size="lg" />
            <ShareMenu
              url={`https://udyaibase.com/startups/${startup.slug}`}
              title={`${startup.name} — ${startup.tagline}`}
              utmCampaign="startup_share"
              variant="icon"
              entityType="STARTUP"
              entityId={startup.id}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* ── Main ── */}
        <div className="flex-1 space-y-6">

          {/* About */}
          <div className="card p-5 sm:p-6">
            <h2 className="section-title mb-4">About</h2>

            {/* Description — 4 lines, 500 word limit */}
            <p className="text-gray-600 dark:text-gray-300 font-jakarta text-xs sm:text-sm leading-relaxed line-clamp-4">
              {startup.description}
            </p>

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              {startup.foundedYear && (
                <div>
                  <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 mb-1">
                    <Calendar className="w-3 h-3" /> Founded
                  </span>
                  <span className="font-sora font-bold text-xs text-navy dark:text-white">{startup.foundedYear}</span>
                </div>
              )}
              {startup.employeeCount && (
                <div>
                  <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 mb-1">
                    <Users className="w-3 h-3" /> Employees
                  </span>
                  <span className="font-sora font-bold text-xs text-navy dark:text-white block">{startup.employeeCount}+</span>
                  {startup.foundedYear && (
                    <span className="text-xs text-brand font-jakarta flex items-center gap-0.5 mt-0.5">
                      <ArrowUpRight className="w-3 h-3" />
                      Growing since {startup.foundedYear}
                    </span>
                  )}
                </div>
              )}
              {startup.headquartersCity && (
                <div>
                  <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3" /> Location
                  </span>
                  <span className="font-sora font-bold text-xs text-navy dark:text-white">{startup.headquartersCity}</span>
                </div>
              )}
              {startup.websiteUrl && (
                <div>
                  <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 mb-1">
                    <Globe className="w-3 h-3" /> Website
                  </span>
                  <a href={appendUtmParams(startup.websiteUrl, 'ai_startups_directory', startup.slug)} target="_blank" rel="noopener noreferrer"
                    className="font-sora font-bold text-xs text-brand hover:underline break-all block">
                    {startup.websiteUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Founders */}
          {startup.foundersData?.length > 0 && (
            <FoundersSection founders={startup.foundersData} startupName={startup.name} />
          )}

          {/* Startup Updates */}
          {startup.startupUpdates?.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand" /> Latest Updates
              </h2>
              <div className="space-y-3">
                {startup.startupUpdates.map((u: any) => (
                  <Link key={u.id} href={`/news/${u.slug}`} className="block p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                    <h3 className="font-sora font-bold text-xs text-navy dark:text-white mb-1">{u.title}</h3>
                    {u.contentText && <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta line-clamp-2">{u.contentText.slice(0, 200)}</p>}
                    <span className="text-xs text-gray-400 font-jakarta mt-1 block">
                      {new Date(u.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Milestones */}
          {startup.startupMilestones?.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-brand" /> Milestones
              </h2>
              <div className="relative">
                <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-4">
                  {startup.startupMilestones.map((m: any) => {
                    const icons: Record<string, string> = { FUNDING: '💰', LAUNCH: '🚀', PARTNERSHIP: '🤝', ACQUISITION: '🏢', AWARD: '🏆', HIRING: '👥', REVENUE: '📈', USER_MILESTONE: '🎯' };
                    return (
                      <div key={m.id} className="flex items-start gap-3 relative">
                        <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-lg shrink-0 z-[1]">
                          {icons[m.type] || '📌'}
                        </div>
                        <div className="pt-1.5">
                          <h3 className="font-sora font-bold text-xs text-navy dark:text-white flex items-center gap-1.5">
                            {m.title}
                            {m.verificationStatus === 'PLATFORM_VERIFIED' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-jakarta">Verified</span>
                            )}
                          </h3>
                          {m.description && <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">{m.description}</p>}
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 font-jakarta">
                            <span>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            {m.amount && <span>{m.currency} {Number(m.amount).toLocaleString()}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Funding History */}
          {startup.fundingRounds.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-5 sm:p-6">
                <h2 className="section-title mb-4 flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-brand" /> Funding History
                </h2>
                <div className="relative">
                  <div className="space-y-3">
                    {startup.fundingRounds.map((r: any, i: number) => {
                      const row = (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                            <IndianRupee className="w-5 h-5 text-brand" />
                          </div>
                          <div>
                            <span className="font-sora font-bold text-xs text-navy dark:text-white block">{r.roundType}</span>
                            <span className="text-[11px] text-gray-400 font-jakarta">
                              {r.leadInvestors?.length > 0 ? r.leadInvestors.join(', ') : 'Undisclosed'}
                              {r.announcedAt && ` · ${new Date(r.announcedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
                            </span>
                          </div>
                        </div>
                        <span className="font-sora font-bold text-sm text-brand">{formatUsd(r.amountUsd) || 'Undisclosed'}</span>
                      </div>
                      );
                      // Signed-out visitors see the first half (soft gate, decided in the browser so the page stays cached).
                      return i < Math.max(1, Math.floor(startup.fundingRounds.length / 2)) ? row : <SignedIn key={i}>{row}</SignedIn>;
                    })}
                  </div>
                  {startup.fundingRounds.length > 1 && (
                    <SignedOut>
                      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
                    </SignedOut>
                  )}
                </div>
              </div>
              {startup.fundingRounds.length > 1 && (
                <SignedOut>
                  <SignInGate isSignedIn={false} blurContent={false} label={`Sign in to see all ${startup.fundingRounds.length} funding rounds`} />
                </SignedOut>
              )}
            </div>
          )}


          {/* AI Products */}
          <div className="card p-5 sm:p-6">
            <h2 className="section-title mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand" /> AI Products
            </h2>
            {startup.products && startup.products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {startup.products.map((product: any) => (
                  <Link key={product.slug} href={`/tools/${product.slug}`} className="group p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-brand/30 transition-all flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                      {product.logoUrl ? (
                        <Image src={product.logoUrl} alt={product.name} width={48} height={48} sizes="48px" className="w-full h-full object-cover" />
                      ) : (
                        <Cpu className="w-5 h-5 text-brand" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 justify-between">
                        <h4 className="font-sora font-bold text-xs text-navy dark:text-white group-hover:text-brand transition-colors truncate">
                          {product.name}
                        </h4>
                        <span className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0">
                          {product.pricingModel}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1 line-clamp-1 leading-snug">
                        {product.tagline}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/20">
                <Cpu className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400 font-jakarta">No AI tools built by this startup listed yet.</p>
              </div>
            )}
          </div>

          {/* Open Jobs */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-brand" /> Jobs at {startup.name}
              </h2>
              <Link href="/jobs" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta">
                View all jobs &rsaquo;
              </Link>
            </div>
            
            {startup.jobs && startup.jobs.length > 0 ? (
              <div className="divide-y divide-gray-150 dark:divide-gray-800/80">
                {startup.jobs.map((job: any) => (
                  <div key={job.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4 font-jakarta">
                    <div>
                      <Link 
                        href={job.slug ? `/jobs/${job.slug}?source=profile` : `/jobs/${job.id}`} 
                        className="text-sm font-bold text-link dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline leading-snug"
                      >
                        {job.title}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap items-center gap-1.5 font-medium">
                        <span>{job.location || 'Remote'}</span>
                        <span>·</span>
                        <span>{job.type?.replace(/_/g, ' ') || 'Full Time'}</span>
                        {job.salaryRangeMin && (
                          <>
                            <span>·</span>
                            <span>
                              ${(job.salaryRangeMin / 1000).toFixed(0)}k - ${(job.salaryRangeMax / 1000).toFixed(0)}k
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Link 
                      href={job.slug ? `/jobs/${job.slug}?source=profile` : `/jobs/${job.id}`} 
                      className="btn-brand py-1.5 px-4 text-xs font-bold tracking-wide flex items-center justify-center shrink-0 shadow-sm transition-all hover:scale-105"
                    >
                      Apply Now &rsaquo;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/20">
                <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400 font-jakarta mb-2">No open roles currently listed.</p>
                <Link href="/employer/signup" className="text-xs text-brand font-semibold font-jakarta hover:underline">
                  Hiring for this company? Post jobs →
                </Link>
              </div>
            )}
          </div>

          {/* Upcoming Events */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand" /> Events at {startup.name}
              </h2>
              <Link href="/events" className="text-brand font-semibold text-xs sm:text-sm hover:underline flex items-center gap-1 font-jakarta">
                View all events &rsaquo;
              </Link>
            </div>
            
            {startup.events && startup.events.length > 0 ? (
              <div className="divide-y divide-gray-150 dark:divide-gray-800/80">
                {startup.events.map((event: any) => (
                  <div key={event.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4 font-jakarta">
                    <div>
                      <Link 
                        href={`/events/${event.id}`} 
                        className="text-sm font-bold text-link dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline leading-snug"
                      >
                        {event.title}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap items-center gap-1.5 font-medium">
                        <span>{new Date(event.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span>·</span>
                        <span>{event.location || 'Online'}</span>
                      </div>
                    </div>
                    <Link 
                      href={`/events/${event.id}`} 
                      className="btn-brand py-1.5 px-4 text-xs font-bold tracking-wide flex items-center justify-center shrink-0 shadow-sm transition-all hover:scale-105"
                    >
                      Register Now &rsaquo;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-900/20">
                <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400 font-jakarta">No upcoming events scheduled.</p>
              </div>
            )}
          </div>

          {/* Community Reviews & Ratings */}
          {false && (
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2">
                  <Star className="w-4 h-4 text-brand" /> Community Reviews
                </h2>
                {startup.reviewCount > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-sora font-bold text-sm text-navy dark:text-white">{startup.avgRating}</span>
                    <span className="text-xs text-gray-400 font-jakarta">({startup.reviewCount} {startup.reviewCount === 1 ? 'review' : 'reviews'})</span>
                  </div>
                )}
              </div>
              
              {startup.reviews && startup.reviews.length > 0 ? (
                <div className="space-y-4">
                  {startup.reviews.map((review: any) => (
                    <div key={review.id} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                            {review.userName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-sora font-bold text-sm text-navy dark:text-white">{review.userName || 'Anonymous'}</span>
                              {review.isVerifiedFounder && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold">Verified Founder</span>
                              )}
                              {review.isVerifiedInvestor && (
                                <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 rounded font-semibold">Verified Investor</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 font-jakarta">
                              {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {[1,2,3,4,5].map(i => (
                            <Star key={i} className={`w-3 h-3 ${i <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      </div>
                      {review.title && (
                        <h4 className="font-sora font-bold text-sm text-navy dark:text-white mb-1">{review.title}</h4>
                      )}
                      <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed mb-2">
                        {review.body}
                      </p>
                      {review.helpfulCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <ThumbsUp className="w-3 h-3" />
                          <span>{review.helpfulCount} found this helpful</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Star className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-jakarta text-sm mb-4">No reviews yet. Be the first to share your experience!</p>
                </div>
              )}

              <WriteStartupReviewClient startupSlug={startup.slug} startupName={startup.name} />
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">
          {/* Claim This Startup Card */}
          <ClaimStartupCard 
            startupId={startup.id}
            startupSlug={startup.slug}
            isVerified={startup.isVerified || false}
            isClaimed={!!startup.claimedBy}
            claimedBy={startup.claimedBy ?? null}
          />
          
          {/* EmbedBadge temporarily hidden - can be shown in future */}
          {/* <EmbedBadge urlSlug={startup.slug} type="startups" /> */}


          {/* Founder Stories */}
          {startup.founderStories?.length > 0 && (
            <div className="card p-5">
              <h4 className="font-sora font-bold text-xs text-navy dark:text-white mb-4">Founder Stories</h4>
              <div className="space-y-3">
                {startup.founderStories.map((story: any) => (
                  <Link key={story.slug} href={`/stories/${story.slug}`} className="group block">
                    <h5 className="text-xs font-jakarta text-link dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300 hover:underline group-hover:underline transition-colors leading-snug line-clamp-2">{story.title}</h5>
                    <span className="text-xs text-gray-400 font-jakarta">
                      {new Date(story.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Related News */}
          {startup.relatedNews.length > 0 && (
            <div className="card p-5">
              <h4 className="font-sora font-bold text-xs text-navy dark:text-white mb-4">Related News</h4>
              <div className="space-y-3">
                {startup.relatedNews.map((n: any) => (
                  <Link key={n.slug} href={`/news/${n.slug}`} className="group block">
                    <h5 className="text-xs font-jakarta text-link dark:text-blue-400 group-hover:text-blue-800 dark:group-hover:text-blue-300 hover:underline group-hover:underline transition-colors leading-snug line-clamp-2">{n.title}</h5>
                    <span className="text-xs text-gray-400 font-jakarta">
                      {new Date(n.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Track startup */}
          <div className="card p-5 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
            <h4 className="font-sora font-bold text-xs text-navy dark:text-white mb-2">Track this startup</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
              Get notified about funding rounds, product launches, and news.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe" />
          </div>
        </aside>
      </div>

      {/* FAQ Section */}
      <div className="mt-12">
        <FAQSection faqs={faqs} />
      </div>

      {/* Similar Startups Carousel */}
      <SimilarStartupsCarousel startups={startup.similarStartups || []} />
    </div>
  );
}
