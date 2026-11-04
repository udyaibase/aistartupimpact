import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { logFounderActivity } from '@/lib/founder/activity';
import { isTwoFactorOn } from '@/lib/auth/account-two-factor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireFounderAuth();

    const user = await prisma.founderUser.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        bio: true,
        avatar: true,
        linkedin: true,
        twitter: true,
        website: true,
        company: true,
        previousCompany: true,
        companyEmail: true,
        authProvider: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const [startups, tools, analytics, notifications, newsletterSubscription, emailLogs] = await Promise.all([
      prisma.startup.findMany({
        where: { ownerId: session.userId },
        select: {
          id: true, name: true, slug: true, tagline: true, description: true,
          websiteUrl: true, stage: true, foundedYear: true,
          headquartersCity: true, employeeCount: true, founders: true, foundersData: true, socialLinks: true,
          claimStatus: true, isVerified: true, verifiedDomain: true, claimedAt: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.aiTool.findMany({
        where: { ownerId: session.userId },
        select: {
          id: true, name: true, slug: true, tagline: true, description: true,
          pricingModel: true, status: true, listingTier: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.$queryRaw`
        SELECT "entityType", "entityId", date, views, clicks, shares
        FROM "AnalyticsDaily"
        WHERE ("entityType" = 'STARTUP' AND "entityId" IN (SELECT id FROM "Startup" WHERE "ownerId" = ${session.userId}))
           OR ("entityType" = 'TOOL' AND "entityId" IN (SELECT id FROM "AiTool" WHERE "ownerId" = ${session.userId}))
        ORDER BY date DESC LIMIT 2000
      `,
      prisma.founderNotification.findMany({
        where: { userId: session.userId },
        select: {
          id: true, type: true, title: true, message: true,
          read: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.newsletterSubscriber.findUnique({
        where: { email: user.email },
        select: {
          email: true, isActive: true, emailVerified: true,
          subscribedAt: true, unsubscribedAt: true, source: true, tags: true,
        },
      }),
      prisma.emailLog.findMany({
        where: { to: user.email },
        select: { type: true, subject: true, status: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 200,
      }),
    ]);

    const [settings, team, milestones, content, tickets, verificationLogs, activityLog, payments, webAccount] = await Promise.all([
      prisma.founder_settings.findFirst({ where: { user_id: session.userId }, select: { public_profile: true } }),
      prisma.founderTeamMember.findMany({ where: { founderId: session.userId }, select: { email: true, name: true, role: true, status: true, createdAt: true } }),
      prisma.founderMilestone.findMany({ where: { founderId: session.userId }, select: { type: true, title: true, description: true, date: true, status: true, createdAt: true } }),
      prisma.article.findMany({
        where: { OR: [{ submittedById: session.userId }, { founderAuthorId: session.userId }] },
        select: { title: true, slug: true, type: true, status: true, content: true, createdAt: true, publishedAt: true },
      }),
      prisma.supportTicket.findMany({ where: { submitterId: session.userId }, select: { ticketNumber: true, subject: true, description: true, status: true, createdAt: true } }),
      prisma.startupVerificationLog.findMany({ where: { userId: session.userId }, select: { action: true, method: true, success: true, ipAddress: true, createdAt: true } }),
      prisma.founderActivityLog.findMany({ where: { founderId: session.userId }, select: { action: true, ipAddress: true, userAgent: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.advPayment.findMany({ where: { founderId: session.userId }, select: { purpose: true, totalPaise: true, currency: true, createdAt: true } }),
      prisma.webUser.findUnique({ where: { email: user.email }, select: { termsAcceptedAt: true, termsVersion: true } }),
    ]);

    const listingChanges = await prisma.listingVersion.findMany({ where: { actorId: session.userId }, select: { entityType: true, entityId: true, changedFields: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 });

    await logFounderActivity(session.userId, 'data_exported', { request });

    const exportData = {
      exportedAt: new Date().toISOString(),
      twoFactorSignIn: await isTwoFactorOn(user.email),
      consent: { termsAcceptedAt: webAccount?.termsAcceptedAt ?? null, termsVersion: webAccount?.termsVersion ?? null },
      sharedWith: 'The service providers we share data with are listed in section 4 of https://udyaibase.com/privacy',
      settings,
      team,
      listingChanges,
      milestones,
      content,
      supportTickets: tickets,
      verificationLogs,
      securityActivity: activityLog,
      payments,
      profile: user,
      startups,
      tools,
      analytics,
      notifications,
      newsletterSubscription,
      emailsReceived: emailLogs,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="udyaibase-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
