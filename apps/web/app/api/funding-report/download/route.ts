import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { reportToken } from '@/lib/funding/report';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, shell } from '@/lib/jobs/apply-emails';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `funding-report:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ success: false, error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  try {
    const { email, subscribeNewsletter } = await req.json();

    if (!email || typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) {
      return NextResponse.json({ success: false, error: 'Valid email required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase();

    if (subscribeNewsletter) {
      const consentText = 'I agree to receive the Udyaibase newsletter along with the funding report.';
      await prisma.$executeRaw`
        INSERT INTO "NewsletterSubscriber" (id, email, "subscribedAt", source, "isActive", "consentAt", "consentText", "consentVersion", "consentSource")
        VALUES (gen_random_uuid(), ${emailLower}, NOW(), 'funding_report', true, NOW(), ${consentText}, '1.0', 'funding_report_download')
        ON CONFLICT (email)
        DO UPDATE SET "isActive" = true, "subscribedAt" = NOW(), "consentAt" = NOW(), "consentText" = ${consentText}, "consentVersion" = '1.0', "consentSource" = 'funding_report_download'
      `;
    }

    // Same signed link for the instant download and the email copy (valid 7 days).
    const downloadUrl = `/api/funding-report/pdf?t=${encodeURIComponent(reportToken(emailLower))}`;
    sendEmailFireAndForget({
      to: emailLower,
      subject: 'Your AI Startups Funding Report',
      type: 'funding_report',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your AI Startups Funding Report</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Here's the latest report from the Udyaibase funding tracker: totals, stages, sectors, cities, the largest rounds and the most active investors.</p>
<p style="margin:0 0 24px">${button(`${SITE}${downloadUrl}`, 'Download the report (PDF)')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">The link works for 7 days. You can always explore the live data at udyaibase.com/funding.</p>`),
    });

    return NextResponse.json({ success: true, data: { message: 'Report ready.', downloadUrl } });
  } catch (error) {
    console.error('Funding report download error:', error);
    return NextResponse.json({ success: false, error: 'Download failed' }, { status: 500 });
  }
}
