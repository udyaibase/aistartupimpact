import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import ClaimStartupClient from '@/components/founder/ClaimStartupClient';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  /** ?method=email|dns opens that verification method (reminder emails link here). */
  searchParams: Promise<{ method?: string }>;
}

export const metadata = { title: 'Claim your startup' };

export default async function ClaimStartupPage(props: PageProps) {
  const params = await props.params;
  const { method } = await props.searchParams;
  // Require authentication
  const session = await requireFounderAuth();

  // Fetch startup using raw query
  const startups = await prisma.$queryRaw<any[]>`
    SELECT 
      id, name, slug, tagline, "websiteUrl", "logoUrl", "claimStatus", "ownerId", "isVerified", "verificationMethod", "verifiedEmail"
    FROM "Startup"
    WHERE id = ${params.id} AND "deletedAt" IS NULL
    LIMIT 1
  `;

  const startup = startups[0];

  // Check if startup exists
  if (!startup) {
    notFound();
  }

  // Already proven by another founder. Until then, whoever proves the domain becomes the owner.
  // Exceptions, both by DNS only: taking over a startup verified by someone's work email, or one whose DNS
  // verification no longer holds (the verify step checks the current owner's record is gone, e.g. a sold domain).
  const takeover: false | 'email' | 'dns' = startup.isVerified && startup.ownerId !== session.userId
    ? (startup.verificationMethod === 'EMAIL' ? 'email' : startup.verificationMethod === 'DNS' ? 'dns' : false)
    : false;
  if (startup.isVerified && startup.ownerId !== session.userId && !takeover) {
    redirect('/founder/dashboard');
  }

  // Allow owner to access verification page even if already claimed
  // This is needed for DNS verification after admin approval

  const isOwner = startup.ownerId === session.userId;
  return (
    <ClaimStartupClient
      startup={startup}
      startupId={params.id}
      takeover={takeover}
      initialMethod={method === 'email' || method === 'dns' ? method : undefined}
      workEmailHint={isOwner ? startup.verifiedEmail ?? null : null}
    />
  );
}
