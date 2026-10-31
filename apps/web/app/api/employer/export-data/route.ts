import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireEmployerAuth } from '@/lib/employer-auth';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const identifier = getClientIdentifier(request);
    const { success } = await checkRateLimit(strictRateLimit, identifier);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });

    const session = await requireEmployerAuth();
    if (!can(session.role, 'account.manage')) return forbidden();

    const employer = await prisma.jobBoardEmployer.findUnique({
      where: { id: session.id },
      select: {
        id: true, companyName: true, slug: true, email: true,
        description: true, websiteUrl: true, industry: true, companySize: true,
        location: true, country: true, linkedinUrl: true, twitterUrl: true,
        logoUrl: true, plan: true, createdAt: true, updatedAt: true,
      },
    });

    if (!employer) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const [listings, applications, newsletterSubscription, emailLogs] = await Promise.all([
      prisma.jobBoardListing.findMany({
        where: { employerId: employer.id },
        select: {
          id: true, title: true, slug: true, location: true, workType: true,
          status: true, applicationsCount: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.jobBoardApplication.findMany({
        where: { Listing: { employerId: employer.id } },
        select: {
          id: true, fullName: true, email: true, status: true, appliedAt: true,
          listingId: true,
        },
        orderBy: { appliedAt: 'desc' },
        take: 500,
      }),
      prisma.newsletterSubscriber.findUnique({
        where: { email: employer.email },
        select: {
          email: true, isActive: true, emailVerified: true,
          subscribedAt: true, unsubscribedAt: true, source: true,
        },
      }),
      prisma.emailLog.findMany({
        where: { to: employer.email },
        select: { type: true, subject: true, status: true, sentAt: true },
        orderBy: { sentAt: 'desc' },
        take: 200,
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      company: employer,
      jobListings: listings,
      applicationsReceived: applications,
      newsletterSubscription,
      emailsReceived: emailLogs,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="udyaibase-employer-data-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Employer data export error:', error);
    return NextResponse.json({ success: false, error: 'Failed to export data' }, { status: 500 });
  }
}
