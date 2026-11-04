import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { logFounderActivity } from '@/lib/founder/activity';
import { founderFromUnsubscribeToken } from '@/lib/founder/engagement-run';

export const dynamic = 'force-dynamic';

/**
 * Opts a founder out of tips and reports, from the signed link in an email. POST only, so a mail scanner that opens
 * the link can't unsubscribe anyone. Mail providers call this directly for one-click unsubscribe (RFC 8058).
 */
export async function POST(request: NextRequest) {
  const founderId = await founderFromUnsubscribeToken(request.nextUrl.searchParams.get('token') ?? '');
  if (!founderId) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 400 });
  try {
    await sql`
      INSERT INTO founder_settings (user_id, email_notifications)
      VALUES (${founderId}, false)
      ON CONFLICT (user_id) DO UPDATE SET email_notifications = false, updated_at = NOW()
    `;
    await logFounderActivity(founderId, 'email_tips_changed', { request, metadata: { on: false } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[email-preferences]', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Couldn’t update your preference. Please try again.' }, { status: 500 });
  }
}
