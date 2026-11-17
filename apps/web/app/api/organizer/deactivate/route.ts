import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getOrganizerSession, destroyOrganizerSession } from '@/lib/organizer-auth';
import { closeAccountProblem, confirmAccountHolder } from '@/lib/organizer-auth/confirm-action';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await getOrganizerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: session.id },
      select: { id: true, email: true, passwordHash: true, deactivatedAt: true },
    });

    if (!organizer) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (organizer.deactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated' }, { status: 400 });
    }

    const confirmed = await confirmAccountHolder(organizer, body, 'organizer-deactivate');
    if (!confirmed.ok) return confirmed.response;

    // Deactivating takes upcoming events offline; not while people are registered for them.
    const problem = await closeAccountProblem(organizer.id);
    if (problem) return NextResponse.json({ success: false, error: problem }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.eventOrganizer.update({
        where: { id: session.id },
        data: { deactivatedAt: new Date() },
      });

      await tx.event.updateMany({
        where: {
          organizerId: session.id,
          startAt: { gte: new Date() },
          status: 'PUBLISHED',
        },
        data: { status: 'DRAFT' },
      });

      await tx.eventOrganizerSession.deleteMany({
        where: { organizerId: session.id },
      });
    });

    await destroyOrganizerSession();

    await logOrganizerActivity(session.id, 'account_deactivated', { actor: organizerActor(session), request });
    return NextResponse.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    console.error('Organizer deactivation error:', error);
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 });
  }
}
