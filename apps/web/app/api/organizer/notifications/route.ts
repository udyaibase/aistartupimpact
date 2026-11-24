import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { apiRateLimit, checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET /api/organizer/notifications — the workspace's latest notes and how many are unread. */
export async function GET() {
  const result = await requirePermission('events.view');
  if (result instanceof NextResponse) return result;
  const where = { organizerId: result.organizerId };
  const [notifications, unreadCount] = await Promise.all([
    prisma.organizerNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, type: true, title: true, message: true, link: true, read: true, createdAt: true } }),
    prisma.organizerNotification.count({ where: { ...where, read: false } }),
  ]);
  return NextResponse.json({ success: true, notifications, unreadCount });
}

/** PATCH /api/organizer/notifications — { notificationId } or { markAllRead: true }. */
export async function PATCH(request: NextRequest) {
  const result = await requirePermission('events.view');
  if (result instanceof NextResponse) return result;
  const rl = await checkRateLimit(apiRateLimit, `organizer-notifications:${result.organizerId}`);
  if (!rl.success) return NextResponse.json({ success: false, error: rateLimitMessage(rl.reset) }, { status: 429, headers: retryAfterHeaders(rl.reset) });
  const body = await request.json().catch(() => ({}));
  if (body?.markAllRead === true) {
    await prisma.organizerNotification.updateMany({ where: { organizerId: result.organizerId, read: false }, data: { read: true } });
    return NextResponse.json({ success: true });
  }
  if (typeof body?.notificationId !== 'string') return NextResponse.json({ success: false, error: 'Nothing to update.' }, { status: 400 });
  // Scoped to the workspace: an id from another workspace changes nothing.
  await prisma.organizerNotification.updateMany({ where: { id: body.notificationId, organizerId: result.organizerId }, data: { read: true } });
  return NextResponse.json({ success: true });
}

/** DELETE /api/organizer/notifications?id=… — remove one note. */
export async function DELETE(request: NextRequest) {
  const result = await requirePermission('events.view');
  if (result instanceof NextResponse) return result;
  const rl = await checkRateLimit(apiRateLimit, `organizer-notifications:${result.organizerId}`);
  if (!rl.success) return NextResponse.json({ success: false, error: rateLimitMessage(rl.reset) }, { status: 429, headers: retryAfterHeaders(rl.reset) });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'Missing id.' }, { status: 400 });
  await prisma.organizerNotification.deleteMany({ where: { id, organizerId: result.organizerId } });
  return NextResponse.json({ success: true });
}
