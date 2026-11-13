import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await getOrganizerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const organizer = await prisma.eventOrganizer.findUnique({
      where: { id: session.id },
      select: {
        id: true, name: true, email: true, company: true,
        bio: true, website: true, linkedin: true, phone: true,
        emailVerified: true, status: true, createdAt: true, updatedAt: true,
      },
    });

    if (!organizer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const [events, registrations, newsletterSubscription, emailLogs] = await Promise.all([
      prisma.event.findMany({
        where: { organizerId: organizer.id },
        select: {
          id: true, title: true, slug: true, startAt: true, endAt: true,
          venueName: true, status: true, registrationCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.eventRegistration.findMany({
        where: { event: { organizerId: organizer.id } },
        select: {
          id: true, guestName: true, guestEmail: true, status: true,
          registrationSource: true, eventId: true,
        },
        orderBy: { registeredAt: 'desc' },
        take: 1000,
      }),
      prisma.newsletterSubscriber.findUnique({
        where: { email: organizer.email },
        select: {
          email: true, isActive: true, emailVerified: true,
          subscribedAt: true, unsubscribedAt: true, source: true,
        },
      }),
      prisma.emailLog.findMany({
        where: { to: organizer.email },
        select: { type: true, subject: true, status: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 200,
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: organizer,
      events,
      eventRegistrations: registrations,
      newsletterSubscription,
      emailsReceived: emailLogs,
    };

    await logOrganizerActivity(session.id, 'data_exported', { actor: organizerActor(session), request });
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="udyaibase-organizer-data-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Organizer data export error:', error);
    return NextResponse.json({ success: false, error: 'Failed to export data' }, { status: 500 });
  }
}
