import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { founderApi } from '@/lib/founder/api-session';
import { confirmAccountAction } from '@/lib/founder/account';
import { endAccountSessions } from '@/lib/auth/sessions';
import { eraseFounderAccount } from '@/lib/founder/erasure';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;

    const body = (await request.json().catch(() => ({}))) as { password?: unknown; otpToken?: unknown; code?: unknown };
    const confirmed = await confirmAccountAction(session, body, 'delete');
    if (!confirmed.ok) return NextResponse.json({ success: false, error: confirmed.error }, { status: 401 });

    // Before the records go: end this person's sessions on every device, so no copy of a cookie outlives the account.
    await endAccountSessions(session.email).catch(() => {});
    await eraseFounderAccount(session.userId);

    const store = await cookies();
    store.delete('founder-token');
    store.delete('user-token');
    store.delete('unified_session');

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
