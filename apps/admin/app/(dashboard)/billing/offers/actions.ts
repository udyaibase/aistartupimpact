'use server';

import { prisma } from '@udyaibase/database';
import { validateOfferInput, offerState, type OfferField } from '@udyaibase/utils/offers';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';
import { publicError } from '@/lib/public-error';
import { tooManyShared } from '@/lib/rate-limit';
import { loadRedemptions, type RedemptionRow } from '@/lib/billing/offers-load';

const ROLES = sectionRoles('/billing');
type Fail = { success: false; error: string; field?: OfferField };

/**
 * Create an offer (as a draft) or change one. Once anyone has claimed an offer, what they were promised is fixed:
 * the portal, what it gives (plan, free period or discount), who qualifies, how it is claimed, the code and the
 * start can no longer change.
 * The name, headline, end date, limit and "show on the sign-up page" can.
 */
export async function saveOfferAction(id: string | null, raw: unknown): Promise<{ success: true; id: string } | Fail> {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const v = validateOfferInput(raw);
  if (!v.ok) return { success: false, error: v.error, field: v.field };
  const d = v.data;

  try {
    if (!id) {
      const made = await prisma.planOffer.create({ data: { ...d, status: 'DRAFT', createdByEmail: session!.user.email ?? null } });
      await logAuditEvent({ action: 'CREATE', resourceType: 'PLAN_OFFER', resourceId: made.id, resourceName: d.name, after: d });
      return { success: true, id: made.id };
    }
    const before = await prisma.planOffer.findUnique({ where: { id } });
    if (!before) return { success: false, error: 'This offer no longer exists.' };
    if (before.redeemedCount > 0) {
      const fixed: [OfferField, boolean][] = [
        ['benefit', before.benefit !== d.benefit], ['plan', before.plan !== d.plan], ['benefitDays', before.benefitDays !== d.benefitDays], ['percentOff', before.percentOff !== d.percentOff],
        ['amountOffPaise', before.amountOffPaise !== d.amountOffPaise], ['cycle', before.cycle !== d.cycle], ['audience', before.audience !== d.audience],
        ['portal', before.portal !== d.portal], ['trigger', before.trigger !== d.trigger], ['code', (before.code ?? null) !== d.code], ['startsAt', before.startsAt.getTime() !== d.startsAt.getTime()],
      ];
      const changed = fixed.find(([, c]) => c);
      if (changed) return { success: false, field: changed[0], error: `${before.redeemedCount.toLocaleString('en-IN')} account${before.redeemedCount === 1 ? ' has' : 's have'} already claimed this offer, so this can no longer change. End this offer and create a new one instead.` };
      if (d.maxRedemptions != null && d.maxRedemptions < before.redeemedCount) return { success: false, field: 'maxRedemptions', error: `The limit can't go below the ${before.redeemedCount.toLocaleString('en-IN')} already claimed.` };
    }
    await prisma.planOffer.update({ where: { id }, data: d });
    await logAuditEvent({ action: 'UPDATE', resourceType: 'PLAN_OFFER', resourceId: id, resourceName: d.name, before: { name: before.name, headline: before.headline, portal: before.portal, benefit: before.benefit, percentOff: before.percentOff, amountOffPaise: before.amountOffPaise, cycle: before.cycle, trigger: before.trigger, code: before.code, plan: before.plan, benefitDays: before.benefitDays, audience: before.audience, startsAt: before.startsAt, endsAt: before.endsAt, maxRedemptions: before.maxRedemptions, showPublicly: before.showPublicly }, after: d });
    return { success: true, id };
  } catch (e) {
    // The code column is unique across offers, so a taken code is reported on its own field.
    if ((e as { code?: string } | null)?.code === 'P2002') return { success: false, field: 'code', error: 'Another offer already uses this code. Choose a different one.' };
    return { success: false, error: publicError(e, "Couldn't save the offer. Try again.") };
  }
}

const MOVES = {
  start: { to: 'ACTIVE', from: ['DRAFT'], done: 'started' },
  pause: { to: 'PAUSED', from: ['ACTIVE'], done: 'paused' },
  resume: { to: 'ACTIVE', from: ['PAUSED'], done: 'resumed' },
  end: { to: 'ENDED', from: ['DRAFT', 'ACTIVE', 'PAUSED'], done: 'ended' },
} as const;
export type OfferMove = keyof typeof MOVES;

/** Start, pause, resume or end an offer. Ending is final; accounts that already claimed keep their free period. */
export async function moveOfferAction(id: string, move: OfferMove): Promise<{ success: true; message: string } | Fail> {
  const { error, session } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'planChange');
  if (limited) return { success: false, error: limited };
  const m = MOVES[move];
  if (!m) return { success: false, error: 'Unknown action.' };
  try {
    const o = await prisma.planOffer.findUnique({ where: { id } });
    if (!o) return { success: false, error: 'This offer no longer exists.' };
    if (!(m.from as readonly string[]).includes(o.status)) return { success: false, error: `This offer is ${o.status.toLowerCase()} and can't be ${m.done}. Refresh to see where it stands.` };
    if (move !== 'end' && o.endsAt.getTime() <= Date.now()) return { success: false, error: 'This offer’s end date has passed. Move the end date first.' };
    // Only from the status we just read, so two admins pressing at once can't both act.
    const changed = await prisma.planOffer.updateMany({ where: { id, status: o.status }, data: { status: m.to } });
    if (!changed.count) return { success: false, error: 'Someone else just changed this offer. Refresh and try again.' };
    await logAuditEvent({ action: 'UPDATE', resourceType: 'PLAN_OFFER', resourceId: id, resourceName: `${o.name}: ${m.done}`, before: { status: o.status }, after: { status: m.to } });
    const state = offerState({ ...o, status: m.to });
    return { success: true, message: move === 'start' && state === 'scheduled' ? `“${o.name}” is scheduled and will start by itself.` : `“${o.name}” ${m.done}.` };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't change the offer. Try again.") };
  }
}

/** Delete a draft nobody has claimed. Anything that ran is kept for the record: end it instead. */
export async function deleteOfferAction(id: string): Promise<{ success: true } | Fail> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    const o = await prisma.planOffer.findUnique({ where: { id }, select: { name: true, status: true, redeemedCount: true } });
    if (!o) return { success: true };
    if (o.status !== 'DRAFT' || o.redeemedCount > 0) return { success: false, error: 'Only a draft that nobody has claimed can be deleted. End this offer instead.' };
    await prisma.planOffer.delete({ where: { id } });
    await logAuditEvent({ action: 'DELETE', resourceType: 'PLAN_OFFER', resourceId: id, resourceName: o.name });
    return { success: true };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't delete the offer. Try again.") };
  }
}

export async function offerClaimsAction(id: string): Promise<{ success: true; data: RedemptionRow[] } | Fail> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    return { success: true, data: await loadRedemptions(id) };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't load who claimed this offer.") };
  }
}
