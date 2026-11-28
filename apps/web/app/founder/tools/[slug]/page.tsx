import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import ToolForm from '@/components/founder/ToolForm';
import SlugEditor from '@/components/shared/SlugEditor';
import Link from 'next/link';
import { StatusNote } from '@/components/founder/Guidance';
import { reviewStatusOf, reviewTimeline } from '@udyaibase/utils/startup-review';
import PendingEditsNote from '@/components/founder/PendingEditsNote';
import { roleForOwner } from '@/lib/founder/access';
import { pendingEditsFor } from '@/lib/founder/listing-access';
import { canEditStartup } from '@/lib/founder-team-permissions';
import ToolVerifyPanel from '@/components/founder/ToolVerifyPanel';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const metadata = { title: 'Edit AI tool' };

export default async function EditToolPage(props: PageProps) {
  const params = await props.params;
  const session = await requireFounderAuth();

  // Fetch tool using raw query to avoid serialization issues
  const tools = await prisma.$queryRaw<any[]>`
    SELECT 
      id, name, slug, tagline, description, "websiteUrl", "logoUrl",
      "pricingModel", "startingPrice", "pricingUrl", "affiliateUrl",
      "categoryId", status, "claimStatus", "ownerId",
      "hasApi", "hasMobileApp", "launchYear", "founderNames", "headquartersCountry", "headquartersCity",
      "screenshotUrls", "isUrlVerified", "reviewStatus", "reviewNote", "autoApproveAt", "autoApproveHeld",
      "twitterUrl", "linkedinUrl", "socialLinks",
      "demoVideoUrl", "freeTrialDays",
      "slugChangedAt"::text AS "slugChangedAt"
    FROM "AiTool"
    WHERE slug = ${params.slug} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  const tool = tools[0];
  // Whether it is public, and where our team's review stands. Separate from ownership: a verified tool can still be waiting.
  const isLive = tool?.status === 'APPROVED' || tool?.status === 'FEATURED';
  const review = tool ? reviewStatusOf({ isApproved: isLive, reviewStatus: tool.reviewStatus, claimStatus: tool.claimStatus }) : 'IN_REVIEW';

  // Check if tool exists
  if (!tool) {
    notFound();
  }

  // Viewers see the listing but can't edit it. Anyone else has no access.
  const role = await roleForOwner(session, tool.ownerId);
  if (!role || !canEditStartup(role)) redirect('/founder/tools');
  const isOwner = role === 'OWNER';
  const pendingEdits = await pendingEditsFor('tool', tool.id);

  // Fetch use cases separately
  const allUseCases = await prisma.$queryRaw<any[]>`
    SELECT id, text, type
    FROM "ToolUseCase"
    WHERE "toolId" = ${tool.id}
    ORDER BY id
  `;
  const useCases = allUseCases.filter((uc: any) => uc.type !== 'feature');
  const keyFeatures = allUseCases.filter((uc: any) => uc.type === 'feature');

  // Fetch FAQs separately
  const faqs = await prisma.$queryRaw<any[]>`
    SELECT id, question, answer, "order"
    FROM "ToolFAQ"
    WHERE "toolId" = ${tool.id}
    ORDER BY "order" ASC
  `;

  // Fetch pros and cons separately
  const pros = await prisma.$queryRaw<any[]>`
    SELECT id, text FROM "ToolPro" WHERE "toolId" = ${tool.id}
  `;
  const cons = await prisma.$queryRaw<any[]>`
    SELECT id, text FROM "ToolCon" WHERE "toolId" = ${tool.id}
  `;

  // Serialize the tool data for client component
  const serializedTool = {
    id: tool.id,
    name: tool.name,
    slug: tool.slug,
    tagline: tool.tagline,
    description: tool.description,
    websiteUrl: tool.websiteUrl,
    logoUrl: tool.logoUrl,
    pricingModel: tool.pricingModel,
    pricingUrl: tool.pricingUrl,
    affiliateUrl: tool.affiliateUrl,
    startingPrice: tool.startingPrice,
    categoryId: tool.categoryId,
    status: tool.status,
    claimStatus: tool.claimStatus,
    isUrlVerified: !!tool.isUrlVerified,
    hasApi: tool.hasApi,
    hasMobileApp: tool.hasMobileApp,
    launchYear: tool.launchYear,
    founderNames: tool.founderNames,
    headquartersCountry: tool.headquartersCountry,
    headquartersCity: tool.headquartersCity,
    screenshotUrls: tool.screenshotUrls,
    twitterUrl: tool.twitterUrl,
    linkedinUrl: tool.linkedinUrl,
    socialLinks: tool.socialLinks,
    demoVideoUrl: tool.demoVideoUrl,
    freeTrialDays: tool.freeTrialDays,
    useCases: useCases.map(uc => ({
      id: uc.id,
      text: uc.text,
    })),
    keyFeatures: keyFeatures.map(f => ({
      id: f.id,
      text: f.text,
    })),
    faqs: faqs.map(faq => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    })),
    pros: pros.map(p => p.text),
    cons: cons.map(c => c.text),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title">
          Edit Tool
        </h1>
        <p className="portal-subtitle">
          Keep your tool’s details up to date.
        </p>
      </div>

      {/* Status Badge */}
      <PendingEditsNote edits={pendingEdits} />

      {!isLive && <ReviewTimeline tool={tool} isLive={isLive} />}

      {review === 'IN_REVIEW' && tool.autoApproveAt && !tool.autoApproveHeld && (
        <StatusNote tone="info" title="You qualify for fast approval">
          You’ve proven you own this tool’s website and it passed our automatic checks, so it should go live within about {Math.max(5, Math.ceil((new Date(tool.autoApproveAt).getTime() - Date.now()) / 60_000 / 5) * 5)} minutes. We’ll email you the moment it does.
        </StatusNote>
      )}
      {review === 'IN_REVIEW' && !(tool.autoApproveAt && !tool.autoApproveHeld) && (
        <StatusNote tone="waiting" title="Waiting for review">
          {tool.isUrlVerified ? 'You’ve proven you own this tool’s website, so it is at the front of the queue. ' : ''}Our team reviews every new tool before it appears, usually within 2 working days. It isn’t public yet, and we’ll email you once it’s live. You can keep editing in the meantime.
        </StatusNote>
      )}
      {(review === 'CHANGES_REQUESTED' || review === 'REJECTED' || review === 'TAKEN_DOWN') && (
        <StatusNote tone="error" title={review === 'CHANGES_REQUESTED' ? 'A few changes are needed' : review === 'TAKEN_DOWN' ? 'This tool was taken down' : 'This tool wasn’t approved'}>
          {tool.reviewNote
            ? <><span className="block font-semibold">What our team said:</span><span className="block whitespace-pre-line">{tool.reviewNote}</span></>
            : 'We emailed you the reason.'}
          <span className="block mt-2">Make the changes below and save: that sends it for another review. Not sure what to change? <Link href="/founder/support" className="underline font-semibold">Contact Support</Link>.</span>
        </StatusNote>
      )}

      {isLive && (
        <StatusNote tone="success" title="Your tool is live">
          {tool.isUrlVerified
            ? 'Changes publish straight away. A new name, website or logo waits for our team first, and your listing keeps showing the current one.'
            : 'Our team reviews your changes first, and your listing keeps showing the current version. Verified tools can publish most changes straight away.'}
        </StatusNote>
      )}

      {isOwner && (isLive || review === 'IN_REVIEW') && !tool.isUrlVerified && <ToolVerifyPanel toolId={tool.id} />}

      {tool.isUrlVerified && isLive && (
        <StatusNote tone="success" title="Domain verified">Your tool has the Verified badge.</StatusNote>
      )}

      {/* Form */}
      <ToolForm tool={serializedTool} />

      {/* Profile URL Editor */}
      {isOwner && <SlugEditor
        currentSlug={tool.slug}
        slugChangedAt={tool.slugChangedAt || null}
        entityType="tool"
        entityId={tool.id}
        baseUrl="https://udyaibase.com/tools"
        isAdmin={false}
      />}
    </div>
  );
}

/** Submitted → Ownership verified → In review → Live, with where this tool is now. */
function ReviewTimeline({ tool, isLive }: { tool: { isUrlVerified?: boolean; reviewStatus?: string | null; claimStatus?: string | null }; isLive: boolean }) {
  const { steps } = reviewTimeline({ isApproved: isLive, isVerified: !!tool.isUrlVerified, reviewStatus: tool.reviewStatus, claimStatus: tool.claimStatus });
  const dot = { done: 'bg-emerald-500 border-emerald-500', current: 'bg-brand border-brand', stopped: 'bg-red-500 border-red-500', todo: 'bg-transparent border-gray-300 dark:border-gray-600', optional: 'bg-transparent border-gray-300 dark:border-gray-600' } as const;
  const text = { done: 'text-gray-900 dark:text-gray-100', current: 'text-brand font-semibold', stopped: 'text-red-600 dark:text-red-400 font-semibold', todo: 'text-gray-500 dark:text-gray-400', optional: 'text-gray-500 dark:text-gray-400' } as const;
  return (
    <ol aria-label="Where your listing stands" className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-jakarta">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={s.state === 'current' || s.state === 'stopped' ? 'step' : undefined}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full border-2 ${dot[s.state]}`} aria-hidden />
          <span className={text[s.state]}>
            {s.label}
            {s.state === 'optional' ? ' (optional, speeds up review)' : ''}
            <span className="sr-only">{s.state === 'done' ? ': done' : s.state === 'current' ? ': now' : s.state === 'stopped' ? ': needs your attention' : ': not yet'}</span>
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-gray-300 dark:bg-gray-600" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
