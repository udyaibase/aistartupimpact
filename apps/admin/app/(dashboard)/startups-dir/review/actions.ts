'use server';

import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';
import { reviewStatusOf, type ReviewStatus } from '@udyaibase/utils/startup-review';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { publicError } from '@/lib/public-error';
import { refreshPublic } from '@/lib/refresh-public';
import { decideStartupReview } from '@/lib/startup-review';
import { notifyFounder } from '@/lib/founder-notify';
import { checkStartupForAi, checkToolForAi } from '@/lib/startup-ai-check';
import { decideToolReview, isToolLive } from '@/lib/tool-review';
import { toolProblems } from '@udyaibase/utils/tool-required';
import { AI_CHECK_LABELS, type AiCheckLabel } from '@udyaibase/utils/startup-ai-check';
import { tooManyShared } from '@/lib/rate-limit';
import { logAuditEvent } from '@/lib/audit-log';
import {
  AUTO_APPROVE_KEY, AUTO_APPROVER, autoApproveChecks, hostMatchesDomain, sanitizeAutoApprove, type AutoApproveCheck, type AutoApproveSettings,
} from '@udyaibase/utils/auto-approve';

const ROLES = sectionRoles('/startups-dir/review');

export type ReviewKind = 'startup' | 'tool';

export type ReviewRow = {
  kind: ReviewKind;
  /** Tools only: pricing, launch year and what the founder listed as features and use cases. */
  pricing?: string | null; launchYear?: number | null; features?: string[];
  id: string; name: string; slug: string; tagline: string | null; description: string | null; logoUrl: string | null;
  websiteUrl: string | null; linkedinUrl: string | null; headquartersCity: string | null; category: string | null;
  businessType: string | null; stage: string | null; foundedYear: number | null; employeeCount: number | null;
  founders: string[]; aiUseCase: string | null;
  /** The automatic first look: a hint only. */
  aiCheckLabel: AiCheckLabel | null; aiCheckReason: string | null; aiCheckedAt: string | null;
  /** Fast approval: when it goes live by itself (null: not scheduled), whether it is on hold, and each check's result. */
  autoApproveAt: string | null; autoApproveHeld: boolean; fastChecks: AutoApproveCheck[];
  status: ReviewStatus; reviewNote: string | null; reviewedAt: string | null; reviewedByEmail: string | null;
  isVerified: boolean; verificationMethod: string | null; verifiedDomain: string | null;
  founderId: string | null; founderName: string | null; founderEmail: string | null;
  /** When it entered the queue, and how many whole days it has waited. */
  waitingSince: string; daysWaiting: number;
  /** Other listings on the same website: a likely duplicate. */
  sameSite: number;
};

/** A startup or AI tool that fast approval has scheduled, or has already published and no person has looked at yet. */
export type FastItem = {
  kind: 'startup' | 'tool'; id: string; name: string; slug: string; tagline: string | null; websiteUrl: string | null; logoUrl: string | null;
  founderName: string | null; founderEmail: string | null;
  state: 'scheduled' | 'held' | 'live';
  /** scheduled: when it goes live. live: when it went live. */
  at: string | null;
  aiCheckReason: string | null;
};

/** AI tools that are not public: waiting, sent back, turned down or taken down. Tools we archived ourselves are not submissions. */
async function loadToolRows(settings: AutoApproveSettings): Promise<ReviewRow[]> {
  const list = await prisma.aiTool.findMany({
    where: { deletedAt: null, OR: [{ status: 'PENDING' }, { status: 'ARCHIVED', reviewStatus: { in: ['CHANGES_REQUESTED', 'REJECTED', 'TAKEN_DOWN'] } }, { status: 'ARCHIVED', claimStatus: 'REJECTED' }] },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: {
      id: true, name: true, slug: true, tagline: true, description: true, logoUrl: true, websiteUrl: true, linkedinUrl: true,
      headquartersCity: true, headquartersCountry: true, pricingModel: true, launchYear: true, founderNames: true, status: true,
      reviewStatus: true, claimStatus: true, reviewNote: true, reviewReasonCode: true, reviewedAt: true, reviewedByEmail: true,
      isUrlVerified: true, ownerId: true, createdAt: true, submittedForReviewAt: true,
      aiCheckLabel: true, aiCheckReason: true, aiCheckedAt: true, autoApproveAt: true, autoApproveHeld: true,
      ToolCategory: { select: { name: true } },
    },
  });
  if (!list.length) return [];
  const ids = list.map((t) => t.id);
  const ownerIds = [...new Set(list.map((t) => t.ownerId).filter((v): v is string => !!v))];
  const [owners, lines] = await Promise.all([
    ownerIds.length ? prisma.founderUser.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [],
    prisma.$queryRaw<Array<{ toolId: string; type: string; text: string }>>`SELECT "toolId", type, text FROM "ToolUseCase" WHERE "toolId" = ANY(${ids}::text[]) ORDER BY id`,
  ]);
  const ownerOf = new Map(owners.map((o) => [o.id, o]));
  const hosts = [...new Set(list.map((t) => host(t.websiteUrl)).filter(Boolean))];
  const sites = hosts.length
    ? await prisma.aiTool.findMany({ where: { deletedAt: null, OR: hosts.map((h) => ({ websiteUrl: { contains: h, mode: 'insensitive' as const } })) }, select: { id: true, websiteUrl: true } })
    : [];
  const perHost = new Map<string, Set<string>>();
  for (const s of sites) { const h = host(s.websiteUrl); if (h) (perHost.get(h) ?? perHost.set(h, new Set()).get(h)!).add(s.id); }

  const now = Date.now();
  const rows: ReviewRow[] = list.map((t) => {
    const since = t.submittedForReviewAt ?? t.createdAt;
    const owner = t.ownerId ? ownerOf.get(t.ownerId) : null;
    const h = host(t.websiteUrl);
    const mine = lines.filter((l) => l.toolId === t.id);
    const features = mine.filter((l) => l.type === 'feature').map((l) => l.text);
    const useCases = mine.filter((l) => l.type !== 'feature').map((l) => l.text);
    const sameSite = h ? Math.max(0, (perHost.get(h)?.size ?? 1) - 1) : 0;
    return {
      kind: 'tool' as const,
      id: t.id, name: t.name, slug: t.slug, tagline: t.tagline, description: t.description, logoUrl: t.logoUrl, websiteUrl: t.websiteUrl,
      linkedinUrl: t.linkedinUrl, headquartersCity: [t.headquartersCity, t.headquartersCountry].filter(Boolean).join(', ') || null,
      category: t.ToolCategory?.name ?? null, businessType: null, stage: null, foundedYear: null, employeeCount: null,
      pricing: t.pricingModel, launchYear: t.launchYear, features: [...features, ...useCases].slice(0, 12),
      founders: t.founderNames ?? [], aiUseCase: null,
      aiCheckLabel: AI_CHECK_LABELS.includes(t.aiCheckLabel as AiCheckLabel) ? (t.aiCheckLabel as AiCheckLabel) : null, aiCheckReason: t.aiCheckReason, aiCheckedAt: t.aiCheckedAt?.toISOString() ?? null,
      status: reviewStatusOf({ isApproved: isToolLive(t.status), reviewStatus: t.reviewStatus, claimStatus: t.claimStatus }),
      reviewNote: t.reviewNote, reviewedAt: t.reviewedAt?.toISOString() ?? null, reviewedByEmail: t.reviewedByEmail,
      isVerified: t.isUrlVerified, verificationMethod: t.isUrlVerified ? 'DNS' : null, verifiedDomain: t.isUrlVerified ? h || null : null,
      founderId: t.ownerId, founderName: owner?.name ?? null, founderEmail: owner?.email ?? null,
      waitingSince: since.toISOString(), daysWaiting: Math.max(0, Math.floor((now - since.getTime()) / 86_400_000)),
      sameSite,
      autoApproveAt: t.autoApproveAt?.toISOString() ?? null, autoApproveHeld: t.autoApproveHeld,
      fastChecks: autoApproveChecks({
        ownershipProven: t.isUrlVerified && !!t.ownerId, domain: h || null, aiCheckLabel: t.aiCheckLabel,
        complete: toolProblems({ logoUrl: t.logoUrl, description: t.description, linkedinUrl: t.linkedinUrl, launchYear: t.launchYear, headquartersCountry: t.headquartersCountry, features, useCases }).length === 0,
        duplicates: sameSite,
        turnedDownBefore: !!t.reviewReasonCode || t.claimStatus === 'REJECTED' || (t.reviewStatus !== 'IN_REVIEW' && t.reviewStatus !== 'APPROVED'),
        held: t.autoApproveHeld,
      }, settings),
    };
  });
  rows.sort((a, b) => Number(b.status === 'IN_REVIEW') - Number(a.status === 'IN_REVIEW')
    || Number(b.isVerified) - Number(a.isVerified)
    || a.waitingSince.localeCompare(b.waitingSince));
  return rows;
}

async function loadSettings(): Promise<AutoApproveSettings> {
  const row = await prisma.siteSetting.findUnique({ where: { key: AUTO_APPROVE_KEY }, select: { value: true } }).catch(() => null);
  return sanitizeAutoApprove(row?.value);
}

async function loadFastList(): Promise<FastItem[]> {
  const pick = { id: true, name: true, slug: true, tagline: true, websiteUrl: true, logoUrl: true, ownerId: true, autoApproveAt: true, autoApproveHeld: true, approvedAt: true, aiCheckReason: true } as const;
  const [liveS, liveT, schedT] = await Promise.all([
    prisma.startup.findMany({ where: { deletedAt: null, isApproved: true, approvedBy: AUTO_APPROVER, postCheckedAt: null }, orderBy: { approvedAt: 'asc' }, take: 200, select: pick }),
    prisma.aiTool.findMany({ where: { deletedAt: null, status: { in: ['APPROVED', 'FEATURED'] }, approvedBy: AUTO_APPROVER, postCheckedAt: null }, orderBy: { approvedAt: 'asc' }, take: 200, select: pick }),
    // Scheduled startups show on their own card in Waiting; tools have no card there, so they are listed here.
    prisma.aiTool.findMany({ where: { deletedAt: null, status: 'PENDING', OR: [{ autoApproveAt: { not: null } }, { autoApproveHeld: true }] }, orderBy: { autoApproveAt: 'asc' }, take: 200, select: pick }),
  ]);
  const ownerIds = [...new Set([...liveS, ...liveT, ...schedT].map((r) => r.ownerId).filter((v): v is string => !!v))];
  const owners = ownerIds.length ? await prisma.founderUser.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
  const ownerOf = new Map(owners.map((o) => [o.id, o]));
  const item = (kind: 'startup' | 'tool', live: boolean) => (r: (typeof liveS)[number]): FastItem => ({
    kind, id: r.id, name: r.name, slug: r.slug, tagline: r.tagline, websiteUrl: r.websiteUrl, logoUrl: r.logoUrl,
    founderName: (r.ownerId && ownerOf.get(r.ownerId)?.name) || null, founderEmail: (r.ownerId && ownerOf.get(r.ownerId)?.email) || null,
    state: live ? 'live' : r.autoApproveHeld ? 'held' : 'scheduled',
    at: (live ? r.approvedAt : r.autoApproveAt)?.toISOString() ?? null, aiCheckReason: r.aiCheckReason,
  });
  return [...schedT.map(item('tool', false)), ...liveS.map(item('startup', true)), ...liveT.map(item('tool', true))];
}

const host = (url: string | null) => {
  try { return url ? new URL(url).hostname.replace(/^www\./, '').toLowerCase() : ''; } catch { return ''; }
};

/** Every startup that is not public: waiting, sent back for changes, turned down or taken down. */
export async function loadReviewQueueAction(kind: ReviewKind = 'startup'): Promise<{ success: true; rows: ReviewRow[]; settings: AutoApproveSettings; fast: FastItem[]; canEditSettings: boolean } | { success: false; error: string }> {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    if (kind === 'tool') {
      const settings = await loadSettings();
      return { success: true, rows: await loadToolRows(settings), settings, fast: await loadFastList(), canEditSettings: session?.user?.role === 'SUPER_ADMIN' };
    }
    const list = await prisma.startup.findMany({
      where: { deletedAt: null, isApproved: false },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true, name: true, slug: true, tagline: true, description: true, logoUrl: true, websiteUrl: true, linkedinUrl: true,
        headquartersCity: true, category: true, businessType: true, stage: true, foundedYear: true, employeeCount: true, founders: true,
        aiUseCase: true, aiCheckLabel: true, aiCheckReason: true, aiCheckedAt: true, isApproved: true,
        autoApproveAt: true, autoApproveHeld: true, reviewReasonCode: true, reviewStatus: true, claimStatus: true, reviewNote: true, reviewedAt: true, reviewedByEmail: true,
        isVerified: true, verificationMethod: true, verifiedDomain: true, ownerId: true, createdAt: true, submittedForReviewAt: true,
      },
    });
    const ownerIds = [...new Set(list.map((s) => s.ownerId).filter((v): v is string => !!v))];
    const owners = ownerIds.length ? await prisma.founderUser.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
    const ownerOf = new Map(owners.map((o) => [o.id, o]));

    // Likely duplicates: another listing (live or not) on the same website.
    const hosts = [...new Set(list.map((s) => host(s.websiteUrl)).filter(Boolean))];
    const sites = hosts.length
      ? await prisma.startup.findMany({ where: { deletedAt: null, OR: hosts.map((h) => ({ websiteUrl: { contains: h, mode: 'insensitive' as const } })) }, select: { id: true, websiteUrl: true } })
      : [];
    const perHost = new Map<string, Set<string>>();
    for (const s of sites) { const h = host(s.websiteUrl); if (h) (perHost.get(h) ?? perHost.set(h, new Set()).get(h)!).add(s.id); }

    const now = Date.now();
    const settings = await loadSettings();
    const rows: ReviewRow[] = list.map((s) => {
      const since = s.submittedForReviewAt ?? s.createdAt;
      const owner = s.ownerId ? ownerOf.get(s.ownerId) : null;
      const h = host(s.websiteUrl);
      return {
        kind: 'startup' as const,
        id: s.id, name: s.name, slug: s.slug, tagline: s.tagline, description: s.description, logoUrl: s.logoUrl, websiteUrl: s.websiteUrl,
        linkedinUrl: s.linkedinUrl, headquartersCity: s.headquartersCity, category: s.category, businessType: s.businessType,
        stage: s.stage, foundedYear: s.foundedYear, employeeCount: s.employeeCount, founders: s.founders ?? [], aiUseCase: s.aiUseCase,
        aiCheckLabel: AI_CHECK_LABELS.includes(s.aiCheckLabel as AiCheckLabel) ? (s.aiCheckLabel as AiCheckLabel) : null, aiCheckReason: s.aiCheckReason, aiCheckedAt: s.aiCheckedAt?.toISOString() ?? null,
        status: reviewStatusOf(s), reviewNote: s.reviewNote, reviewedAt: s.reviewedAt?.toISOString() ?? null, reviewedByEmail: s.reviewedByEmail,
        isVerified: s.isVerified, verificationMethod: s.verificationMethod, verifiedDomain: s.verifiedDomain,
        founderId: s.ownerId, founderName: owner?.name ?? null, founderEmail: owner?.email ?? null,
        waitingSince: since.toISOString(), daysWaiting: Math.max(0, Math.floor((now - since.getTime()) / 86_400_000)),
        sameSite: h ? Math.max(0, (perHost.get(h)?.size ?? 1) - 1) : 0,
        autoApproveAt: s.autoApproveAt?.toISOString() ?? null, autoApproveHeld: s.autoApproveHeld,
        // The same checks the scheduled job applies, so the reviewer sees exactly why it will or won't go live by itself.
        fastChecks: autoApproveChecks({
          ownershipProven: s.isVerified && hostMatchesDomain(s.websiteUrl, s.verifiedDomain),
          domain: h || null, aiCheckLabel: s.aiCheckLabel,
          complete: !!(s.logoUrl && s.description?.trim() && s.linkedinUrl && s.headquartersCity && s.aiUseCase?.trim() && (s.founders?.length ?? 0) > 0),
          duplicates: h ? Math.max(0, (perHost.get(h)?.size ?? 1) - 1) : 0,
          turnedDownBefore: !!s.reviewReasonCode || s.claimStatus === 'REJECTED' || (s.reviewStatus !== 'IN_REVIEW' && s.reviewStatus !== 'APPROVED'),
          held: s.autoApproveHeld,
        }, settings),
      };
    });
    // Waiting first: founders who proved ownership go to the front, then whoever has waited longest.
    rows.sort((a, b) => Number(b.status === 'IN_REVIEW') - Number(a.status === 'IN_REVIEW')
      || Number(b.isVerified) - Number(a.isVerified)
      || a.waitingSince.localeCompare(b.waitingSince));
    return { success: true, rows, settings, fast: await loadFastList(), canEditSettings: session?.user?.role === 'SUPER_ADMIN' };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't load the review queue. Try again.") };
  }
}

/** Approve, ask for changes, or turn down one submission. */
export async function decideStartupAction(id: string, input: { action: string; reasonCode?: string | null; note?: string | null }, kind: ReviewKind = 'startup') {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    const by = { email: session?.user?.email, role: session?.user?.role };
    const result = kind === 'tool' ? await decideToolReview(id, input, by) : await decideStartupReview(id, input, by);
    if (!result.success) return result;
    revalidatePath(kind === 'tool' ? '/tools-dir' : '/startups-dir');
    revalidatePath('/startups-dir/review');
    await refreshPublic(kind === 'tool' ? ['tools', 'home'] : ['startups', 'funding', 'india-ai', 'home']);
    return result;
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't save the decision. Try again.") };
  }
}

/** Run the automatic first look for one submission now (old submissions have none; an edited one can be checked again). */
export async function runAiCheckAction(id: string, kind: ReviewKind = 'startup') {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const limited = await tooManyShared(session!.user.id, 'aiCheck');
  if (limited) return { success: false as const, error: limited };
  try {
    const res = kind === 'tool' ? await checkToolForAi(id) : await checkStartupForAi(id);
    if (!res.ok) return { success: false as const, error: res.error };
    return { success: true as const, label: res.result.label, reason: res.result.reason, checkedAt: new Date().toISOString() };
  } catch (e) {
    return { success: false as const, error: publicError(e, "The automatic check couldn't run. Try again in a minute.") };
  }
}

/** Put one scheduled fast approval on hold (a person will decide), or release it so it can be scheduled again. */
export async function holdFastApprovalAction(kind: 'startup' | 'tool', id: string, hold: boolean) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    const data = { autoApproveHeld: hold, autoApproveAt: null };
    if (kind === 'startup') await prisma.startup.update({ where: { id }, data, select: { id: true } });
    else await prisma.aiTool.update({ where: { id }, data, select: { id: true } });
    await logAuditEvent({ action: 'UPDATE', resourceType: kind === 'startup' ? 'STARTUP' : 'AI_TOOL', resourceId: id, after: { fastApproval: hold ? 'on hold' : 'released' } });
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't change the hold. Try again.") };
  }
}

/** A person has looked at a fast approval and it is fine. */
export async function markFastApprovalCheckedAction(kind: 'startup' | 'tool', id: string) {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    const data = { postCheckedAt: new Date(), postCheckedByEmail: session?.user?.email ?? null };
    if (kind === 'startup') await prisma.startup.update({ where: { id }, data, select: { id: true } });
    else await prisma.aiTool.update({ where: { id }, data, select: { id: true } });
    await logAuditEvent({ action: 'UPDATE', resourceType: kind === 'startup' ? 'STARTUP' : 'AI_TOOL', resourceId: id, after: { fastApproval: 'checked by a person' } });
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't save that. Try again.") };
  }
}

/** Take a fast-approved listing off the site. Startups go through the shared decision; a tool goes back to not approved. */
export async function takeDownFastApprovalAction(kind: 'startup' | 'tool', id: string, note: string) {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  const reason = (note ?? '').trim().slice(0, 1000);
  if (reason.length < 10) return { success: false as const, error: 'Tell the founder why, in a sentence or two.' };
  try {
    if (kind === 'startup') {
      const res = await decideStartupReview(id, { action: 'take_down', reasonCode: 'OTHER', note: reason }, { email: session?.user?.email, role: session?.user?.role });
      if (!res.success) return res;
    } else {
      const res = await decideToolReview(id, { action: 'take_down', reasonCode: 'OTHER', note: reason }, { email: session?.user?.email, role: session?.user?.role });
      if (!res.success) return res;
    }
    revalidatePath('/startups-dir/review');
    await refreshPublic(['startups', 'tools', 'india-ai', 'home']);
    return { success: true as const };
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't take it down. Try again.") };
  }
}

/** Switch fast approval on or off and set its delay, daily limit and the ordinary words that never count. Super admins only. */
export async function saveAutoApproveSettingsAction(raw: unknown) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false as const, error };
  try {
    const before = await loadSettings();
    const next = sanitizeAutoApprove(raw);
    await prisma.siteSetting.upsert({
      where: { key: AUTO_APPROVE_KEY },
      create: { id: `setting_${AUTO_APPROVE_KEY}_${crypto.randomUUID()}`, key: AUTO_APPROVE_KEY, value: next as never, updatedAt: new Date() },
      update: { value: next as never, updatedAt: new Date() },
    });
    await logAuditEvent({
      action: 'UPDATE', resourceType: 'SETTINGS', resourceName: 'Fast approval',
      before: { enabled: before.enabled, delayMinutes: before.delayMinutes, dailyCap: before.dailyCap, blockWords: before.blockWords.length },
      after: { enabled: next.enabled, delayMinutes: next.delayMinutes, dailyCap: next.dailyCap, blockWords: next.blockWords.length },
    });
    return { success: true as const, settings: next };
  } catch (e) {
    return { success: false as const, error: publicError(e, "Couldn't save the settings. Try again.") };
  }
}
