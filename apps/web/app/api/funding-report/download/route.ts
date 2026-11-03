import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { reportToken } from '@/lib/funding/report';
import { subscribeWithConsent, verifyEmailPass } from '@/lib/funding/access';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, shell } from '@/lib/jobs/apply-emails';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

/**
 * Free Funding Snapshot (PDF). Needs a verified email (pass from the code check) and the required consent box,
 * which also subscribes them to the newsletter (stated in the box's wording).
 */
export async function POST(req: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `funding-report:${getClientIdentifier(req)}`);
  if (!success) return NextResponse.json({ success: false, error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  try {
    const body = await req.json().catch(() => ({}));
    const email = verifyEmailPass(body.pass);
    if (!email) return NextResponse.json({ success: false, error: 'Your email check has expired. Verify your email again.', code: 'PASS_EXPIRED' }, { status: 401 });
    if (body.consent !== true) return NextResponse.json({ success: false, error: 'Please tick the box to agree before downloading.' }, { status: 400 });

    await subscribeWithConsent(email, 'funding_free');

    // Same signed link for the instant download and the email copy (valid 7 days).
    const downloadUrl = `/api/funding-report/pdf?t=${encodeURIComponent(reportToken(email))}`;
    sendEmailFireAndForget({
      to: email,
      subject: 'Your AI Startups Funding Snapshot',
      type: 'funding_report',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your AI Startups Funding Snapshot</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Here’s your free snapshot from the Udyaibase funding tracker: totals, the quarterly trend, and the top sectors, stages, cities and rounds.</p>
<p style="margin:0 0 24px">${button(`${SITE}${downloadUrl}`, 'Download the snapshot (PDF)')}</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Need the latest rounds and every startup in Excel? <a href="${SITE}/funding#funding-data" style="color:#A50F15;font-weight:600">Get the full dataset from ₹199</a>.</p>
<p style="margin:0;font-size:13px;color:#6b7280">The download link works for 7 days.</p>`),
    });

    return NextResponse.json({ success: true, data: { downloadUrl } });
  } catch (error) {
    console.error('Funding report download error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Download failed' }, { status: 500 });
  }
}
