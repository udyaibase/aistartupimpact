import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import ToolForm from '@/components/founder/ToolForm';
import SlugEditor from '@/components/shared/SlugEditor';
import Link from 'next/link';
import { StatusNote } from '@/components/founder/Guidance';
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
      "screenshotUrls", "isUrlVerified",
      "twitterUrl", "linkedinUrl", "socialLinks",
      "demoVideoUrl", "freeTrialDays",
      "slugChangedAt"::text AS "slugChangedAt"
    FROM "AiTool"
    WHERE slug = ${params.slug} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  const tool = tools[0];

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

      {tool.claimStatus === 'PENDING' && (
        <StatusNote tone="waiting" title="Waiting for review">Your tool isn’t public yet. We’ll email you once it’s live. You can keep editing in the meantime.</StatusNote>
      )}

      {tool.claimStatus === 'REJECTED' && (
        <StatusNote tone="error" title="This tool wasn’t approved">
          We emailed you the reason. Fix what’s needed below and save to send it for another review. Not sure what to change? <Link href="/founder/support" className="underline font-semibold">Contact Support</Link>.
        </StatusNote>
      )}

      {tool.claimStatus === 'CLAIMED' && (
        <StatusNote tone="success" title="Your tool is live">
          {tool.isUrlVerified
            ? 'Changes publish straight away. A new name, website or logo waits for our team first, and your listing keeps showing the current one.'
            : 'Our team reviews your changes first, and your listing keeps showing the current version. Verified tools can publish most changes straight away.'}
        </StatusNote>
      )}

      {isOwner && (tool.claimStatus === 'CLAIMED' || tool.claimStatus === 'VERIFIED') && !tool.isUrlVerified && <ToolVerifyPanel toolId={tool.id} />}

      {tool.isUrlVerified && (
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
