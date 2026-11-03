import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import ToolEditForm from '@/components/founder/ToolEditForm';
import SlugEditor from '@/components/shared/SlugEditor';

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
    WHERE slug = ${params.slug}
    LIMIT 1
  `;

  const tool = tools[0];

  // Check if tool exists
  if (!tool) {
    notFound();
  }

  // Check if user owns this tool
  if (tool.ownerId !== session.userId) {
    redirect('/founder/tools');
  }

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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Edit Tool
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Update your tool information. Changes will be reviewed by our team before going live.
        </p>
      </div>

      {/* Status Badge */}
      {tool.claimStatus === 'PENDING' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-400">
            ⏳ This tool is currently under review. You can still make changes.
          </p>
        </div>
      )}

      {tool.claimStatus === 'REJECTED' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-400">
            ❌ This tool was rejected. Please review the feedback and resubmit.
          </p>
        </div>
      )}

      {tool.claimStatus === 'CLAIMED' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-800 dark:text-green-400">
            ✅ This tool is live. You can edit anytime without needing re-approval.
          </p>
        </div>
      )}

      {/* Domain Verification CTA */}
      {(tool.claimStatus === 'CLAIMED' || tool.claimStatus === 'VERIFIED') && !tool.isUrlVerified && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Verify your domain</p>
              <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-1">
                Add a DNS TXT record to prove you own this tool. Verified tools get a badge and higher visibility.
              </p>
            </div>
            <a
              href={`/api/founder/tools/${tool.id}/verify`}
              target="_blank"
              className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Instructions
            </a>
          </div>
        </div>
      )}

      {tool.isUrlVerified && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <p className="text-sm text-emerald-800 dark:text-emerald-400">
            ✓ Domain verified. Your tool has the Verified badge.
          </p>
        </div>
      )}

      {/* Form */}
      <ToolEditForm tool={serializedTool} />

      {/* Profile URL Editor */}
      <SlugEditor
        currentSlug={tool.slug}
        slugChangedAt={tool.slugChangedAt || null}
        entityType="tool"
        entityId={tool.id}
        baseUrl="https://udyaibase.com/tools"
        isAdmin={false}
      />
    </div>
  );
}
