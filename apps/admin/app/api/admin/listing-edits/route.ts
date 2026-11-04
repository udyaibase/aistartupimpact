import { NextRequest, NextResponse } from 'next/server';
import { decideListingEdits, prisma } from '@udyaibase/database';
import { listingEditDecisionHtml, listingFieldLabel } from '@udyaibase/utils';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { notifyFounder } from '@/lib/founder-notify';
import { refreshPublic } from '@/lib/refresh-public';
import { calculateImpactScore } from '@/lib/impact-score';

const ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];
export const dynamic = 'force-dynamic';

/** Fields waiting for review, grouped by listing. */
export async function GET() {
  const { error } = await requireApiAuth(ROLES);
  if (error) return error;

  const edits = await prisma.listingPendingEdit.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 500 });
  const startupIds = edits.filter((e) => e.entityType === 'startup').map((e) => e.entityId);
  const toolIds = edits.filter((e) => e.entityType === 'tool').map((e) => e.entityId);
  const [startups, tools] = await Promise.all([
    prisma.startup.findMany({ where: { id: { in: startupIds } }, select: { id: true, name: true, slug: true, isVerified: true } }),
    prisma.aiTool.findMany({ where: { id: { in: toolIds } }, select: { id: true, name: true, slug: true, isUrlVerified: true } }),
  ]);
  const names = new Map<string, { name: string; slug: string; verified: boolean }>([
    ...startups.map((s) => [`startup:${s.id}`, { name: s.name, slug: s.slug, verified: s.isVerified }] as const),
    ...tools.map((t) => [`tool:${t.id}`, { name: t.name, slug: t.slug, verified: t.isUrlVerified }] as const),
  ]);

  return NextResponse.json({
    edits: edits.map((e) => ({
      id: e.id, entityType: e.entityType, entityId: e.entityId, field: e.field, oldValue: e.oldValue, newValue: e.newValue,
      submittedByName: e.submittedByName, createdAt: e.createdAt,
      listing: names.get(`${e.entityType}:${e.entityId}`) ?? { name: 'Listing', slug: '', verified: false },
    })),
  });
}

/** Approve or reject fields of one listing. Rejecting leaves the live listing exactly as it is. */
export async function POST(request: NextRequest) {
  const { session, error } = await requireApiAuth(ROLES);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 100) : [];
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (ids.length === 0 || !action) return NextResponse.json({ error: 'Choose what to review.' }, { status: 400 });
  if (action === 'reject' && !note) return NextResponse.json({ error: 'Tell the founder why. We email them this note.' }, { status: 400 });

  const user = session!.user as { id: string; name?: string | null; email?: string | null };
  try {
    const result = await decideListingEdits(ids, action, { type: 'ADMIN', id: user.id, label: user.name || user.email || 'Admin' }, note || undefined);
    if (!result.listing) return NextResponse.json({ error: 'These changes were already reviewed.' }, { status: 409 });
    const { listing } = result;
    const fields = [...result.approved, ...result.rejected].map(listingFieldLabel).join(', ');

    // The impact score follows what's live.
    if (listing.type === 'startup' && result.approved.some((f) => ['fundingRounds', 'employeeCount', 'stage', 'foundedYear'].includes(f))) {
      const s = await prisma.startup.findUnique({ where: { id: listing.id }, select: { employeeCount: true, stage: true, foundedYear: true, FundingRound: { select: { amountUsd: true } } } });
      if (s) {
        const { total } = calculateImpactScore({
          totalFundingUsdCents: s.FundingRound.reduce((sum, r) => sum + Number(r.amountUsd ?? 0), 0),
          employeeCount: s.employeeCount, stage: s.stage, foundedYear: s.foundedYear,
        });
        await prisma.startup.update({ where: { id: listing.id }, data: { impactScore: total }, select: { id: true } });
      }
    }

    if (listing.ownerId) {
      const approved = action === 'approve';
      await notifyFounder(listing.ownerId, {
        type: approved ? 'edit_approved' : 'edit_rejected',
        title: approved ? `Your changes to ${listing.name} are live` : `Your changes to ${listing.name} weren’t approved`,
        message: note || fields,
        link: listing.type === 'startup' ? '/founder/startups' : '/founder/tools',
      });
      await prisma.founderActivityLog.create({ data: { founderId: listing.ownerId, action: approved ? 'edit_approved' : 'edit_rejected', metadata: { fields } } }).catch(() => undefined);
      const owner = await prisma.founderUser.findUnique({ where: { id: listing.ownerId }, select: { email: true, name: true } });
      if (owner) {
        const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';
        sendEmailFireAndForget({
          to: owner.email,
          subject: approved ? `Your changes to ${listing.name} are live` : `Your changes to ${listing.name} weren’t approved`,
          html: listingEditDecisionHtml({
            name: owner.name, listingName: listing.name, fields, approved, note: note || undefined, badgeRemoved: listing.badgeRemoved,
            manageUrl: `${site}/founder/${listing.type === 'startup' ? 'startups' : 'tools'}`,
          }),
          type: approved ? 'approval' : 'rejection',
        });
      }
    }

    logAuditEvent({
      action: action === 'approve' ? 'APPROVE' : 'REJECT',
      resourceType: listing.type === 'startup' ? 'STARTUP' : 'AI_TOOL',
      resourceId: listing.id,
      resourceName: listing.name,
      after: { fields, note: note || undefined },
    });
    if (action === 'approve') await refreshPublic(listing.type === 'startup' ? ['startups', 'home'] : ['tools', 'home']);
    return NextResponse.json({ success: true, approved: result.approved, rejected: result.rejected, badgeRemoved: listing.badgeRemoved });
  } catch (err) {
    console.error('[listing-edits]', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Couldn’t save that. Try again.' }, { status: 500 });
  }
}
