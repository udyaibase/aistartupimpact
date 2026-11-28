import { prisma } from '@udyaibase/database';
import { startupApprovalHtml, startupRejectionHtml } from '@udyaibase/utils';
import { reviewStatusOf, validateReviewDecision, REVIEW_STATUS_LABEL, type ReviewAction } from '@udyaibase/utils/startup-review';
import { calculateImpactScore } from '@/lib/impact-score';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { notifyFounder } from '@/lib/founder-notify';
import { logAuditEvent } from '@/lib/audit-log';

/**
 * The one place a startup submission is decided: approve, ask for changes, turn down, or take a live one down.
 * Every screen and route goes through here, so the founder always gets the same email and notice, the reason is
 * always saved, and ownership (the verified badge) is never mistaken for approval.
 */

const REVIEWER_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];

export type ReviewResult =
  | { success: true; name: string; status: string }
  | { success: false; error: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function decideStartupReview(id: string, raw: unknown, admin: { email?: string | null; role?: string | null }): Promise<ReviewResult> {
  const s = await prisma.startup.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, name: true, slug: true, tagline: true, description: true, websiteUrl: true, stage: true, employeeCount: true, foundedYear: true,
      ownerId: true, isApproved: true, isVerified: true, claimStatus: true, reviewStatus: true,
    },
  });
  if (!s) return { success: false, error: 'This startup no longer exists.' };

  const current = reviewStatusOf(s);
  const checked = validateReviewDecision(raw, current);
  if (!checked.ok) return { success: false, error: checked.error };
  const { action, reasonCode, note } = checked.data;
  // Founder submissions are decided by an editor. Other staff may approve only listings our own team added.
  if (s.ownerId && admin.role && !REVIEWER_ROLES.includes(admin.role)) {
    return { success: false, error: 'A founder submitted this startup. An editor decides it from Submissions.' };
  }
  const founder = s.ownerId ? await prisma.founderUser.findUnique({ where: { id: s.ownerId }, select: { email: true, name: true } }) : null;
  const reviewed = { reviewedAt: new Date(), reviewedByEmail: admin.email ?? null };
  // Ownership is its own fact: what the claim field says once review is out of the way.
  const owned = s.ownerId ? (s.isVerified ? 'VERIFIED' : 'CLAIMED') : s.claimStatus;

  if (action === 'approve') {
    const funding = await prisma.fundingRound.aggregate({ where: { startupId: id }, _sum: { amountUsd: true } });
    const { total: impactScore } = calculateImpactScore({
      totalFundingUsdCents: Number(funding._sum.amountUsd ?? 0), employeeCount: s.employeeCount ?? null, stage: s.stage, foundedYear: s.foundedYear ?? null,
    });
    await prisma.startup.update({
      where: { id },
      data: {
        isApproved: true, approvedAt: new Date(), approvedBy: admin.email ?? 'reviewer', impactScore, reviewStatus: 'APPROVED', reviewReasonCode: null, reviewNote: null, ...reviewed,
        // Decided by a person: nothing left for fast approval to do or for anyone to re-check.
        autoApproveAt: null, postCheckedAt: new Date(), postCheckedByEmail: admin.email ?? null,
        claimStatus: owned as never,
      },
      select: { id: true },
    });
    if (founder?.email) {
      sendEmailFireAndForget({ to: founder.email, subject: `Your startup "${s.name}" is now live on Udyaibase`, html: startupApprovalHtml(s.name, founder.name || 'there', s.slug), type: 'approval' });
    }
    await notifyFounder(s.ownerId, { type: 'listing_approved', title: `${s.name} is live`, message: 'Your startup passed review and is public on Udyaibase.', link: '/founder/startups' });
    await logAuditEvent({ action: 'APPROVE', resourceType: 'STARTUP', resourceId: id, resourceName: s.name, before: { review: current }, after: { review: 'APPROVED', impactScore } });
    return { success: true, name: s.name, status: 'APPROVED' };
  }

  const next = action === 'request_changes' ? 'CHANGES_REQUESTED' : action === 'reject' ? 'REJECTED' : 'TAKEN_DOWN';
  await prisma.startup.update({
    where: { id },
    data: {
      // Not public (a take-down hides a live one). No approval date, so reactivating an account can't bring it back.
      isApproved: false, approvedAt: null, approvedBy: null, autoApproveAt: null, reviewStatus: next, reviewReasonCode: reasonCode, reviewNote: note, ...reviewed,
      // The founder portal reopens a listing for another review from this state when the founder saves changes.
      ...(s.ownerId ? { claimStatus: 'REJECTED' as const } : {}),
    },
    select: { id: true },
  });

  const subject: Record<Exclude<ReviewAction, 'approve'>, string> = {
    request_changes: `A few changes needed for "${s.name}" on Udyaibase`,
    reject: `Your startup "${s.name}" was not approved`,
    take_down: `"${s.name}" has been taken down from Udyaibase`,
  };
  const title: Record<Exclude<ReviewAction, 'approve'>, string> = {
    request_changes: `${s.name} needs a few changes`,
    reject: `${s.name} wasn’t approved`,
    take_down: `${s.name} was taken down`,
  };
  if (founder?.email) {
    const html = action === 'take_down'
      ? `<p>Hi ${esc(founder.name || 'there')},</p><p>Your startup <strong>${esc(s.name)}</strong> is no longer shown on Udyaibase.</p><p><strong>Why:</strong> ${esc(note ?? '')}</p><p>You can update the listing in your founder portal and save it to send it for another review.</p>`
      : startupRejectionHtml(s.name, founder.name || 'there', note ?? '', { tagline: s.tagline ?? undefined, description: s.description ?? undefined, stage: s.stage ?? undefined, websiteUrl: s.websiteUrl ?? undefined });
    sendEmailFireAndForget({ to: founder.email, subject: subject[action], html, type: 'rejection' });
  }
  await notifyFounder(s.ownerId, { type: 'listing_rejected', title: title[action], message: note ?? '', link: `/founder/startups/${s.slug}` });
  await logAuditEvent({
    action: action === 'take_down' ? 'UNPUBLISH' : 'REJECT', resourceType: 'STARTUP', resourceId: id, resourceName: s.name,
    before: { review: current }, after: { review: next, reasonCode, note },
  });
  return { success: true, name: s.name, status: REVIEW_STATUS_LABEL[next] };
}
