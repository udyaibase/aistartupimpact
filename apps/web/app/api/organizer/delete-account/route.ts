import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getOrganizerSession, destroyOrganizerSession } from '@/lib/organizer-auth';
import { closeAccountProblem, confirmAccountHolder } from '@/lib/organizer-auth/confirm-action';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { DELETION_GRACE_DAYS } from '@/lib/organizer-auth/account-deletion';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await getOrganizerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!organizer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const confirmed = await confirmAccountHolder(organizer, body, 'organizer-delete');
    if (!confirmed.ok) return confirmed.response;

    // Not while people are registered for upcoming events or ticket money is still owed.
    const problem = await closeAccountProblem(organizer.id);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 409 });

    // Not deleted yet: the account is deactivated now and removed after the grace period, unless the owner signs
    // in again and reactivates it (see lib/organizer-auth/account-deletion.ts).
    const now = new Date();
    const deleteOn = new Date(now.getTime() + DELETION_GRACE_DAYS * 864e5);
    await logOrganizerActivity(organizer.id, 'account_deactivated', { actor: organizerActor(session), request, metadata: { what: 'account deletion scheduled', deleteOn: deleteOn.toISOString() } });
    await prisma.$transaction([
      prisma.eventOrganizer.update({ where: { id: organizer.id }, data: { deactivatedAt: now, deletionScheduledAt: deleteOn } }),
      prisma.eventOrganizerSession.deleteMany({ where: { organizerId: organizer.id } }),
    ]);

    const day = deleteOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    sendEmailFireAndForget({
      to: organizer.email,
      subject: 'Your Udyaibase organizer account will be deleted',
      html: `<p>We received a request to delete your Udyaibase organizer account. It is deactivated now and will be deleted for good on <strong>${day}</strong>.</p><p>Changed your mind? Sign in before then and choose to reactivate the account.</p><p>If this wasn't you, sign in, reactivate the account and change your password right away.</p>`,
      type: 'security_alert',
    });

    await destroyOrganizerSession();

    return NextResponse.json({ success: true, deleteOn, message: `Your account is deactivated and will be deleted on ${day}. Sign in before then to cancel.` });
  } catch (error) {
    console.error('Error deleting organizer account:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 });
  }
}
