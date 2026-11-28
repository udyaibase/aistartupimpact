import { prisma } from '@udyaibase/database';
import { toolApprovalHtml, toolRejectionHtml } from '@udyaibase/utils';
import { reviewStatusOf, validateReviewDecision, REVIEW_STATUS_LABEL, type ReviewAction } from '@udyaibase/utils/startup-review';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { notifyFounder } from '@/lib/founder-notify';
import { logAuditEvent } from '@/lib/audit-log';
import { invalidateToolCache } from '@/lib/cache-invalidate';

/**
 * The one place an AI tool submission is decided: approve, ask for changes, turn down, or take a live one down.
 * The same rules as startups (lib/startup-review): the founder always gets the email and the notice, the reason is
 * always saved where they can read it, and proving ownership of the website is never mistaken for approval.
 */

const REVIEWER_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];

export type ToolReviewResult = { success: true; name: string; status: string } | { success: false; error: string };

export const isToolLive = (status: string | null | undefined) => status === 'APPROVED' || status === 'FEATURED';

export async function decideToolReview(id: string, raw: unknown, admin: { email?: string | null; role?: string | null }): Promise<ToolReviewResult> {
  const t = await prisma.aiTool.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, name: true, slug: true, ownerId: true, status: true, isUrlVerified: true, claimStatus: true, reviewStatus: true },
  });
  if (!t) return { success: false, error: 'This tool no longer exists.' };

  const current = reviewStatusOf({ isApproved: isToolLive(t.status), reviewStatus: t.reviewStatus, claimStatus: t.claimStatus });
  const checked = validateReviewDecision(raw, current);
  if (!checked.ok) return { success: false, error: checked.error.replace('startup', 'tool') };
  const { action, reasonCode, note } = checked.data;
  // Founder submissions are decided by an editor. Other staff may approve only listings our own team added.
  if (t.ownerId && admin.role && !REVIEWER_ROLES.includes(admin.role)) {
    return { success: false, error: 'A founder submitted this tool. An editor decides it from Submissions.' };
  }
  const founder = t.ownerId ? await prisma.founderUser.findUnique({ where: { id: t.ownerId }, select: { email: true, name: true } }) : null;
  const reviewed = { reviewedAt: new Date(), reviewedByEmail: admin.email ?? null };

  if (action === 'approve') {
    await prisma.aiTool.update({
      where: { id },
      data: {
        status: 'APPROVED', approvedAt: new Date(), approvedBy: admin.email ?? 'reviewer', reviewStatus: 'APPROVED', reviewReasonCode: null, reviewNote: null, ...reviewed,
        // Ownership is its own fact, shown once review is out of the way.
        ...(t.ownerId ? { claimStatus: t.isUrlVerified ? 'VERIFIED' as const : 'CLAIMED' as const } : {}),
        // Decided by a person: nothing left for fast approval to do or for anyone to re-check.
        autoApproveAt: null, postCheckedAt: new Date(), postCheckedByEmail: admin.email ?? null,
      },
      select: { id: true },
    });
    if (founder?.email) {
      sendEmailFireAndForget({ to: founder.email, subject: `Your tool "${t.name}" is now live on Udyaibase`, html: toolApprovalHtml(t.name, founder.name || 'there', t.slug), type: 'approval' });
    }
    await notifyFounder(t.ownerId, { type: 'listing_approved', title: `${t.name} is live`, message: 'Your AI tool passed review and is public on Udyaibase.', link: '/founder/tools' });
    await logAuditEvent({ action: 'APPROVE', resourceType: 'AI_TOOL', resourceId: id, resourceName: t.name, before: { review: current }, after: { review: 'APPROVED' } });
    invalidateToolCache();
    return { success: true, name: t.name, status: 'APPROVED' };
  }

  const next = action === 'request_changes' ? 'CHANGES_REQUESTED' : action === 'reject' ? 'REJECTED' : 'TAKEN_DOWN';
  await prisma.aiTool.update({
    where: { id },
    data: {
      // Hidden, and kept apart from tools that are simply waiting. No approval date, so reactivating an account
      // can't bring it back, and on hold, so fast approval never repeats a decision a person reversed.
      status: 'ARCHIVED', approvedAt: null, approvedBy: null, autoApproveAt: null, autoApproveHeld: true,
      reviewStatus: next, reviewReasonCode: reasonCode, reviewNote: note, ...reviewed,
      ...(t.ownerId ? { claimStatus: 'REJECTED' as const } : {}),
    },
    select: { id: true },
  });

  const subject: Record<Exclude<ReviewAction, 'approve'>, string> = {
    request_changes: `A few changes needed for your tool "${t.name}"`,
    reject: `Your tool "${t.name}" was not approved`,
    take_down: `"${t.name}" has been taken down from Udyaibase`,
  };
  const title: Record<Exclude<ReviewAction, 'approve'>, string> = {
    request_changes: `${t.name} needs a few changes`, reject: `${t.name} wasn’t approved`, take_down: `${t.name} was taken down`,
  };
  if (founder?.email) {
    sendEmailFireAndForget({ to: founder.email, subject: subject[action], html: toolRejectionHtml(t.name, founder.name || 'there', note ?? ''), type: 'rejection' });
  }
  await notifyFounder(t.ownerId, { type: 'listing_rejected', title: title[action], message: note ?? '', link: `/founder/tools/${t.slug}` });
  await logAuditEvent({
    action: action === 'take_down' ? 'UNPUBLISH' : 'REJECT', resourceType: 'AI_TOOL', resourceId: id, resourceName: t.name,
    before: { review: current }, after: { review: next, reasonCode, note },
  });
  invalidateToolCache();
  return { success: true, name: t.name, status: REVIEW_STATUS_LABEL[next] };
}
