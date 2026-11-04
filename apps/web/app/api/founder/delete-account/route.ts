import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireFounderAuth } from '@/lib/founder-auth';
import { confirmAccountPassword } from '@/lib/founder/account';
import { eraseFounderAccount } from '@/lib/founder/erasure';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireFounderAuth();

    const body = await request.json().catch(() => ({}));
    if (!(await confirmAccountPassword(session.email.toLowerCase(), (body as { password?: unknown }).password))) {
      return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
    }

    await eraseFounderAccount(session.userId);

    const store = await cookies();
    store.delete('founder-token');
    store.delete('user-token');
    store.delete('unified_session');

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized - Please login') {
      return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
    }
    console.error('Error deleting account:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
