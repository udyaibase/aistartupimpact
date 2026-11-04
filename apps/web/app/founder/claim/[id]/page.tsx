import { requireFounderAuth } from '@/lib/founder-auth';
import { prisma } from '@udyaibase/database';
import { notFound, redirect } from 'next/navigation';
import ClaimStartupClient from '@/components/founder/ClaimStartupClient';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ClaimStartupPage(props: PageProps) {
  const params = await props.params;
  // Require authentication
  const session = await requireFounderAuth();

  // Fetch startup using raw query
  const startups = await prisma.$queryRaw<any[]>`
    SELECT 
      id, name, slug, tagline, "websiteUrl", "logoUrl", "claimStatus", "ownerId", "isVerified"
    FROM "Startup"
    WHERE id = ${params.id}
    LIMIT 1
  `;

  const startup = startups[0];

  // Check if startup exists
  if (!startup) {
    notFound();
  }

  // Already proven by another founder. Until then, whoever proves the domain becomes the owner.
  if (startup.isVerified && startup.ownerId !== session.userId) {
    redirect('/founder/dashboard');
  }

  // Allow owner to access verification page even if already claimed
  // This is needed for DNS verification after admin approval

  return <ClaimStartupClient startup={startup} startupId={params.id} />;
}
