import { SignJWT } from 'jose';
import { sendEmail, sendEmailWithRetry, sendEmailFireAndForget } from './email/send';
import {
  verificationEmailHtml,
  passwordResetHtml,
  submissionReceivedHtml,
  startupApprovalHtml,
  toolApprovalHtml,
} from '@udyaibase/utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateNewsletterUnsubscribeToken(email: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(secret);
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const verifyUrl = `${SITE_URL}/auth/verify?token=${token}`;
  const result = await sendEmailWithRetry({
    to: email,
    subject: 'Verify your email - Udyaibase',
    html: verificationEmailHtml(name, verifyUrl),
    type: 'verification',
  });
  if (!result.success) throw new Error(result.error);
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const resetUrl = `${SITE_URL}/auth/reset-password?token=${token}`;
  const result = await sendEmailWithRetry({
    to: email,
    subject: 'Reset your password - Udyaibase',
    html: passwordResetHtml(name, resetUrl),
    type: 'password_reset',
  });
  if (!result.success) throw new Error(result.error);
}

export async function sendSubmissionReceivedEmail(
  email: string,
  name: string,
  entityType: 'startup' | 'tool',
  entityName: string
) {
  sendEmailFireAndForget({
    to: email,
    subject: `We received your ${entityType} submission!`,
    html: submissionReceivedHtml(name, entityType, entityName),
    type: 'submission_received',
  });
}

export async function sendApprovalEmail(
  email: string,
  name: string,
  entityType: 'startup' | 'tool',
  entityName: string,
  entitySlug: string
) {
  const html = entityType === 'startup'
    ? startupApprovalHtml(entityName, name, entitySlug)
    : toolApprovalHtml(entityName, name, entitySlug);

  sendEmailFireAndForget({
    to: email,
    subject: `Your ${entityType} "${entityName}" is now live on Udyaibase`,
    html,
    type: 'approval',
  });
}

/** Tell the Udyaibase team a founder submitted (or edited a live) startup or tool that needs review. */
export function sendAdminReviewAlert(opts: {
  entityType: 'startup' | 'tool';
  entityName: string;
  founderEmail: string;
  reason: 'new' | 'edited';
}) {
  const to = process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com';
  const adminUrl = (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');
  const queue = `${adminUrl}/${opts.entityType === 'startup' ? 'startups-dir' : 'tools-dir'}?status=PENDING`;
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const what = opts.reason === 'new' ? `New ${opts.entityType} submitted` : `Live ${opts.entityType} edited, needs re-approval`;
  sendEmailFireAndForget({
    to,
    subject: `${what}: ${opts.entityName}`,
    type: 'admin_review_alert',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:18px;margin:0 0 8px">${esc(what)}</h1>
<p style="margin:0 0 6px;font-size:15px"><strong>${esc(opts.entityName)}</strong></p>
<p style="margin:0 0 20px;font-size:14px;color:#4b5563">From ${esc(opts.founderEmail)}</p>
<p style="margin:0"><a href="${queue}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Open the review queue</a></p>
</div>`,
  });
}

/** Founder: changes to a live startup are saved and will go live after a quick review. */
export function sendChangesUnderReviewEmail(email: string, name: string, entityName: string) {
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  sendEmailFireAndForget({
    to: email,
    subject: `We received your changes to ${entityName}`,
    type: 'submission_received',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:18px;margin:0 0 8px">Thanks${name ? `, ${esc(name.split(' ')[0])}` : ''}. Your changes are saved</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Because <strong>${esc(entityName)}</strong> is live, our team reviews edits before they appear on Udyaibase. This usually takes less than a working day. We’ll email you when it’s approved.</p>
<p style="margin:0"><a href="${SITE_URL}/founder/startups" style="color:#A50F15">Go to My Startups</a></p>
</div>`,
  });
}
