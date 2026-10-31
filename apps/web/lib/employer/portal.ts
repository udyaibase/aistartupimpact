import { cache } from 'react';
import { prisma } from '@udyaibase/database';
import { isClaimVerified } from '@/lib/jobs/trust';

export interface EmployerShell {
  companyName: string;
  logoUrl: string | null;
  startupName: string | null;
  /** Public startup profile path, once the profile is approved. */
  startupProfilePath: string | null;
  claimVerified: boolean;
  /** Linked to a startup but the link predates domain verification. */
  claimLegacy: boolean;
  emailVerified: boolean;
  newCandidates: number;
  /** Who is signed in (filled in by the layout from the session). */
  role?: 'OWNER' | 'RECRUITER' | 'INTERVIEWER';
  /** Interviewer limited to specific jobs. */
  jobScoped?: boolean;
  /** The same person can switch to the founder portal without signing in again. */
  founderPortal?: boolean;
  viewerName?: string | null;
  viewerEmail?: string;
}

/** Candidates nobody has opened yet, on this employer's live (non-deleted) jobs. */
function newCandidatesWhere(employerId: string, jobIds: string[] | null = null) {
  return {
    status: 'APPLIED' as const,
    withdrawnAt: null,
    Listing: { employerId, deletedAt: null, ...(jobIds ? { id: { in: jobIds } } : {}) },
  };
}

/** Data the sidebar, header and mobile nav need on every portal page. Cached per request. */
/** `jobKey`: comma-joined job ids for an interviewer limited to some jobs (a string so `cache` can key on it). */
export const getEmployerShell = cache(async (employerId: string, jobKey = ''): Promise<EmployerShell | null> => {
  const [employer, newCandidates] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({
      where: { id: employerId },
      select: {
        companyName: true,
        logoUrl: true,
        emailVerified: true,
        startupId: true,
        startupClaimMethod: true,
        Startup: { select: { name: true, logoUrl: true, slug: true, isApproved: true } },
      },
    }),
    prisma.jobBoardApplication.count({ where: newCandidatesWhere(employerId, jobKey ? jobKey.split(',') : null) }),
  ]);
  if (!employer) return null;

  const verified = !!employer.Startup && isClaimVerified(employer);
  return {
    companyName: verified ? employer.Startup!.name : employer.companyName,
    logoUrl: (verified ? employer.Startup!.logoUrl : null) ?? employer.logoUrl,
    startupName: employer.Startup?.name ?? null,
    startupProfilePath: verified && employer.Startup!.isApproved ? `/startups/${employer.Startup!.slug}` : null,
    claimVerified: verified,
    claimLegacy: !!employer.Startup && !verified,
    emailVerified: employer.emailVerified,
    newCandidates,
  };
});

export interface SetupStep {
  key: 'claim' | 'profile' | 'first_job' | 'verify_email' | 'careers';
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

export interface OpenRole {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  workType: string;
  status: 'OPEN' | 'PAUSED';
  views: number;
  expiresAt: Date | null;
  pipeline: { new: number; shortlisted: number; interview: number; offer: number };
}

export interface EmployerHome {
  setup: SetupStep[];
  stats: {
    applications30d: number;
    waiting: number;
    waitingOver5d: number;
    inInterview: number;
    /** Median hours from application to first stage change, last 90 days. Null with no data. */
    medianFirstReplyHours: number | null;
  };
  openRoles: OpenRole[];
  hasAnyJob: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

export async function getEmployerHome(employerId: string): Promise<EmployerHome> {
  const now = Date.now();
  const appsOf = { Listing: { employerId, deletedAt: null }, withdrawnAt: null };

  const [employer, widgetCount, jobCount, applications30d, waiting, waitingOver5d, inInterview, replies, roles] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({
      where: { id: employerId },
      select: {
        startupId: true, startupClaimMethod: true, emailVerified: true, firstJobPublishedAt: true,
        description: true, logoUrl: true, websiteUrl: true, location: true,
      },
    }),
    prisma.jobBoardCareersWidget.count({ where: { employerId, OR: [{ codeCopiedAt: { not: null } }, { markedInstalledAt: { not: null } }, { firstSeenAt: { not: null } }] } }),
    prisma.jobBoardListing.count({ where: { employerId, deletedAt: null } }),
    prisma.jobBoardApplication.count({ where: { ...appsOf, appliedAt: { gte: new Date(now - 30 * DAY) } } }),
    prisma.jobBoardApplication.count({ where: newCandidatesWhere(employerId) }),
    prisma.jobBoardApplication.count({ where: { ...newCandidatesWhere(employerId), appliedAt: { lt: new Date(now - 5 * DAY) } } }),
    prisma.jobBoardApplication.count({ where: { ...appsOf, status: 'INTERVIEW' } }),
    prisma.jobBoardApplication.findMany({
      where: { ...appsOf, firstResponseAt: { not: null }, appliedAt: { gte: new Date(now - 90 * DAY) } },
      select: { appliedAt: true, firstResponseAt: true },
      take: 500,
    }),
    prisma.jobBoardListing.findMany({
      where: { employerId, deletedAt: null, status: { in: ['OPEN', 'PAUSED'] } },
      orderBy: [{ status: 'asc' }, { publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 10,
      select: { id: true, slug: true, title: true, location: true, workType: true, status: true, viewsCount: true, expiresAt: true },
    }),
  ]);

  const grouped = roles.length
    ? await prisma.jobBoardApplication.groupBy({
        by: ['listingId', 'status'],
        where: { listingId: { in: roles.map((r) => r.id) }, withdrawnAt: null },
        _count: { _all: true },
      })
    : [];
  const countFor = (listingId: string, statuses: string[]) =>
    grouped.filter((g) => g.listingId === listingId && statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);

  const hours = replies
    .map((r) => (r.firstResponseAt!.getTime() - r.appliedAt.getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  const median = hours.length
    ? hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2
    : null;

  const claimDone = !!employer && isClaimVerified(employer);
  const profileDone = !!employer && (claimDone
    ? true // the startup profile supplies logo, description and website
    : !!(employer.logoUrl && employer.description && employer.websiteUrl && employer.location));

  const setup: SetupStep[] = [
    { key: 'claim', label: 'Claim your startup', hint: 'Verify a work email so jobs carry your startup’s name and logo.', href: '/employer/company', done: claimDone },
    { key: 'profile', label: 'Complete your company profile', hint: 'Logo, short description, website and location.', href: '/employer/company', done: profileDone },
    { key: 'first_job', label: 'Post your first job', hint: 'Paste a job description and we’ll fill in the form.', href: '/employer/jobs/new', done: !!employer?.firstJobPublishedAt || roles.length > 0 },
    { key: 'verify_email', label: 'Verify your email', hint: 'Required before a job can go live.', href: '#verify-email', done: !!employer?.emailVerified },
    { key: 'careers', label: 'Add jobs to your website', hint: 'Paste one snippet; candidates apply from your own site.', href: '/employer/careers', done: widgetCount > 0 },
  ];

  return {
    setup,
    stats: { applications30d, waiting, waitingOver5d, inInterview, medianFirstReplyHours: median },
    openRoles: roles.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      location: r.location,
      workType: r.workType,
      status: r.status as 'OPEN' | 'PAUSED',
      views: r.viewsCount,
      expiresAt: r.expiresAt,
      pipeline: {
        new: countFor(r.id, ['APPLIED', 'REVIEWED']),
        shortlisted: countFor(r.id, ['SHORTLISTED']),
        interview: countFor(r.id, ['INTERVIEW']),
        offer: countFor(r.id, ['OFFER']),
      },
    })),
    hasAnyJob: jobCount > 0,
  };
}

/** Company context for the job composer: who the preview shows, and previous jobs to copy. */
/** `role` decides approval mode: recruiters' new jobs wait for an owner when the workspace turned that on. */
export async function getComposerContext(employerId: string, role: 'OWNER' | 'RECRUITER' | 'INTERVIEWER' = 'OWNER') {
  const [shell, employer, previous] = await Promise.all([
    getEmployerShell(employerId),
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { perks: true, requireJobApproval: true } }),
    prisma.jobBoardListing.findMany({
      where: { employerId, deletedAt: null, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true },
    }),
  ]);
  return {
    company: {
      name: shell?.companyName ?? '',
      logoUrl: shell?.logoUrl ?? null,
      verified: !!shell?.claimVerified,
      hasPerks: (employer?.perks?.length ?? 0) > 0,
    },
    emailVerified: shell?.emailVerified ?? false,
    previousJobs: previous,
    approval: { required: !!employer?.requireJobApproval && role === 'RECRUITER', canDecide: role === 'OWNER' },
  };
}
