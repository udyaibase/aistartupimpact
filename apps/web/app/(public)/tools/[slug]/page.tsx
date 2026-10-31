import { jsonLd as jsonLdHtml } from "@/lib/json-ld";
import Link from 'next/link';
import Image from 'next/image';
import { cache } from 'react';
import { Metadata } from 'next';
import { Star, ExternalLink, ChevronRight, Check, X as XIcon, ThumbsUp, ThumbsDown, ArrowRight, Sparkles, Cpu, Smartphone } from 'lucide-react';
import { generateToolSchema } from '@/lib/seo';
import { sql } from '@/lib/db';
import EmbedBadge from '@/components/EmbedBadge';
import WriteReviewClient from '@/components/WriteReviewClient';
import ReviewHelpfulButton from '@/components/ReviewHelpfulButton';
import ScreenshotGallery from '@/components/ScreenshotGallery';
import ToolDetailTabs from '@/components/tools/ToolDetailTabs';
import BookmarkButton from '@/components/BookmarkButton';
import { ToolCTAButton } from '@/components/tools/ToolCTAButton';
import UpvoteButton from '@/components/tools/UpvoteButton';
import { getAiToolBySlugDirect, getSimilarToolsDirect, getToolTagsGroupedDirect, getToolProsConsDirect, getToolAlternativesDirect, getReviewResponsesDirect } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ToolSchema, FAQSchema } from '@/components/seo';
import { generateToolFAQs } from '@/lib/seo-utils';
import FAQSection from '@/components/FAQSection';
import SimilarTools from '@/components/tools/SimilarTools';
import SimilarToolsCarousel from '@/components/tools/SimilarToolsCarousel';
import TrackView from '@/components/TrackView';
import ShareMenu from '@/components/shared/ShareMenu';

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const { sql } = await import('@/lib/db');
    const rows = await sql`
      SELECT slug FROM "AiTool"
      WHERE status = 'APPROVED' AND "deletedAt" IS NULL
      ORDER BY "upvoteCount" DESC NULLS LAST
      LIMIT 200
    `;
    return rows.map((r: any) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

const getToolCached = cache((slug: string) => getAiToolBySlugDirect(slug));

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const tool = await getToolCached(params.slug) as any;
  if (!tool) return { title: 'Tool Not Found' };

  const title = `${tool.name} - ${tool.tagline} | Udyaibase`;
  const description = (tool.description || tool.tagline || '').slice(0, 155);
  const url = `https://udyaibase.com/tools/${tool.slug}`;

  // Use dynamic OG image (auto-generated from opengraph-image.tsx)
  const image = `${url}/opengraph-image`;

  return {
    title,
    description,
    keywords: [
      tool.name,
      tool.tagline,
      'AI tool',
      tool.categoryName || tool.category,
      tool.pricingModel,
      'artificial intelligence',
      'machine learning',
      'AI software'
    ].filter(Boolean).join(', '),
    creator: tool.name,
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
        alt: `${tool.name} - ${tool.tagline}`
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

function getEmbedUrl(url: string): string {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  // Loom
  const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
  // Fallback: return as-is (user might have pasted embed URL directly)
  return url;
}

export default async function ToolDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const tool = await getToolCached(params.slug) as any;

  if (!tool) {
    try {
      const redirectCheck = await sql`
        SELECT slug FROM "AiTool"
        WHERE ${params.slug} = ANY("previousSlugs") AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (redirectCheck.length > 0) {
        const { redirect } = await import('next/navigation');
        redirect(`/tools/${(redirectCheck[0] as any).slug}`);
      }
    } catch (e: any) {
      if (e?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    }
    notFound();
  }

  const stories = tool.stories || [];
  const userReviews = tool.userReviews || [];

  // Fetch all supplementary data in parallel
  const [similarTools, toolTags, prosConsData, toolAlternatives, reviewResponses] = await Promise.all([
    tool.categoryId ? getSimilarToolsDirect(tool.categoryId, tool.slug, 8) : Promise.resolve([]),
    getToolTagsGroupedDirect(tool.id),
    getToolProsConsDirect(tool.id),
    getToolAlternativesDirect(tool.id),
    getReviewResponsesDirect(tool.id),
  ]);

  const toolPros = (prosConsData.pros as any[]) || [];
  const toolCons = (prosConsData.cons as any[]) || [];

  // Generate FAQs with tool-specific data
  const faqs = generateToolFAQs(tool);

  const jsonLd = generateToolSchema({
    name: tool.name,
    description: tool.description || '',
    url: tool.websiteUrl,
    rating: tool.avgRating || 0,
    reviewCount: userReviews.length,
    category: tool.categoryName || tool.category || '',
    pricing: tool.pricingModel || '',
  });

  const pricingLabel: Record<string, string> = {
    FREE: 'Free', FREEMIUM: 'Freemium', PAID: 'Paid',
    OPEN_SOURCE: 'Open Source', ENTERPRISE: 'Enterprise', SUBSCRIPTION: 'Subscription',
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <ToolSchema tool={tool} />
      <TrackView entityType="tool" entityId={tool.id} categoryId={tool.categoryId} />

      {/* FAQ Schema (separate) */}
      <FAQSchema faqs={faqs} />

      {/* Legacy schema for backward compatibility */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/tools" className="hover:text-brand">Tools</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">{tool.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-row items-center gap-3 sm:gap-6">
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-white dark:bg-gray-800 shrink-0 overflow-hidden shadow-md ring-2 ring-white dark:ring-gray-700 border border-gray-100 dark:border-gray-700/50">
            <Image
              src={tool.logoUrl || `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${tool.websiteUrl}&size=128`}
              alt={tool.name}
              width={80}
              height={80}
              sizes="80px"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-sora font-extrabold text-xl sm:text-3xl text-navy dark:text-white">{tool.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 font-jakarta text-xs sm:text-base mt-0.5 sm:mt-1">{tool.tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-3">
          {tool.avgRating != null && (
            <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/30 px-2.5 py-1 rounded-full">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span className="font-bold text-yellow-700 dark:text-yellow-400">{Number(tool.avgRating).toFixed(1)}</span>
              {userReviews.length > 0 && <span className="text-xs text-gray-400 ml-1">({userReviews.length} reviews)</span>}
            </div>
          )}
          {(tool.upvoteCount || 0) >= 5 && (
            <span className="text-xs font-bold bg-brand/10 text-brand px-2.5 py-1 rounded-full">
              {tool.upvoteCount} upvotes
            </span>
          )}
          {tool.categoryName && <span className="badge-category">{tool.categoryName}</span>}
          {tool.pricingModel && (
            <span className="text-xs font-bold bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 px-2.5 py-1 rounded-full uppercase">
              {pricingLabel[tool.pricingModel] || tool.pricingModel}
            </span>
          )}
          {tool.hasApi && (
            <span className="flex items-center gap-1 text-xs font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full">
              <Cpu className="w-3 h-3" /> API
            </span>
          )}
          {tool.hasMobileApp && (
            <span className="flex items-center gap-1 text-xs font-bold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2.5 py-1 rounded-full">
              <Smartphone className="w-3 h-3" /> Mobile App
            </span>
          )}
          {tool.freeTrialDays && tool.freeTrialDays > 0 && (
            <span className="text-xs font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 px-2.5 py-1 rounded-full">
              {tool.freeTrialDays}-Day Free Trial
            </span>
          )}
          {tool.isUrlVerified && (
            <span className="flex items-center gap-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
              <Check className="w-3 h-3" /> Verified
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 mt-4">
          <ToolCTAButton
            toolId={tool.id}
            toolName={tool.name}
            source="TOOL_DETAIL"
            variant="primary"
            className="text-xs sm:text-sm !px-3 sm:!px-4 h-9 sm:h-auto"
          >
            Visit Site
          </ToolCTAButton>
          {tool.pricingUrl && (
            <a href={tool.pricingUrl} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs sm:text-sm !px-2.5 sm:!px-4 !py-0 sm:!py-2.5 h-9 sm:h-auto !min-h-0 sm:!min-h-[44px] !rounded-lg sm:!rounded-xl">
              Pricing <ExternalLink className="w-3 sm:w-3.5 h-3 sm:h-3.5 ml-0.5 sm:ml-1" />
            </a>
          )}
          {/* Mobile: icon-only, Desktop: full button */}
          <span className="sm:hidden">
            <BookmarkButton type="tool" itemId={tool.slug} itemName={tool.name} variant="icon" size="md" />
          </span>
          <span className="hidden sm:inline-flex">
            <BookmarkButton type="tool" itemId={tool.slug} itemName={tool.name} variant="button" size="md" />
          </span>
          <span className="sm:hidden">
            <UpvoteButton toolSlug={tool.slug} initialCount={tool.upvoteCount || 0} size="sm" />
          </span>
          <span className="hidden sm:inline-flex">
            <UpvoteButton toolSlug={tool.slug} initialCount={tool.upvoteCount || 0} size="md" />
          </span>
          <ShareMenu
            url={`https://udyaibase.com/tools/${tool.slug}`}
            title={`${tool.name} — ${tool.tagline || 'AI Tool'}`}
            utmCampaign="tool_share"
            variant="icon"
            entityType="TOOL"
            entityId={tool.id}
          />
        </div>
        {(tool.twitterUrl || tool.linkedinUrl || (Array.isArray(tool.socialLinks) && tool.socialLinks.length > 0)) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-gray-400 font-jakarta">Follow on:</span>
            {tool.twitterUrl && (
              <a href={tool.twitterUrl} target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center text-gray-900 dark:text-gray-100 hover:scale-105 hover:border-gray-900 dark:hover:border-gray-100 transition-all"
                title="Twitter / X"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            )}
            {tool.linkedinUrl && (
              <a href={tool.linkedinUrl} target="_blank" rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center text-[#0A66C2] hover:scale-105 hover:border-[#0A66C2] transition-all"
                title="LinkedIn"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            )}
            {Array.isArray(tool.socialLinks) && tool.socialLinks.map((link: any, idx: number) => {
              const platform = link.platform;
              const url = link.url;
              if (!url) return null;

              let icon = null;
              let hoverClass = "hover:border-brand";
              let colorClass = "text-gray-500";
              let label = platform;

              switch (platform) {
                case 'instagram':
                  label = 'Instagram';
                  colorClass = "text-[#E1306C]";
                  hoverClass = "hover:border-[#E1306C]";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  );
                  break;
                case 'github':
                  label = 'GitHub';
                  colorClass = "text-gray-900 dark:text-gray-100";
                  hoverClass = "hover:border-gray-900 dark:hover:border-gray-100";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                    </svg>
                  );
                  break;
                case 'youtube':
                  label = 'YouTube';
                  colorClass = "text-[#FF0000]";
                  hoverClass = "hover:border-[#FF0000]";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.53 3.5 12 3.5 12 3.5s-7.53 0-9.388.555A3.002 3.002 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.47 20.5 12 20.5 12 20.5s7.53 0 9.388-.555a3.002 3.002 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  );
                  break;
                case 'facebook':
                  label = 'Facebook';
                  colorClass = "text-[#1877F2]";
                  hoverClass = "hover:border-[#1877F2]";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  );
                  break;
                case 'producthunt':
                  label = 'Product Hunt';
                  colorClass = "text-[#DA552F]";
                  hoverClass = "hover:border-[#DA552F]";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 24c6.627 0 12-5.373 12-12S18.627 0 12 0 0 5.373 0 12s5.373 12 12 12zm-1-17h3.5c2.485 0 4.5 2.015 4.5 4.5S16.985 16 14.5 16H11v4H8V7h3zm3 6c.828 0 1.5-.672 1.5-1.5S14.828 10 14 10h-3v3h3z"/>
                    </svg>
                  );
                  break;
                case 'discord':
                  label = 'Discord';
                  colorClass = "text-[#5865F2]";
                  hoverClass = "hover:border-[#5865F2]";
                  icon = (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.094 13.094 0 0 1-1.873-.894.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.011c3.92 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.009c.12.099.246.195.373.289a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.156 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.156-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.156 2.418z"/>
                    </svg>
                  );
                  break;
                default:
                  return null;
              }

              return (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                  className={`w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-center ${colorClass} hover:scale-105 ${hoverClass} transition-all`}
                  title={label}
                >
                  {icon}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Content */}
        <div className="flex-1 space-y-8 min-w-0">

          {/* Overview */}
          <div className="card p-5 sm:p-6">
            <h2 className="section-title mb-4">Overview</h2>
            <p className="text-gray-600 dark:text-gray-300 font-jakarta text-sm sm:text-base leading-relaxed whitespace-pre-line">{tool.description}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              {tool.headquartersCountry && (
                <div><span className="text-xs text-gray-400 font-jakarta block">HQ</span><span className="font-sora font-bold text-sm text-navy dark:text-white">{tool.headquartersCountry}</span></div>
              )}
              {tool.founderNames?.length > 0 && (
                <div><span className="text-xs text-gray-400 font-jakarta block">Founders</span><span className="font-sora font-bold text-sm text-navy dark:text-white">{tool.founderNames.join(', ')}</span></div>
              )}
              {/* Website link hidden — redundant with Visit Site button above */}
              {tool.startingPrice && (
                <div><span className="text-xs text-gray-400 font-jakarta block">Starting Price</span><span className="font-sora font-bold text-sm text-navy dark:text-white">${(tool.startingPrice / 100).toFixed(tool.startingPrice % 100 === 0 ? 0 : 2)}/mo</span></div>
              )}
            </div>
          </div>

          {/* Demo Video */}
          {tool.demoVideoUrl && (
            <div className="card p-0 overflow-hidden">
              <div className="aspect-video">
                <iframe
                  src={getEmbedUrl(tool.demoVideoUrl)}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`${tool.name} Demo`}
                />
              </div>
            </div>
          )}

          {/* Screenshots */}
          {tool.screenshotUrls && tool.screenshotUrls.length > 0 && (
            <ScreenshotGallery screenshots={tool.screenshotUrls} toolName={tool.name} />
          )}

          {/* Key Features, Use Cases, Strengths & Limitations — Tabbed */}
          <ToolDetailTabs
            features={tool.keyFeatures || []}
            useCases={tool.useCases || []}
            pros={toolPros}
            cons={toolCons}
          />

          {/* Ideal Use Case + Not a Fit */}
          {(tool.idealUseCase || tool.notAFitFor) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tool.idealUseCase && (
                <div className="card p-5">
                  <h3 className="font-sora font-bold text-sm text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4" /> Ideal For
                  </h3>
                  <p className="text-sm font-jakarta text-gray-600 dark:text-gray-300 leading-relaxed">{tool.idealUseCase}</p>
                </div>
              )}
              {tool.notAFitFor && (
                <div className="card p-5">
                  <h3 className="font-sora font-bold text-sm text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                    <ThumbsDown className="w-4 h-4" /> Not a Fit For
                  </h3>
                  <p className="text-sm font-jakarta text-gray-600 dark:text-gray-300 leading-relaxed">{tool.notAFitFor}</p>
                </div>
              )}
            </div>
          )}

          {/* Tags & Capabilities */}
          {toolTags.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title mb-4">Tags & Capabilities</h2>
              <div className="space-y-4">
                {toolTags.map((group: any) => (
                  <div key={group.id}>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide font-jakarta mb-2">{group.name}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {group.tags.map((tag: any) => (
                        <Link
                          key={tag.id}
                          href={`/tools?tag=${tag.slug}`}
                          className="inline-flex items-center px-2.5 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-jakarta text-gray-600 dark:text-gray-400 hover:border-brand/30 hover:text-brand hover:bg-brand/5 transition-colors"
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alternatives */}
          {toolAlternatives.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="section-title mb-4">Alternatives to {tool.name}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {toolAlternatives.map((alt: any) => (
                  <Link
                    key={alt.id}
                    href={`/tools/${alt.slug}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-brand/30 hover:bg-brand/5 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                      {alt.logoUrl ? (
                        <Image src={alt.logoUrl} alt={alt.name} width={36} height={36} sizes="36px" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-brand">{alt.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy dark:text-white group-hover:text-brand transition-colors truncate">{alt.name}</p>
                      <p className="text-xs text-gray-400 font-jakarta truncate">{alt.tagline}</p>
                    </div>
                    {alt.avgRating > 0 && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{parseFloat(alt.avgRating).toFixed(1)}</span>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* User Reviews */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="section-title mb-0">User Reviews</h2>
              <WriteReviewClient toolSlug={tool.slug} toolName={tool.name} />
            </div>
            <div className="space-y-4">
              {userReviews.length > 0 ? userReviews.map((rev: any) => (
                <div key={rev.id} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center text-sm text-brand font-bold">
                        {rev.authorName?.charAt(0)?.toUpperCase() || 'A'}
                      </div>
                      <div>
                        <span className="font-sora font-bold text-sm text-navy dark:text-white">{rev.authorName || 'Anonymous'}</span>
                        <span className="text-xs text-gray-400 block font-jakarta">{new Date(rev.publishedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: rev.rating }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                      ))}
                    </div>
                  </div>
                  {rev.title && <h5 className="font-sora font-semibold text-sm mb-2">{rev.title}</h5>}
                  <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed mb-4">{rev.body}</p>
                  <div className="flex items-center justify-end border-t border-gray-100 dark:border-gray-800 pt-3">
                    <ReviewHelpfulButton reviewId={rev.id} toolSlug={tool.slug} initialCount={rev.helpfulCount || 0} />
                  </div>
                  {/* Founder Response */}
                  {reviewResponses[rev.id] && (
                    <div className="mt-3 ml-4 pl-4 border-l-2 border-brand/30 py-2">
                      <p className="text-xs font-semibold text-brand mb-1">
                        Founder Response — {reviewResponses[rev.id].founderName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed">
                        {reviewResponses[rev.id].body}
                      </p>
                    </div>
                  )}
                </div>
              )) : (
                <div className="card p-8 text-center text-gray-500 text-sm font-jakarta">
                  No verified reviews yet. Be the first to review {tool.name}!
                </div>
              )}
            </div>
          </div>

          {/* FAQ Section */}
          <FAQSection faqs={faqs} />
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-72 xl:w-80 shrink-0 space-y-6">
          {/* <EmbedBadge urlSlug={tool.slug} type="tools" /> */}

          {/* Built by Startup */}
          {tool.startupId && tool.startupName && (
            <Link href={`/startups/${tool.startupSlug || tool.startupId}`} className="card p-5 block hover:border-brand/30 transition-colors group">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider font-jakarta mb-3">Built by</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700">
                  {tool.startupLogoUrl ? (
                    <Image src={tool.startupLogoUrl} alt={tool.startupName} width={40} height={40} sizes="40px" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-brand">{tool.startupName.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <p className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors">{tool.startupName}</p>
                  {tool.totalFundingInr && Number(tool.totalFundingInr) > 0 && (() => {
                    const usd = Number(tool.totalFundingInr) / 83;
                    const display = usd >= 1e9 ? `$${(usd / 1e9).toFixed(1)}B` : usd >= 1e6 ? `$${(usd / 1e6).toFixed(1)}M` : usd >= 1e3 ? `$${(usd / 1e3).toFixed(0)}K` : `$${Math.round(usd)}`;
                    return <p className="text-xs text-gray-400 font-jakarta">{display} raised</p>;
                  })()}
                </div>
              </div>
            </Link>
          )}

          {/* Similar Tools in Same Category */}
          {similarTools.length > 0 && (
            <SimilarTools
              tools={similarTools}
              categoryName={tool.categoryName || 'this category'}
              categorySlug={tool.categorySlug}
            />
          )}

          {/* Founder Story */}
          {stories.length > 0 && (
            <div className="card p-5 bg-gradient-to-br from-brand-50 to-brand-100/30 dark:from-brand-900/20 dark:to-gray-800 border-brand-100 dark:border-brand-900/50">
              <h4 className="font-sora font-extrabold text-sm text-brand mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Founder Story
              </h4>
              <div className="space-y-4">
                {stories.map((story: any) => (
                  <Link key={story.id} href={`/news/${story.slug}`} className="block group">
                    <h5 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand leading-snug transition-colors">{story.title}</h5>
                    <p className="text-xs text-gray-500 font-jakarta mt-1 line-clamp-2">{story.excerpt}</p>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand mt-2 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">Read Story <ArrowRight className="w-3 h-3" /></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </aside>
      </div>

      {/* Similar Tools Carousel — full width below main content */}
      <SimilarToolsCarousel
        tools={similarTools as any[]}
        categoryName={tool.categoryName || undefined}
        categorySlug={tool.categorySlug || undefined}
      />
    </div>
  );
}
