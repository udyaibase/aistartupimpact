import { NextResponse } from 'next/server';
import { humanCheckFailed } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { newsletterSchema, validateInput } from '@/lib/validation';
import { newsletterWelcomeHtml } from '@udyaibase/utils';

export const runtime = 'edge';

const CONSENT_TEXT = 'I agree to receive the Udyaibase newsletter with AI startup news, tools, and insights. You can unsubscribe at any time.';
const CONSENT_VERSION = 1;

function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}


async function sendEmailEdge(to: string, subject: string, html: string, headers?: Record<string, string>, type = 'newsletter') {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  const { Resend } = await import('resend');
  const resend = new Resend(resendKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'no-reply@udyaibase.com';
  const fromName = process.env.RESEND_FROM_NAME || 'Udyaibase';

  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    ...(headers && { headers }),
  });

  // Log to EmailLog (edge-compatible raw SQL via neon)
  try {
    await sql`
      INSERT INTO "EmailLog" (id, type, "to", subject, status, "resendId", error, "sentAt")
      VALUES (gen_random_uuid()::text, ${type}, ${to}, ${subject}, ${error ? 'failed' : 'sent'}, ${data?.id || null}, ${error?.message || null}, NOW())
    `;
  } catch {}
}

export async function POST(request: Request) {
  try {
    const identifier = getClientIdentifier(request);
    const { success: rateLimitSuccess } = await checkRateLimit(apiRateLimit, identifier);
    if (!rateLimitSuccess) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();

    // Required (it was only checked when a token was sent): each sign-up emails a confirmation to the address given.
    const notHuman = await humanCheckFailed(body.turnstileToken);
    if (notHuman) return notHuman;

    const validation = validateInput(newsletterSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const { email, source, name } = validation.data;
    const tags = body.tags;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';

    const existing = await sql`
      SELECT id, "isActive", "emailVerified" FROM "NewsletterSubscriber"
      WHERE email = ${email.toLowerCase()}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const sub = existing[0];

      if (sub.isActive) {
        return NextResponse.json(
          { success: false, error: 'This email is already subscribed' },
          { status: 400 }
        );
      }

      // Re-subscribe (previously unsubscribed)
      await sql`
        UPDATE "NewsletterSubscriber"
        SET "isActive" = true,
            "emailVerified" = true,
            "subscribedAt" = NOW(),
            "unsubscribedAt" = NULL,
            "verificationToken" = NULL,
            source = ${source || 'india-ai'},
            tags = ${tags || ['india-ai']},
            "consentAt" = NOW(),
            "consentText" = ${CONSENT_TEXT},
            "consentVersion" = ${CONSENT_VERSION},
            "consentSource" = ${source || 'website'}
        WHERE email = ${email.toLowerCase()}
      `;

      try {
        await sendEmailEdge(
          email.toLowerCase(),
          'Welcome back to Udyaibase Newsletter!',
          newsletterWelcomeHtml(true),
        );
      } catch (emailError) {
        console.error('Welcome email error:', emailError);
      }

      return NextResponse.json({
        success: true,
        message: "You're subscribed! Welcome back.",
      });
    }

    // New subscriber — activate immediately
    const subscriberId = generateId();

    await sql`
      INSERT INTO "NewsletterSubscriber" (
        id, email, name, source, tags, "isActive", "emailVerified", "verificationToken", "subscribedAt",
        "consentAt", "consentText", "consentVersion", "consentSource"
      ) VALUES (
        ${subscriberId},
        ${email.toLowerCase()},
        ${name || null},
        ${source || 'india-ai'},
        ${tags || ['india-ai']},
        true,
        true,
        NULL,
        NOW(),
        NOW(),
        ${CONSENT_TEXT},
        ${CONSENT_VERSION},
        ${source || 'website'}
      )
    `;

    try {
      await sendEmailEdge(
        email.toLowerCase(),
        'Welcome to Udyaibase Newsletter!',
        newsletterWelcomeHtml(false),
      );
    } catch (emailError) {
      console.error('Welcome email error:', emailError);
    }

    return NextResponse.json({
      success: true,
      message: "You're subscribed! Check your inbox for a welcome email.",
    });
  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to subscribe. Please try again.' },
      { status: 500 }
    );
  }
}
