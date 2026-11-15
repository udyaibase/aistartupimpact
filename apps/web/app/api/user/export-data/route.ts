import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getUserSession } from '@/lib/user-session';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await getUserSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const user = await prisma.webUser.findUnique({
      where: { id: session.id },
      select: {
        id: true, email: true, name: true, bio: true,
        twitter: true, linkedin: true, instagram: true, facebook: true, github: true,
        termsAcceptedAt: true, createdAt: true, updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const [reviews, savedJobs, newsletterSubscription, emailLogs, savedTools, savedStartups, savedEvents, savedStories] = await Promise.all([
      prisma.startupReview.findMany({
        where: { userId: user.id },
        select: { id: true, rating: true, title: true, body: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.jobBoardSaved.findMany({
        where: { userId: user.id },
        select: { id: true, createdAt: true },
      }),
      prisma.newsletterSubscriber.findUnique({
        where: { email: user.email },
        select: {
          email: true, isActive: true, emailVerified: true,
          subscribedAt: true, unsubscribedAt: true, source: true,
        },
      }),
      prisma.emailLog.findMany({
        where: { to: user.email },
        select: { type: true, subject: true, status: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 200,
      }),
      prisma.savedTool.findMany({
        where: { userId: user.id },
        select: { toolSlug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.savedStartup.findMany({
        where: { userId: user.id },
        select: { startupSlug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.savedEvent.findMany({
        where: { userId: user.id },
        select: { createdAt: true, Event: { select: { slug: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.savedArticle.findMany({
        where: { userId: user.id },
        select: { createdAt: true, Article: { select: { slug: true, title: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: user,
      reviews,
      savedJobs,
      savedTools,
      savedStartups,
      savedEvents: savedEvents.map((s) => ({ slug: s.Event.slug, title: s.Event.title, savedAt: s.createdAt })),
      savedStories: savedStories.map((s) => ({ slug: s.Article.slug, title: s.Article.title, savedAt: s.createdAt })),
      newsletterSubscription,
      emailsReceived: emailLogs,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="udyaibase-user-data-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('User data export error:', error);
    return NextResponse.json({ success: false, error: 'Failed to export data' }, { status: 500 });
  }
}
