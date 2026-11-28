import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import StartupForm from '@/components/founder/StartupForm';
import OwnershipTransferCard from '@/components/founder/OwnershipTransferCard';
import { getPendingTransferAction } from '@/app/founder/startups/transfer-actions';
import SlugEditor from '@/components/shared/SlugEditor';
import { sql } from '@/lib/db';
import Link from 'next/link';
import { StatusNote } from '@/components/founder/Guidance';
import { reviewStatusOf, reviewTimeline } from '@udyaibase/utils/startup-review';
import PendingEditsNote from '@/components/founder/PendingEditsNote';
import { roleForOwner } from '@/lib/founder/access';
import { pendingEditsFor } from '@/lib/founder/listing-access';
import { canEditStartup } from '@/lib/founder-team-permissions';
interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const metadata = { title: 'Edit startup' };

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
        "reviewStatus", "reviewNote", "aiUseCase", "autoApproveAt", "autoApproveHeld",
        "headquartersCity", "employeeCount", founders, "foundersData", "socialLinks", status::text AS status, "ownerId", category, "businessType", "contactEmail",
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
  // Where our team's review stands. Separate from ownership: a verified startup can still be waiting.
  const review = startup ? reviewStatusOf(startup) : 'IN_REVIEW';
  if (!startup) notFound();
  // Viewers see the listing but can't edit it. Anyone else has no access.
  const role = await roleForOwner(session, startup.ownerId);
  if (!role || !canEditStartup(role)) redirect('/founder/startups');
  const isOwner = role === 'OWNER';
  const pendingEdits = await pendingEditsFor('startup', startup.id);
  const pendingTransfer = isOwner ? await getPendingTransferAction(startup.id) : null;

  // Fetch funding rounds
  const fundingRounds = await sql`
    SELECT 
      id, "roundType", "amountInr", "amountUsd", to_jsonb("FundingRound") ->> 'fxDerived' AS "fxDerived",
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

      {!startup.isApproved && <ReviewTimeline startup={startup} />}

      {startup.isApproved && startup.claimStatus === 'PENDING' && (
        <StatusNote tone="waiting" title="Your latest edits are being reviewed">Your listing stays public while we check them. You can keep editing in the meantime.</StatusNote>
      )}
      {review === 'IN_REVIEW' && startup.autoApproveAt && !startup.autoApproveHeld && (
        <StatusNote tone="info" title="You qualify for fast approval">
          You’ve proven you own this startup and it passed our automatic checks, so it should go live within about {Math.max(5, Math.ceil((new Date(startup.autoApproveAt).getTime() - Date.now()) / 60_000 / 5) * 5)} minutes. We’ll email you the moment it does. Our team still looks at every listing afterwards.
        </StatusNote>
      )}
      {review === 'IN_REVIEW' && !(startup.autoApproveAt && !startup.autoApproveHeld) && (
        <StatusNote tone="waiting" title="Waiting for review">
          {startup.isVerified ? 'You’ve proven you own this startup, so it is at the front of the queue. ' : ''}Our team reviews every new listing before it appears, usually within 2 working days. It isn’t public yet, and we’ll email you once it’s live. You can keep editing in the meantime.
        </StatusNote>
      )}
      {(review === 'CHANGES_REQUESTED' || review === 'REJECTED' || review === 'TAKEN_DOWN') && (
        <StatusNote tone="error" title={review === 'CHANGES_REQUESTED' ? 'A few changes are needed' : review === 'TAKEN_DOWN' ? 'This startup was taken down' : 'This startup wasn’t approved'}>
          {startup.reviewNote
            ? <><span className="block font-semibold">What our team said:</span><span className="block whitespace-pre-line">{startup.reviewNote}</span></>
            : 'We emailed you the reason.'}
          <span className="block mt-2">Make the changes below and save: that sends it for another review. Not sure what to change? <Link href="/founder/support" className="underline font-semibold">Contact Support</Link>.</span>
        </StatusNote>
      )}
      {startup.isApproved && (startup.claimStatus === 'CLAIMED' || startup.claimStatus === 'VERIFIED') && (
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

      {isOwner && <OwnershipTransferCard startupId={startup.id} startupName={startup.name} pending={pendingTransfer} />}

      {/* Profile URL Editor — LinkedIn-style, 45-day cooldown */}
      <div className="card -mx-4 sm:mx-0 rounded-none sm:rounded-[14px] border-x-0 sm:border-x px-4 py-5 sm:p-6">
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

/** Submitted → Ownership verified → In review → Live, with where this startup is now. */
function ReviewTimeline({ startup }: { startup: { isApproved?: boolean; isVerified?: boolean; reviewStatus?: string | null; claimStatus?: string | null } }) {
  const { steps } = reviewTimeline(startup);
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
