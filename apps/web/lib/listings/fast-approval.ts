import { prisma } from '@udyaibase/database';
import {
  AUTO_APPROVE_KEY, AUTO_APPROVER, autoApproveEligible, domainParts, hostMatchesDomain, sanitizeAutoApprove, type AutoApproveFacts, type AutoApproveSettings,
} from '@udyaibase/utils/auto-approve';
import { toolProblems } from '@udyaibase/utils/tool-required';
import { calculateImpactScore } from '@/lib/impact-score';
import { sendApprovalEmail } from '@/lib/founder-email';
import { notifyFounder } from '@/lib/founder/notify';
import { refreshPublicListing } from '@/lib/founder/refresh-listing';
import { refreshSections } from '@/lib/revalidate';
import { runStartupAiCheck, runToolAiCheck } from '@/lib/startups/ai-check';

/**
 * Fast approval, run every few minutes by a scheduled job. Each run:
 *   1. gives the automatic first look to verified submissions that have none yet (a few at a time),
 *   2. schedules every submission that passes all the checks, to go live after the delay,
 *   3. publishes the ones whose time has come, if they still pass and the daily limit is not used up.
 * A reviewer can put any scheduled one on hold, and looks at every fast approval afterwards. With the feature
 * switched off the run does nothing and anything already scheduled is left unpublished.
 */

const AI_CHECKS_PER_RUN = 5;
const PER_RUN = 50;

export async function loadAutoApproveSettings(): Promise<AutoApproveSettings> {
  const row = await prisma.siteSetting.findUnique({ where: { key: AUTO_APPROVE_KEY }, select: { value: true } }).catch(() => null);
  return sanitizeAutoApprove(row?.value);
}

const hostOf = (url: string | null | undefined) => domainParts(url)?.host ?? null;

/** Other listings (live or not) on the same website. */
async function startupDuplicates(id: string, host: string | null) {
  if (!host) return 0;
  const rows = await prisma.startup.findMany({ where: { deletedAt: null, id: { not: id }, websiteUrl: { contains: host, mode: 'insensitive' } }, select: { websiteUrl: true } });
  return rows.filter((r) => hostOf(r.websiteUrl) === host).length;
}
async function toolDuplicates(id: string, host: string | null) {
  if (!host) return 0;
  const rows = await prisma.aiTool.findMany({ where: { deletedAt: null, id: { not: id }, websiteUrl: { contains: host, mode: 'insensitive' } }, select: { websiteUrl: true } });
  return rows.filter((r) => hostOf(r.websiteUrl) === host).length;
}

const STARTUP_FIELDS = {
  id: true, name: true, slug: true, ownerId: true, websiteUrl: true, verifiedDomain: true, isVerified: true, isApproved: true,
  reviewStatus: true, claimStatus: true, reviewReasonCode: true, aiCheckLabel: true, autoApproveAt: true, autoApproveHeld: true,
  logoUrl: true, description: true, linkedinUrl: true, headquartersCity: true, aiUseCase: true, founders: true,
  stage: true, employeeCount: true, foundedYear: true,
} as const;

type StartupRow = Awaited<ReturnType<typeof loadStartup>>;
const loadStartup = (id: string) => prisma.startup.findFirst({ where: { id, deletedAt: null }, select: STARTUP_FIELDS });

/** What the checks need to know about one startup. Used by the job and, for the reviewer's screen, by the admin. */
export async function startupFacts(s: NonNullable<StartupRow>): Promise<AutoApproveFacts> {
  // The address the founder proved, which must also be the listing's own website.
  const proven = s.isVerified && hostMatchesDomain(s.websiteUrl, s.verifiedDomain);
  return {
    ownershipProven: proven,
    domain: hostOf(s.websiteUrl),
    aiCheckLabel: s.aiCheckLabel,
    complete: !!(s.logoUrl && s.description?.trim() && s.linkedinUrl && s.headquartersCity && s.aiUseCase?.trim() && (s.founders?.length ?? 0) > 0),
    duplicates: await startupDuplicates(s.id, hostOf(s.websiteUrl)),
    turnedDownBefore: !!s.reviewReasonCode || s.claimStatus === 'REJECTED' || (s.reviewStatus !== 'IN_REVIEW' && s.reviewStatus !== 'APPROVED'),
    held: s.autoApproveHeld,
  };
}

const TOOL_FIELDS = {
  id: true, name: true, slug: true, ownerId: true, websiteUrl: true, isUrlVerified: true, status: true, claimStatus: true,
  aiCheckLabel: true, autoApproveAt: true, autoApproveHeld: true, logoUrl: true, description: true, linkedinUrl: true,
  launchYear: true, headquartersCountry: true, reviewReasonCode: true, reviewStatus: true,
} as const;
const loadTool = (id: string) => prisma.aiTool.findFirst({ where: { id, deletedAt: null }, select: TOOL_FIELDS });
type ToolRow = Awaited<ReturnType<typeof loadTool>>;

export async function toolFacts(t: NonNullable<ToolRow>): Promise<AutoApproveFacts> {
  const lines = await prisma.$queryRaw<Array<{ type: string; text: string }>>`SELECT type, text FROM "ToolUseCase" WHERE "toolId" = ${t.id}`;
  const missing = toolProblems({
    logoUrl: t.logoUrl, description: t.description, linkedinUrl: t.linkedinUrl, launchYear: t.launchYear, headquartersCountry: t.headquartersCountry,
    features: lines.filter((l) => l.type === 'feature').map((l) => l.text), useCases: lines.filter((l) => l.type === 'use_case').map((l) => l.text),
  });
  return {
    ownershipProven: t.isUrlVerified && !!t.ownerId,
    domain: hostOf(t.websiteUrl),
    aiCheckLabel: t.aiCheckLabel,
    complete: missing.length === 0,
    duplicates: await toolDuplicates(t.id, hostOf(t.websiteUrl)),
    turnedDownBefore: !!t.reviewReasonCode || t.claimStatus === 'REJECTED' || (t.reviewStatus !== 'IN_REVIEW' && t.reviewStatus !== 'APPROVED'),
    held: t.autoApproveHeld,
  };
}

const waitingStartup = { deletedAt: null, isApproved: false, reviewStatus: 'IN_REVIEW', claimStatus: { not: 'REJECTED' as const }, isVerified: true };
const waitingTool = { deletedAt: null, status: 'PENDING' as const, reviewStatus: 'IN_REVIEW', claimStatus: { not: 'REJECTED' as const }, isUrlVerified: true, ownerId: { not: null } };

/** Fast approvals in the last 24 hours, startups and tools together. */
async function approvedLately(now: Date) {
  const since = new Date(now.getTime() - 86_400_000);
  const [s, t] = await Promise.all([
    prisma.startup.count({ where: { approvedBy: AUTO_APPROVER, approvedAt: { gte: since } } }),
    prisma.aiTool.count({ where: { approvedBy: AUTO_APPROVER, approvedAt: { gte: since } } }),
  ]);
  return s + t;
}

async function publishStartup(s: NonNullable<StartupRow>, now: Date) {
  const funding = await prisma.fundingRound.aggregate({ where: { startupId: s.id }, _sum: { amountUsd: true } });
  const { total: impactScore } = calculateImpactScore({
    totalFundingUsdCents: Number(funding._sum.amountUsd ?? 0), employeeCount: s.employeeCount ?? null, stage: s.stage, foundedYear: s.foundedYear ?? null,
  });
  // Only if it is still waiting: a reviewer may have decided in the meantime.
  const done = await prisma.startup.updateMany({
    where: { id: s.id, isApproved: false, reviewStatus: 'IN_REVIEW', autoApproveHeld: false, autoApproveAt: { lte: now } },
    data: {
      isApproved: true, approvedAt: now, approvedBy: AUTO_APPROVER, impactScore, reviewStatus: 'APPROVED', reviewedAt: now,
      reviewedByEmail: 'fast approval', autoApproveAt: null, claimStatus: 'VERIFIED', postCheckedAt: null, postCheckedByEmail: null,
    },
  });
  if (!done.count) return false;
  const founder = s.ownerId ? await prisma.founderUser.findUnique({ where: { id: s.ownerId }, select: { email: true, name: true } }) : null;
  if (founder?.email) await sendApprovalEmail(founder.email, founder.name || 'there', 'startup', s.name, s.slug).catch(() => {});
  await notifyFounder(s.ownerId, { type: 'listing_approved', title: `${s.name} is live`, message: 'Your startup qualified for fast approval and is public on Udyaibase.', link: '/founder/startups' });
  await refreshPublicListing('startup', s.id);
  return true;
}

async function publishTool(t: NonNullable<ToolRow>, now: Date) {
  const done = await prisma.aiTool.updateMany({
    where: { id: t.id, status: 'PENDING', autoApproveHeld: false, autoApproveAt: { lte: now } },
    data: { status: 'APPROVED', approvedAt: now, approvedBy: AUTO_APPROVER, autoApproveAt: null, claimStatus: 'VERIFIED', reviewStatus: 'APPROVED', reviewedAt: now, reviewedByEmail: 'fast approval', postCheckedAt: null, postCheckedByEmail: null },
  });
  if (!done.count) return false;
  const founder = t.ownerId ? await prisma.founderUser.findUnique({ where: { id: t.ownerId }, select: { email: true, name: true } }) : null;
  if (founder?.email) await sendApprovalEmail(founder.email, founder.name || 'there', 'tool', t.name, t.slug).catch(() => {});
  await notifyFounder(t.ownerId, { type: 'listing_approved', title: `${t.name} is live`, message: 'Your AI tool qualified for fast approval and is public on Udyaibase.', link: '/founder/tools' });
  await refreshPublicListing('tool', t.id);
  return true;
}

export interface FastApprovalRun { enabled: boolean; checked: number; scheduled: number; published: number; dropped: number; capReached: boolean }

export async function runFastApproval(now: Date = new Date()): Promise<FastApprovalRun> {
  const settings = await loadAutoApproveSettings();
  const out: FastApprovalRun = { enabled: settings.enabled, checked: 0, scheduled: 0, published: 0, dropped: 0, capReached: false };
  if (!settings.enabled) return out;

  // 1. First look for verified submissions that have none (old ones, or ones verified after submitting without a key).
  const [needS, needT] = await Promise.all([
    prisma.startup.findMany({ where: { ...waitingStartup, aiCheckLabel: null }, orderBy: { createdAt: 'asc' }, take: AI_CHECKS_PER_RUN, select: { id: true } }),
    prisma.aiTool.findMany({ where: { ...waitingTool, aiCheckLabel: null }, orderBy: { createdAt: 'asc' }, take: AI_CHECKS_PER_RUN, select: { id: true } }),
  ]);
  for (const s of needS) if (await runStartupAiCheck(s.id)) out.checked++;
  for (const t of needT.slice(0, Math.max(0, AI_CHECKS_PER_RUN - needS.length))) if (await runToolAiCheck(t.id)) out.checked++;

  // 2. Schedule the ones that pass every check.
  const dueAt = new Date(now.getTime() + settings.delayMinutes * 60_000);
  const [candS, candT] = await Promise.all([
    prisma.startup.findMany({ where: { ...waitingStartup, aiCheckLabel: 'LIKELY_AI', autoApproveAt: null, autoApproveHeld: false }, take: PER_RUN, select: STARTUP_FIELDS }),
    prisma.aiTool.findMany({ where: { ...waitingTool, aiCheckLabel: 'LIKELY_AI', autoApproveAt: null, autoApproveHeld: false }, take: PER_RUN, select: TOOL_FIELDS }),
  ]);
  for (const s of candS) {
    if (!autoApproveEligible(await startupFacts(s), settings)) continue;
    await prisma.startup.update({ where: { id: s.id }, data: { autoApproveAt: dueAt }, select: { id: true } });
    out.scheduled++;
  }
  for (const t of candT) {
    if (!autoApproveEligible(await toolFacts(t), settings)) continue;
    await prisma.aiTool.update({ where: { id: t.id }, data: { autoApproveAt: dueAt }, select: { id: true } });
    out.scheduled++;
  }

  // 3. Publish the ones whose time has come, checking again: details, duplicates or the label may have changed.
  let room = settings.dailyCap - (await approvedLately(now));
  const [dueS, dueT] = await Promise.all([
    prisma.startup.findMany({ where: { deletedAt: null, isApproved: false, autoApproveAt: { lte: now } }, orderBy: { autoApproveAt: 'asc' }, take: PER_RUN, select: STARTUP_FIELDS }),
    prisma.aiTool.findMany({ where: { deletedAt: null, status: 'PENDING', autoApproveAt: { lte: now } }, orderBy: { autoApproveAt: 'asc' }, take: PER_RUN, select: TOOL_FIELDS }),
  ]);
  for (const s of dueS) {
    if (!autoApproveEligible(await startupFacts(s), settings)) {
      await prisma.startup.update({ where: { id: s.id }, data: { autoApproveAt: null }, select: { id: true } });
      out.dropped++;
      continue;
    }
    if (room <= 0) { out.capReached = true; continue; } // stays scheduled; goes out when there is room
    if (await publishStartup(s, now)) { out.published++; room--; }
  }
  for (const t of dueT) {
    if (!autoApproveEligible(await toolFacts(t), settings)) {
      await prisma.aiTool.update({ where: { id: t.id }, data: { autoApproveAt: null }, select: { id: true } });
      out.dropped++;
      continue;
    }
    if (room <= 0) { out.capReached = true; continue; }
    if (await publishTool(t, now)) { out.published++; room--; }
  }
  if (out.published) refreshSections(['startups', 'tools', 'india-ai', 'home']);
  return out;
}
