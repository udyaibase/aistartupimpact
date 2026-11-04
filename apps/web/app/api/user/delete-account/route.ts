import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { confirmAccountPassword } from '@/lib/founder/account';
import { eraseFounderAccount } from '@/lib/founder/erasure';
import { getUserSession } from '@/lib/user-session';
import { cookies } from 'next/headers';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { password } = body as { password?: unknown };

    const user = await prisma.webUser.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (!(await confirmAccountPassword(user.email.toLowerCase(), password))) {
      return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
    }

    // One person, one erasure: deleting from Profile also erases their founder account.
    const founder = await prisma.founderUser.findUnique({ where: { email: user.email.toLowerCase() }, select: { id: true } });
    if (founder) await eraseFounderAccount(founder.id);

    await prisma.$transaction(async (tx) => {
      await tx.newsletterSubscriber.updateMany({
        where: { email: user.email },
        data: { isActive: false, unsubscribedAt: new Date() },
      });

      await tx.webUser.deleteMany({ where: { id: user.id } });
    });

    const cookieStore = await cookies();
    (await cookieStore).delete('user-token');
    (await cookieStore).delete('unified_session');
    (await cookieStore).delete('founder-token');

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting user account:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
