import Link from 'next/link';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';
import FounderHiringClient from '@/components/founder/FounderHiringClient';
import HiringMemberships from '@/components/founder/HiringMemberships';
import { hiringMembershipsFor } from '@/lib/people/access';
import { ROLE_LABEL } from '@/lib/employer/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hiring' };

export default async function FounderHiringPage() {
  const session = await requireFounderAuth();
  const [startups, founder, workspaces, memberships] = await Promise.all([
    prisma.startup.findMany({
      where: { ownerId: session.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, logoUrl: true, websiteUrl: true, isVerified: true, isApproved: true, claimStatus: true },
    }),
    prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true, companyEmail: true, companyEmailVerified: true } }),
    prisma.jobBoardEmployer.findMany({
      where: { founderUserId: session.userId },
      select: { id: true, startupId: true, _count: { select: { Listings: { where: { status: 'OPEN', deletedAt: null } } } } },
    }),
    hiringMembershipsFor(session.email),
  ]);
  // Teams someone else invited this person to (their own workspaces open through "Open hiring" below).
  const invitedTo = memberships
    .filter((m) => !workspaces.some((w) => w.id === m.employerId))
    .map((m) => ({ memberId: m.id, startup: m.Employer.Startup?.name ?? m.Employer.companyName, roleLabel: ROLE_LABEL[m.role] }));

  // Per-workspace pipeline numbers, so a founder sees at a glance where candidates are waiting.
  const ids = workspaces.map((w) => w.id);
  const live = { withdrawnAt: null, NOT: { email: { endsWith: '@deleted.invalid' } } };
  const since30 = new Date(Date.now() - 30 * 864e5), older5 = new Date(Date.now() - 5 * 864e5);
  const [byStatus, waitingLong, recent] = ids.length ? await Promise.all([
    prisma.$queryRaw<{ employerId: string; status: string; n: number }[]>`
      SELECT l."employerId", a.status::text AS status, COUNT(*)::int AS n
      FROM "JobBoardApplication" a JOIN "JobBoardListing" l ON l.id = a."listingId"
      WHERE l."employerId" = ANY(${ids}) AND l."deletedAt" IS NULL AND a."withdrawnAt" IS NULL AND a.email NOT LIKE '%@deleted.invalid'
        AND a.status IN ('APPLIED', 'INTERVIEW')
      GROUP BY l."employerId", a.status`,
    prisma.jobBoardApplication.groupBy({ by: ['listingId'], where: { ...live, status: 'APPLIED', appliedAt: { lt: older5 }, Listing: { employerId: { in: ids }, deletedAt: null } }, _count: { _all: true } }),
    prisma.jobBoardApplication.groupBy({ by: ['listingId'], where: { ...live, appliedAt: { gte: since30 }, Listing: { employerId: { in: ids }, deletedAt: null } }, _count: { _all: true } }),
  ]) : [[], [], []];
  const listingOwner = ids.length && (waitingLong.length || recent.length)
    ? Object.fromEntries((await prisma.jobBoardListing.findMany({ where: { id: { in: [...waitingLong, ...recent].map((g) => g.listingId) } }, select: { id: true, employerId: true } })).map((l) => [l.id, l.employerId]))
    : {};
  const sumBy = (rows: { listingId: string; _count: { _all: number } }[], employerId: string) => rows.reduce((n, g) => n + (listingOwner[g.listingId] === employerId ? g._count._all : 0), 0);

  const hiring = Object.fromEntries(workspaces.filter((w) => w.startupId).map((w) => [w.startupId!, {
    openJobs: w._count.Listings,
    newCandidates: byStatus.find((r) => r.employerId === w.id && r.status === 'APPLIED')?.n ?? 0,
    interviewing: byStatus.find((r) => r.employerId === w.id && r.status === 'INTERVIEW')?.n ?? 0,
    waitingLong: sumBy(waitingLong, w.id),
    applied30d: sumBy(recent, w.id),
  }]));

  return (
    <div className="space-y-6 font-jakarta">
      <div>
        <h1 className="portal-title">Hiring</h1>
        <p className="portal-subtitle">
          Post jobs on Udyaibase AI Jobs and your startup profile, add them to your own website, and manage applicants in one place.
        </p>
      </div>

      {invitedTo.length > 0 && <HiringMemberships workspaces={invitedTo} />}

      {startups.length === 0 && invitedTo.length > 0 ? null : startups.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-6 text-center">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">Add your startup to start hiring</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Jobs are always posted under a verified startup, so candidates know they&apos;re real.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-2 mt-4">
            <Link href="/founder/startups/new" className="btn-brand">Add your startup</Link>
            <Link href="/startups" className="inline-flex items-center justify-center min-h-[44px] px-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">Find and claim an existing one</Link>
          </div>
        </div>
      ) : (
        <FounderHiringClient
          startups={startups.map((s) => ({ ...s, hiring: hiring[s.id] ?? null }))}
          suggestedEmail={founder?.companyEmailVerified ? founder.companyEmail ?? '' : founder?.email ?? ''}
        />
      )}
    </div>
  );
}
