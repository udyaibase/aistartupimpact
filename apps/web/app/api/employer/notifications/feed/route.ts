import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Only the signed-in person's own notes. The account owner's notes may be filed without a member id (when they had no
 * member row yet), so someone signed in with the owner's email sees those too.
 */
async function mine(s: { id: string; memberId?: string | null; email?: string | null }) {
  if (!s.memberId) return { employerId: s.id, memberId: null };
  const owner = await prisma.jobBoardEmployer.findUnique({ where: { id: s.id }, select: { email: true } });
  const isOwner = !!owner && !!s.email && owner.email.toLowerCase() === s.email.toLowerCase();
  return isOwner ? { employerId: s.id, OR: [{ memberId: s.memberId }, { memberId: null }] } : { employerId: s.id, memberId: s.memberId };
}

/** GET — this person's latest notes and how many are unread. */
export async function GET() {
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const where = await mine(guard.session);
  const [notifications, unreadCount] = await Promise.all([
    prisma.employerNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, type: true, title: true, message: true, link: true, read: true, createdAt: true } }),
    prisma.employerNotification.count({ where: { ...where, read: false } }),
  ]);
  return NextResponse.json({ success: true, notifications, unreadCount });
}

/** PATCH — { notificationId } or { markAllRead: true }. */
export async function PATCH(request: NextRequest) {
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const where = await mine(guard.session);
  const rl = await checkRateLimit(apiRateLimit, `employer-notifications:${guard.session.id}:${guard.session.memberId ?? 'owner'}`);
  if (!rl.success) return NextResponse.json({ success: false, error: rateLimitMessage(rl.reset) }, { status: 429, headers: retryAfterHeaders(rl.reset) });
  const body = await request.json().catch(() => ({}));
  if (body?.markAllRead === true) {
    await prisma.employerNotification.updateMany({ where: { ...where, read: false }, data: { read: true } });
    return NextResponse.json({ success: true });
  }
  if (typeof body?.notificationId !== 'string') return NextResponse.json({ success: false, error: 'Nothing to update.' }, { status: 400 });
  await prisma.employerNotification.updateMany({ where: { ...where, id: body.notificationId }, data: { read: true } });
  return NextResponse.json({ success: true });
}

/** DELETE ?id= — remove one of this person's notes. */
export async function DELETE(request: NextRequest) {
  const guard = await employerApi();
  if (guard.error) return guard.error;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Nothing to remove.' }, { status: 400 });
  await prisma.employerNotification.deleteMany({ where: { ...(await mine(guard.session)), id } });
  return NextResponse.json({ success: true });
}
