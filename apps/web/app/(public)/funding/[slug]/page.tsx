import { jsonLd } from "@/lib/json-ld";
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cache } from 'react';
import { ChevronRight, IndianRupee, Calendar, Users, Building2, ExternalLink, TrendingUp } from 'lucide-react';
import { getFundingRoundBySlugDirect, getStartupRoundsDirect } from '@/lib/db';
import { inrLabel, roundAmount, roundHeadline, roundLabel, usdLabel } from '@/lib/funding/format';
import { fitTitle, metaSnippet } from '@/lib/seo-text';
import SignInGate from '@/components/SignInGate';
import { SignedIn, SignedOut } from '@/components/auth/SignedIn';

export const revalidate = 86400; // Regenerate daily

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

const getRound = cache((slug: string) => getFundingRoundBySlugDirect(slug));

const longDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** One public paragraph Google can read (the detailed card stays behind sign-in). */
function summary(round: any): string {
  const amount = roundAmount(round);
  const inr = usdLabel(round.amountUsd) ? inrLabel(round.amountInr) : null;
  const lead = (round.leadInvestors as string[] | null)?.filter(Boolean) ?? [];
  const others = ((round.allInvestors as string[] | null) ?? []).filter((i) => i && !lead.includes(i));
  const where = round.headquartersCity ? `${String(round.headquartersCity).split(',')[0].trim()}-based ` : '';
  const parts = [
    `${where}${round.startupName}${round.startupTagline ? `, ${String(round.startupTagline).replace(/\.$/, '').replace(/^./, (c: string) => c.toLowerCase())},` : ''} raised ${amount ? `${amount}${inr ? ` (about ${inr})` : ''} in` : 'a'} ${roundLabel(round.roundType)} round announced on ${longDate(round.announcedAt)}.`,
    lead.length ? `The round was led by ${lead.join(', ')}${others.length ? `, with participation from ${others.slice(0, 4).join(', ')}${others.length > 4 ? ' and others' : ''}` : ''}.` : others.length ? `Investors include ${others.slice(0, 5).join(', ')}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const round = await getRound(params.slug);
  if (!round) return { title: 'Funding Round Not Found', robots: { index: false } };

  const year = new Date(round.announcedAt).getFullYear();
  const headline = roundHeadline(round as any);
  const title = fitTitle([
    `${headline} (${year}) — Investors & Details`,
    `${headline} (${year})`,
    headline,
  ]);
  const description = metaSnippet(summary(round));
  const url = `https://udyaibase.com/funding/${params.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: headline,
      description,
      type: 'article',
      url,
      siteName: 'Udyaibase',
      publishedTime: round.announcedAt,
      images: [{ url: 'https://udyaibase.com/og-image.webp', width: 2250, height: 1181 }],
    },
    twitter: { card: 'summary_large_image', title: headline, description, images: ['https://udyaibase.com/og-image.webp'] },
  };
}

export default async function FundingRoundPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const round = await getRound(params.slug) as any;
  if (!round) notFound();

  const pageUrl = `https://udyaibase.com/funding/${params.slug}`;
  const headline = roundHeadline(round);
  const amountUsd = usdLabel(round.amountUsd);
  const amountInr = inrLabel(round.amountInr);
  const history = ((await getStartupRoundsDirect(round.startupId)) as any[]).filter((r) => r.id !== round.id);
  const text = summary(round);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        "@id": `${pageUrl}#article`,
        "headline": headline,
        "description": text,
        "url": pageUrl,
        "mainEntityOfPage": pageUrl,
        "datePublished": round.announcedAt,
        "image": ["https://udyaibase.com/og-image.webp"],
        "author": { "@type": "Organization", "name": "Udyaibase", "url": "https://udyaibase.com" },
        "publisher": { "@type": "Organization", "@id": "https://udyaibase.com/#organization", "name": "Udyaibase" },
        "about": {
          "@type": "Organization",
          "name": round.startupName,
          "url": `https://udyaibase.com/startups/${round.startupSlug}`,
          ...(round.startupLogoUrl ? { "logo": round.startupLogoUrl } : {}),
        },
        "inLanguage": "en-IN",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://udyaibase.com" },
          { "@type": "ListItem", "position": 2, "name": "Funding Tracker", "item": "https://udyaibase.com/funding" },
          { "@type": "ListItem", "position": 3, "name": headline, "item": pageUrl },
        ],
      },
    ],
  };

  return (
    <div className="max-w-5xl mx-auto px-0 sm:px-2 lg:px-4 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/funding" className="hover:text-brand">Funding</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate">{round.startupName}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 badge-brand mb-3 text-xs sm:text-xs">
          <IndianRupee className="w-3 h-3" /> {roundLabel(round.roundType)}
        </div>
        <div className="flex items-start gap-4">
          {round.startupLogoUrl && (
            <div className="w-14 h-14 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
              <Image src={round.startupLogoUrl} alt={`${round.startupName} logo`} width={48} height={48} sizes="48px" className="w-12 h-12 object-contain" />
            </div>
          )}
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl md:text-4xl text-navy dark:text-white mb-4">
            {headline}
          </h1>
        </div>
        {/* Public summary: what Google and signed-out readers see; the full card below stays behind sign-in. */}
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed max-w-3xl">
          {text}
        </p>
      </div>

      {/* Funding Details Card */}
      <div className="card overflow-hidden mb-8">
        <div className="p-6 sm:p-8">
        <h2 className="font-sora font-bold text-xl text-navy dark:text-white mb-6">Funding Details</h2>
        {/* Soft gate, decided in the browser so the page stays cached (the amount is in the page's schema anyway). */}
        <SignedIn>
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2">
                  <IndianRupee className="w-4 h-4" />
                  <span>Amount Raised</span>
                </div>
                <p className="font-sora font-bold text-2xl text-brand">{amountUsd ?? amountInr ?? 'Undisclosed'}</p>
                {amountUsd && amountInr && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{amountInr}</p>}
              </div>

              <div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2">
                  <Calendar className="w-4 h-4" />
                  <span>Announced Date</span>
                </div>
                <p className="font-sora font-bold text-lg text-navy dark:text-white">{longDate(round.announcedAt)}</p>
              </div>

              {round.headquartersCity && (
                <div>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2">
                    <Building2 className="w-4 h-4" />
                    <span>Headquarters</span>
                  </div>
                  <p className="font-sora font-bold text-lg text-navy dark:text-white">{round.headquartersCity}</p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2">
                  <Users className="w-4 h-4" />
                  <span>Round Type</span>
                </div>
                <p className="font-sora font-bold text-lg text-navy dark:text-white">{roundLabel(round.roundType)}</p>
              </div>
            </div>

            {round.leadInvestors && round.leadInvestors.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <h3 className="font-sora font-bold text-sm text-gray-500 dark:text-gray-400 mb-3">Lead Investors</h3>
                <div className="flex flex-wrap gap-2">
                  {round.leadInvestors.map((investor: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-[color:color-mix(in_srgb,var(--brand-color)_10%,transparent)] text-brand rounded-lg text-sm font-semibold">{investor}</span>
                  ))}
                </div>
              </div>
            )}

            {round.allInvestors && round.allInvestors.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <h3 className="font-sora font-bold text-sm text-gray-500 dark:text-gray-400 mb-3">All Investors</h3>
                <div className="flex flex-wrap gap-2">
                  {round.allInvestors.map((investor: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm">{investor}</span>
                  ))}
                </div>
              </div>
            )}

            {round.sourceUrl && (
              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                <a href={round.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2 text-brand hover:underline text-sm font-semibold">
                  View Original Announcement
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </>
        </SignedIn>
        </div>
        <SignedOut>
          <SignInGate isSignedIn={false} blurContent={false} label="Sign in to view funding details" />
        </SignedOut>
      </div>

      {/* Funding history: the startup's other rounds, each with its own page */}
      {history.length > 0 && (
        <section className="card p-6 mb-8" aria-labelledby="history-heading">
          <h2 id="history-heading" className="font-sora font-bold text-lg text-navy dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand" /> {round.startupName} funding history
          </h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((r) => {
              const label = `${roundLabel(r.roundType)}${roundAmount(r) ? ` · ${roundAmount(r)}` : ''}`;
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-4 font-jakarta text-sm">
                  {r.slug ? (
                    <Link href={`/funding/${r.slug}`} className="font-semibold text-navy dark:text-white hover:text-brand">{label}</Link>
                  ) : (
                    <span className="font-semibold text-navy dark:text-white">{label}</span>
                  )}
                  <span className="text-gray-500 dark:text-gray-400 shrink-0">{longDate(r.announcedAt)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Startup Link */}
      <div className="card p-6 bg-gradient-to-br from-brand-50 to-white dark:from-brand-900/20 dark:to-gray-900">
        <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-3">About {round.startupName}</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {round.startupTagline || `Learn more about ${round.startupName}, their products, team, and impact on the AI ecosystem.`}
        </p>
        <Link href={`/startups/${round.startupSlug}`} className="btn-brand inline-flex items-center gap-2">
          View Startup Profile
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="mt-8 text-center">
        <Link href="/funding" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-brand text-sm font-semibold">
          ← Back to Funding Tracker
        </Link>
      </div>
    </div>
  );
}
