import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
/**
 * GET /api/founder/notifications
 * Get all notifications for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    // Get query params
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    // A number from 1 to 100; anything else (missing, text, huge) falls back to a safe value.
    const asked = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 100) : 50;

    // Build query
    let query;
    if (unreadOnly) {
      query = sql`
        SELECT id, type, title, message, link, read, "createdAt"
        FROM "FounderNotification"
        WHERE "userId" = ${session.userId} AND read = false
        ORDER BY "createdAt" DESC
        LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT id, type, title, message, link, read, "createdAt"
        FROM "FounderNotification"
        WHERE "userId" = ${session.userId}
        ORDER BY "createdAt" DESC
        LIMIT ${limit}
      `;
    }

    const notifications = await query;

    // Get unread count
    const unreadCount = await sql`
      SELECT COUNT(*) as count
      FROM "FounderNotification"
      WHERE "userId" = ${session.userId} AND read = false
    `;

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount: parseInt(unreadCount[0].count),
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/founder/notifications
 * Mark notification(s) as read
 */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `notifications:${session.userId}`);
    if (limited) return limited;
    const body = await request.json();
    const { notificationId, markAllRead } = body;

    if (markAllRead) {
      // Mark all as read
      await sql`
        UPDATE "FounderNotification"
        SET read = true
        WHERE "userId" = ${session.userId} AND read = false
      `;

      return NextResponse.json({
        success: true,
        message: 'All notifications marked as read',
      });
    } else if (notificationId) {
      // Mark single notification as read
      await sql`
        UPDATE "FounderNotification"
        SET read = true
        WHERE id = ${notificationId} AND "userId" = ${session.userId}
      `;

      return NextResponse.json({
        success: true,
        message: 'Notification marked as read',
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing notificationId or markAllRead' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/founder/notifications
 * Delete notification(s)
 */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `notifications:${session.userId}`);
    if (limited) return limited;
    const { searchParams } = new URL(request.url);
    const notificationId = searchParams.get('id');
    const deleteAll = searchParams.get('deleteAll') === 'true';

    if (deleteAll) {
      // Delete all read notifications
      await sql`
        DELETE FROM "FounderNotification"
        WHERE "userId" = ${session.userId} AND read = true
      `;

      return NextResponse.json({
        success: true,
        message: 'All read notifications deleted',
      });
    } else if (notificationId) {
      // Delete single notification
      await sql`
        DELETE FROM "FounderNotification"
        WHERE id = ${notificationId} AND "userId" = ${session.userId}
      `;

      return NextResponse.json({
        success: true,
        message: 'Notification deleted',
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Missing id or deleteAll parameter' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error deleting notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notifications' },
      { status: 500 }
    );
  }
}
