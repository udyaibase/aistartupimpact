import { NextRequest, NextResponse } from 'next/server';
import { humanCheckFailed } from '@/lib/turnstile';
import { sql } from '@/lib/db';
import { jobApplicationHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const identifier = getClientIdentifier(req);
    const { success: allowed } = await checkRateLimit(apiRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const notHuman = await humanCheckFailed(body?.turnstileToken);
    if (notHuman) return notHuman;
    const {
      type, role, fullName, email, phone,
      resumeLink, resumeUrl, resumeFileName, resumeSizeBytes,
      linkedinUrl, portfolioUrl, consent,
    } = body;

    if (!role || !fullName || !email || (!resumeLink && !resumeUrl)) {
      return NextResponse.json({ error: 'All required fields must be filled' }, { status: 400 });
    }

    // A resume is either a file we stored privately (reference from /api/careers/upload-resume) or an https link.
    // Anything else (javascript:, data:, a made-up reference) is refused: staff click these in the admin app.
    const isStoredResume = (v: unknown) => typeof v === 'string' && /^private:careers\/[0-9a-f-]{36}\.pdf$/.test(v);
    const isHttpsLink = (v: unknown) => { try { return typeof v === 'string' && v.length <= 2000 && new URL(v).protocol === 'https:'; } catch { return false; } };
    if ((resumeUrl && !isStoredResume(resumeUrl)) || (resumeLink && !isStoredResume(resumeLink) && !isHttpsLink(resumeLink))) {
      return NextResponse.json({ error: 'Upload your resume as a PDF, or paste an https link to it.' }, { status: 400 });
    }

    if (typeof email !== 'string' || email.length > 255 || !email.includes('@') || !email.split('@')[1]?.includes('.')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const disposableDomains = ['tempmail', 'throwaway', '10minutemail', 'guerrillamail', 'mailinator'];
    const domain = email.split('@')[1]?.toLowerCase();
    if (disposableDomains.some(d => domain?.includes(d))) {
      return NextResponse.json({ error: 'Please use a valid working email address' }, { status: 400 });
    }

    const existingByEmail = await sql`
      SELECT id FROM "JobApplication"
      WHERE email = ${email} AND role = ${role} AND type = ${type || 'INTERNSHIP'}
      LIMIT 1
    `;

    if (existingByEmail.length > 0) {
      return NextResponse.json({
        error: 'You have already applied for this role with this email. Please check your email for updates or apply for a different role.',
      }, { status: 400 });
    }

    const normalizedName = fullName.trim().toLowerCase().replace(/\s+/g, ' ');
    const existingByName = await sql`
      SELECT id FROM "JobApplication"
      WHERE LOWER(TRIM("fullName")) = ${normalizedName} AND role = ${role} AND type = ${type || 'INTERNSHIP'}
      LIMIT 1
    `;

    if (existingByName.length > 0) {
      return NextResponse.json({
        error: 'An application with this name already exists for this role. If this is you, please check your email for updates.',
      }, { status: 400 });
    }

    const finalResumeLink = resumeUrl || resumeLink;

    try {
      await sql`
        INSERT INTO "JobApplication" (
          id, type, role, "fullName", email, phone, mobile,
          "resumeLink", "resumeUrl", "resumeFileName", "resumeSizeBytes",
          "linkedinUrl", "portfolioUrl", status, "createdAt"
        ) VALUES (
          gen_random_uuid(), ${type || 'INTERNSHIP'}, ${role}, ${fullName}, ${email},
          ${phone || null}, ${phone || null},
          ${finalResumeLink}, ${resumeUrl || null}, ${resumeFileName || null}, ${resumeSizeBytes || null},
          ${linkedinUrl || null}, ${portfolioUrl || null}, 'NEW', NOW()
        )
      `;
      sendEmailFireAndForget({
        to: email,
        subject: `Application received — ${role} at Udyaibase`,
        html: jobApplicationHtml(fullName, role),
        type: 'job_application',
      });
    } catch (dbError: any) {
      console.error('Database insert error:', dbError);
      throw dbError;
    }

    // The newsletter is a separate, optional choice: applying never depends on it. Double opt-in when ticked.
    if (consent === true) try {
      const existing = await sql`
        SELECT id, "isActive", "emailVerified" FROM "NewsletterSubscriber" WHERE email = ${email} LIMIT 1
      `;

      if (existing.length === 0) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com';
        const token = crypto.randomUUID();
        await sql`
          INSERT INTO "NewsletterSubscriber" (
            id, email, name, source, "isActive", "emailVerified", "verificationToken", "subscribedAt", tags,
            "consentAt", "consentText", "consentVersion", "consentSource"
          ) VALUES (
            gen_random_uuid(), ${email}, ${fullName}, 'job_application', false, false, ${token}, NOW(), '{job_application}',
            NOW(), 'I agree to receive the Udyaibase newsletter with AI startup news, tools, and insights.', 1, 'job_application'
          )
          RETURNING id, email
        `;

        const { newsletterConfirmHtml } = await import('@udyaibase/utils');
        const confirmUrl = `${siteUrl}/api/newsletter/confirm?token=${token}`;
        sendEmailFireAndForget({
          to: email,
          subject: 'Confirm your newsletter subscription — Udyaibase',
          html: newsletterConfirmHtml(confirmUrl),
          type: 'newsletter_confirm',
        });
      }
    } catch (subError: any) {
      console.error('Newsletter subscriber error:', subError);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('Job application error:', e);
    return NextResponse.json({ error: 'Failed to submit application. Please try again.' }, { status: 500 });
  }
}
