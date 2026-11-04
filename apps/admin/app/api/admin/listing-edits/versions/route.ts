import { NextRequest, NextResponse } from 'next/server';
import { prisma, restoreListingVersion } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { notifyFounder } from '@/lib/founder-notify';
import { refreshPublic } from '@/lib/refresh-public';

const ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];
export const dynamic = 'force-dynamic';

/** A listing's history: who changed what and when. Search by the listing's web address. */
export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth(ROLES);
  if (error) return error;

  const type = request.nextUrl.searchParams.get('type') === 'tool' ? 'tool' : 'startup';
  const slug = (request.nextUrl.searchParams.get('slug') ?? '').trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: 'Enter the listing’s web address.' }, { status: 400 });

  const listing = type === 'startup'
    ? await prisma.startup.findFirst({ where: { slug, deletedAt: null }, select: { id: true, name: true } })
    : await prisma.aiTool.findFirst({ where: { slug, deletedAt: null }, select: { id: true, name: true } });
  if (!listing) return NextResponse.json({ error: 'No listing has that address.' }, { status: 404 });

  const versions = await prisma.listingVersion.findMany({
    where: { entityType: type, entityId: listing.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, changedFields: true, actorType: true, actorLabel: true, note: true, createdAt: true },
  });
  return NextResponse.json({ listing, type, versions });
}

/** Admin override: restore a listing to how it was before a change. The current state is saved first, so this can be undone. */
export async function POST(request: NextRequest) {
  const { session, error } = await requireApiAuth(ROLES);
  if (error) return error;

  const { versionId } = await request.json().catch(() => ({ versionId: null }));
  if (typeof versionId !== 'string') return NextResponse.json({ error: 'Choose a version.' }, { status: 400 });

  const user = session!.user as { id: string; name?: string | null; email?: string | null };
  try {
    const restored = await restoreListingVersion(versionId, { type: 'ADMIN', id: user.id, label: user.name || user.email || 'Admin' });
    if (!restored) return NextResponse.json({ error: 'That version no longer exists.' }, { status: 404 });

    await notifyFounder(restored.ownerId, {
      type: 'listing_restored',
      title: `Our team restored ${restored.name}`,
      message: 'We put your listing back to an earlier version. Contact Support if you have questions.',
      link: restored.type === 'startup' ? '/founder/startups' : '/founder/tools',
    });
    logAuditEvent({ action: 'RESTORE', resourceType: restored.type === 'startup' ? 'STARTUP' : 'AI_TOOL', resourceId: restored.id, resourceName: restored.name, after: { versionId } });
    await refreshPublic(restored.type === 'startup' ? ['startups', 'home'] : ['tools', 'home']);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[listing-versions]', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Couldn’t restore that version. Try again.' }, { status: 500 });
  }
}
