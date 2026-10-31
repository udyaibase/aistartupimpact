import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { newsletterWelcomeHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { generateUnsubscribeToken } from '@/lib/events/unsubscribe';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return redirectWithStatus(request, 'invalid');
  }

  try {
    const subscribers = await prisma.$queryRaw<any[]>`
      SELECT id, email, "isActive", "emailVerified"
      FROM "NewsletterSubscriber"
      WHERE "verificationToken" = ${token}
      LIMIT 1
    `;

    if (subscribers.length === 0) {
      return redirectWithStatus(request, 'invalid');
    }

    const subscriber = subscribers[0];

    if (subscriber.emailVerified && subscriber.isActive) {
      return redirectWithStatus(request, 'already');
    }

    await prisma.$executeRaw`
      UPDATE "NewsletterSubscriber"
      SET "isActive" = true,
          "emailVerified" = true,
          "verificationToken" = NULL,
          "subscribedAt" = NOW()
      WHERE id = ${subscriber.id}
    `;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';
    const unsubToken = await generateUnsubscribeToken(subscriber.id, subscriber.email);
    const unsubUrl = `${siteUrl}/api/newsletter/unsubscribe?token=${unsubToken}`;

    sendEmailFireAndForget({
      to: subscriber.email,
      subject: 'Welcome to Udyaibase Newsletter!',
      html: newsletterWelcomeHtml(false),
      type: 'newsletter_welcome',
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    return redirectWithStatus(request, 'confirmed');
  } catch (error) {
    console.error('Newsletter confirm error:', error);
    return redirectWithStatus(request, 'error');
  }
}

function redirectWithStatus(request: NextRequest, status: string): NextResponse {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';
  const url = new URL(`${siteUrl}/newsletter/confirm`);
  url.searchParams.set('status', status);
  return NextResponse.redirect(url.toString());
}
