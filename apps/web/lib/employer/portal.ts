import { cache } from 'react';
import { IN_PIPELINE } from '@/lib/employer/stages';
import { prisma } from '@udyaibase/database';
import { canPublish, isClaimVerified, isCompanyVerified, REVIEWED_MAX_LIVE } from '@/lib/jobs/trust';
import { reviewCounts, unseenWhere } from '@/lib/employer/counts';

export interface EmployerShell {
  companyName: string;
  logoUrl: string | null;
  startupName: string | null;
  /** Public startup profile path, once the profile is approved. */
  startupProfilePath: string | null;
  claimVerified: boolean;
  /** Counts as a verified company for hiring: verified startup with a proven link, or verified by an admin. */
  companyVerified: boolean;
  /** Linked to a startup but the link predates domain verification. */
  claimLegacy: boolean;
  emailVerified: boolean;
  /** Applications nobody on the team has opened yet ("unseen"; see lib/employer/counts.ts). */
  newCandidates: number;
  /** Who is signed in (filled in by the layout from the session). */
  role?: 'OWNER' | 'RECRUITER' | 'INTERVIEWER';
  /** Interviewer limited to specific jobs. */
  jobScoped?: boolean;
  /** The same person can switch to the founder portal without signing in again. */
  founderPortal?: boolean;
  viewerName?: string | null;
  viewerEmail?: string;
  /** Other hiring teams this person can switch to without signing in again. */
  otherWorkspaces?: { employerId: string; companyName: string; role: 'OWNER' | 'RECRUITER' | 'INTERVIEWER' }[];
}

/** Candidates nobody has opened yet, on this employer's live (non-deleted) jobs. */
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
        isVerified: true,
        startupId: true,
        startupClaimMethod: true,
        Startup: { select: { name: true, logoUrl: true, slug: true, isApproved: true, isVerified: true } },
      },
    }),
    prisma.jobBoardApplication.count({ where: unseenWhere(employerId, jobKey ? jobKey.split(',') : null) }),
  ]);
  if (!employer) return null;

  const verified = !!employer.Startup && isClaimVerified(employer);
  return {
    companyName: verified ? employer.Startup!.name : employer.companyName,
    logoUrl: (verified ? employer.Startup!.logoUrl : null) ?? employer.logoUrl,
    startupName: employer.Startup?.name ?? null,
    startupProfilePath: verified && employer.Startup!.isApproved ? `/startups/${employer.Startup!.slug}` : null,
    claimVerified: verified,
    companyVerified: isCompanyVerified(employer),
    // "Re-verify" is for a startup link that was never proven, unless an admin has verified the employer anyway.
    claimLegacy: !!employer.Startup && !verified && !employer.isVerified,
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
  pipeline: { new: number; shortlisted: number; assessment: number; interview: number; decision: number; offer: number };
}

export interface EmployerHome {
  setup: SetupStep[];
  stats: {
    applications30d: number;
    /** See lib/employer/counts.ts for what each of these three means. */
    unseen: number;
    toReview: number;
    overdue: number;
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
  const appsOf = { Listing: { employerId, deletedAt: null }, withdrawnAt: null, ...IN_PIPELINE };

  const [employer, widgetCount, jobCount, applications30d, review, inInterview, replies, roles] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({
      where: { id: employerId },
      select: {
        startupId: true, startupClaimMethod: true, emailVerified: true, firstJobPublishedAt: true,
        description: true, logoUrl: true, websiteUrl: true, location: true,
        isVerified: true, companyReview: true, Startup: { select: { isVerified: true } },
      },
    }),
    prisma.jobBoardCareersWidget.count({ where: { employerId, OR: [{ codeCopiedAt: { not: null } }, { markedInstalledAt: { not: null } }, { firstSeenAt: { not: null } }] } }),
    prisma.jobBoardListing.count({ where: { employerId, deletedAt: null, isGeneral: false } }),
    prisma.jobBoardApplication.count({ where: { ...appsOf, appliedAt: { gte: new Date(now - 30 * DAY) } } }),
    reviewCounts(employerId, null, now),
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
        where: { listingId: { in: roles.map((r) => r.id) }, withdrawnAt: null, ...IN_PIPELINE },
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

  const claimDone = !!employer && isCompanyVerified(employer);
  const hasLiveJob = roles.some((r) => r.status === 'OPEN');
  // One sentence per situation, so the step never promises "then your jobs can go live" to a company whose jobs are live.
  const claimHint = employer?.companyReview === 'APPROVED'
    ? `Your company passed our check, so up to ${REVIEWED_MAX_LIVE} jobs can be live. Once your founder verifies the startup, the limit goes and your jobs show the Verified tick.`
    : hasLiveJob
      ? 'Your live jobs stay live. New jobs wait until the startup is verified: only its founder can do that, from the link on your Company page.'
      : 'Only its founder can verify it on Udyaibase. Send them the link from your Company page; then your jobs can go live.';
  const profileDone = !!employer && (isClaimVerified(employer)
    ? true // the startup profile supplies logo, description and website
    : !!(employer.logoUrl && employer.description && employer.websiteUrl && employer.location));

  const setup: SetupStep[] = [
    { key: 'claim', label: 'Get your startup verified', hint: claimHint, href: '/employer/company', done: claimDone },
    { key: 'profile', label: 'Complete your company profile', hint: 'Logo, short description, website and location.', href: '/employer/company', done: profileDone },
    { key: 'first_job', label: 'Post your first job', hint: 'Paste a job description and we’ll fill in the form.', href: '/employer/jobs/new', done: !!employer?.firstJobPublishedAt || roles.length > 0 },
    { key: 'verify_email', label: 'Verify your email', hint: 'Required before a job can go live.', href: '#verify-email', done: !!employer?.emailVerified },
    { key: 'careers', label: 'Add jobs to your website', hint: 'Paste one snippet; candidates apply from your own site.', href: '/employer/careers', done: widgetCount > 0 },
  ];

  return {
    setup,
    stats: { applications30d, ...review, inInterview, medianFirstReplyHours: median },
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
        assessment: countFor(r.id, ['ASSESSMENT']),
        interview: countFor(r.id, ['INTERVIEW']),
        decision: countFor(r.id, ['DECISION']),
        offer: countFor(r.id, ['OFFER']),
      },
    })),
    hasAnyJob: jobCount > 0,
  };
}

/** Company context for the job composer: who the preview shows, and previous jobs to copy. */
/** `role` decides approval mode: recruiters' new jobs wait for an owner when the workspace turned that on. */
export async function getComposerContext(employerId: string, role: 'OWNER' | 'RECRUITER' | 'INTERVIEWER' = 'OWNER', memberEmail: string | null = null) {
  const [shell, employer, previous, used] = await Promise.all([
    getEmployerShell(employerId),
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { perks: true, requireJobApproval: true, ...CLEARANCE_SELECT } }),
    prisma.jobBoardListing.findMany({
      where: { employerId, deletedAt: null, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true },
    }),
    // Teams and custom categories this workspace has used before, offered in the dropdowns.
    prisma.jobBoardListing.findMany({
      where: { employerId, deletedAt: null, OR: [{ department: { not: null } }, { categoryLabel: { not: null } }] },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { department: true, categoryLabel: true },
    }),
  ]);
  const uniq = (xs: (string | null)[]) => Array.from(new Map(xs.filter((x): x is string => !!x?.trim()).map((x) => [x.trim().toLowerCase(), x.trim()])).values()).slice(0, 30);
  return {
    company: {
      name: shell?.companyName ?? '',
      logoUrl: shell?.logoUrl ?? null,
      verified: !!shell?.claimVerified || !!shell?.companyVerified,
      hasPerks: (employer?.perks?.length ?? 0) > 0,
      perks: employer?.perks ?? [],
      /** Perks are company-wide, so only owners can change them. */
      canEditPerks: role === 'OWNER',
    },
    emailVerified: shell?.emailVerified ?? false,
    previousJobs: previous,
    savedTeams: uniq(used.map((u) => u.department)),
    savedCategories: uniq(used.map((u) => u.categoryLabel)),
    approval: { required: !!employer?.requireJobApproval && role === 'RECRUITER', canDecide: role === 'OWNER' },
    clearance: employer ? clearanceOf(employer, memberEmail) : null,
  };
}

const CLEARANCE_SELECT = {
  emailVerified: true, isVerified: true, startupId: true, startupClaimMethod: true, websiteUrl: true, linkedinUrl: true, companyCin: true,
  companyReview: true, companyReviewNote: true, founderAskEmail: true, founderAskedAt: true,
  Startup: { select: { isVerified: true, name: true, slug: true } },
} as const;

export type ClearanceState = 'verified' | 'reviewed' | 'review_needed' | 'review_pending' | 'review_rejected' | 'founder';
export interface Clearance {
  state: ClearanceState; note: string | null; startupName: string | null; startupSlug: string | null; startupVerified: boolean;
  founderAskEmail: string | null; founderAskedAt: string | null; linkedinUrl: string | null; cin: string | null;
}

/** Where this workspace stands on putting jobs live (see canPublish), for the composer's banner and waiting screen. */
function clearanceOf(e: {
  emailVerified: boolean; isVerified: boolean; startupId: string | null; startupClaimMethod: string | null; websiteUrl: string | null; linkedinUrl: string | null; companyCin: string | null;
  companyReview: string | null; companyReviewNote: string | null; founderAskEmail: string | null; founderAskedAt: Date | null;
  Startup: { isVerified: boolean; name: string; slug: string } | null;
}, memberEmail: string | null): Clearance {
  // Email verification has its own banner, so judge the company as if the email were verified.
  const gate = canPublish({ ...e, emailVerified: true }, memberEmail);
  const state: ClearanceState = gate.ok ? gate.tier : gate.code === 'startup_unverified' || gate.code === 'email_unverified' ? 'founder' : gate.code;
  return {
    state, note: e.companyReviewNote, startupName: e.Startup?.name ?? null, startupSlug: e.Startup?.slug ?? null, startupVerified: !!e.Startup?.isVerified,
    founderAskEmail: e.founderAskEmail, founderAskedAt: e.founderAskedAt?.toISOString() ?? null, linkedinUrl: e.linkedinUrl, cin: e.companyCin,
  };
}
