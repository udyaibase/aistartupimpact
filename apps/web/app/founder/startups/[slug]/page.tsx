import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import StartupForm from '@/components/founder/StartupForm';
import SlugEditor from '@/components/shared/SlugEditor';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { StatusNote } from '@/components/founder/Guidance';
import PendingEditsNote from '@/components/founder/PendingEditsNote';
import { roleForOwner } from '@/lib/founder/access';
import { pendingEditsFor } from '@/lib/founder/listing-access';
import { canEditStartup } from '@/lib/founder-team-permissions';
interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EditStartupPage(props: PageProps) {
  const params = await props.params;
  const session = await requireFounderAuth();

  // Fetch startup with all fields including foundersData
  let startups;
  try {
    startups = await prisma.$queryRaw<any[]>`
      SELECT 
        id, name, slug, tagline, description, "websiteUrl", "logoUrl",
        stage, "totalFundingInr", "foundedYear",
        "linkedinUrl", "twitterUrl", "claimStatus", "isApproved", "isVerified",
        "headquartersCity", "employeeCount", founders, "foundersData", "socialLinks", status::text AS status, "ownerId", category, "businessType",
        "slugChangedAt"::text AS "slugChangedAt"
      FROM "Startup"
      WHERE slug = ${params.slug} AND "deletedAt" IS NULL
      LIMIT 1
    `;
  } catch (error: any) {
    startups = await prisma.$queryRaw<any[]>`
      SELECT 
        id, name, slug, tagline, description, "websiteUrl", "logoUrl",
        stage, "totalFundingInr", "foundedYear",
        "linkedinUrl", "twitterUrl", "claimStatus", "isApproved", "isVerified",
        "headquartersCity", "employeeCount", founders, "ownerId"
      FROM "Startup"
      WHERE slug = ${params.slug} AND "deletedAt" IS NULL
      LIMIT 1
    `;
  }

  const startup = startups[0];
  if (!startup) notFound();
  // Viewers see the listing but can't edit it. Anyone else has no access.
  const role = await roleForOwner(session, startup.ownerId);
  if (!role || !canEditStartup(role)) redirect('/founder/startups');
  const isOwner = role === 'OWNER';
  const pendingEdits = await pendingEditsFor('startup', startup.id);

  // Fetch funding rounds
  const fundingRounds = await sql`
    SELECT 
      id, "roundType", "amountInr", "amountUsd",
      "announcedAt"::text AS "announcedAt",
      "leadInvestors", "allInvestors"
    FROM "FundingRound"
    WHERE "startupId" = ${startup.id}
    ORDER BY "announcedAt" DESC
  `;

  // Fetch FAQs
  const faqs = await sql`
    SELECT id, "startupId", question, answer, "order"
    FROM "StartupFAQ"
    WHERE "startupId" = ${startup.id}
    ORDER BY "order" ASC
  `;

  const serializedStartup = {
    id: startup.id,
    name: startup.name,
    slug: startup.slug,
    tagline: startup.tagline,
    description: startup.description,
    websiteUrl: startup.websiteUrl,
    logoUrl: startup.logoUrl,
    stage: startup.stage,
    totalFundingInr: startup.totalFundingInr,
    foundedYear: startup.foundedYear,
    linkedinUrl: startup.linkedinUrl,
    twitterUrl: startup.twitterUrl,
    claimStatus: startup.claimStatus,
    isVerified: !!startup.isVerified,
    headquartersCity: startup.headquartersCity,
    employeeCount: startup.employeeCount,
    founders: startup.founders || [],
    foundersData: startup.foundersData || [],
    socialLinks: startup.socialLinks || [],
    status: startup.status || 'ACTIVE',
    category: startup.category || '',
    businessType: startup.businessType || '',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Edit Startup</h1>
        <p className="portal-subtitle">
          Keep your details up to date.
        </p>
      </div>

      <PendingEditsNote edits={pendingEdits} />

      {startup.claimStatus === 'PENDING' && (startup.isApproved ? (
        <StatusNote tone="waiting" title="Your latest edits are being reviewed">Your listing stays public while we check them. You can keep editing in the meantime.</StatusNote>
      ) : (
        <StatusNote tone="waiting" title="Waiting for review">Your startup isn’t public yet. We’ll email you once it’s live. You can keep editing in the meantime.</StatusNote>
      ))}
      {startup.claimStatus === 'REJECTED' && (
        <StatusNote tone="error" title="This startup wasn’t approved">
          We emailed you the reason. Fix what’s needed below and save to send it for another review. Not sure what to change? <Link href="/founder/support" className="underline font-semibold">Contact Support</Link>.
        </StatusNote>
      )}
      {(startup.claimStatus === 'CLAIMED' || startup.claimStatus === 'VERIFIED') && (
        <StatusNote
          tone="info"
          title="Your startup is live"
          action={isOwner && !startup.isVerified ? <Link href={`/founder/claim/${startup.id}`} className="text-sm font-semibold underline">Verify ownership</Link> : undefined}
        >
          {startup.isVerified
            ? 'Changes publish straight away. A new name, website or logo waits for our team first, and your listing keeps showing the current one.'
            : 'Our team reviews your changes first, and your listing keeps showing the current version. Verified startups can publish most changes straight away.'}
        </StatusNote>
      )}

      <StartupForm
        startup={serializedStartup}
        existingFaqs={faqs}
        existingFundingRounds={fundingRounds}
      />

      {/* Profile URL Editor — LinkedIn-style, 45-day cooldown */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-sora font-bold text-sm text-navy dark:text-white mb-4">Profile URL</h2>
        {isOwner && <SlugEditor
          currentSlug={startup.slug}
          slugChangedAt={startup.slugChangedAt}
          entityType="startup"
          entityId={startup.id}
          baseUrl="https://udyaibase.com/startups"
          isAdmin={false}
        />}
      </div>
    </div>
  );
}
