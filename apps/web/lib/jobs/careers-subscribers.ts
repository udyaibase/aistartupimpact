import crypto from 'node:crypto';
import { prisma } from '@udyaibase/database';
import { sendEmailBatch, sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { notifyConsentText } from '@/lib/jobs/careers-notify-text';
import { checkRateLimit } from '@/lib/rate-limit';
import { careersConfirmPerEmailRateLimit } from '@/lib/event-rate-limit';
import { publicListingWhere } from '@/lib/jobs/public';
import { getCareersCompany } from '@/lib/jobs/careers';

/**
 * "Get notified when {company} is hiring": double opt-in sign-ups from the careers widget and company page.
 * Only confirmed, subscribed addresses are emailed, and each email has a one-click unsubscribe link.
 * Links carry an HMAC of the subscriber id (nothing to store), looked up by its sha256.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
/** A pending sign-up gets at most one confirmation email per hour. */
const RESEND_AFTER_MS = 60 * 60 * 1000;
/** Someone is emailed about new roles at most once a day per company, however many jobs go live. */
const NOTIFY_GAP_MS = 24 * 60 * 60 * 1000;


function secret(): string {
  const s = process.env.EMPLOYER_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('EMPLOYER_JWT_SECRET is not configured');
  return s;
}
export const subscriberToken = (id: string) => crypto.createHmac('sha256', secret()).update(`careers-notify:${id}`).digest('base64url');
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export const alertLink = (token: string, action: 'confirm' | 'unsubscribe') => `${SITE}/job-alerts?t=${encodeURIComponent(token)}&a=${action}`;
const oneClickLink = (token: string) => `${SITE}/api/jobs/notify/unsubscribe?t=${encodeURIComponent(token)}`;

/** Names go into subject lines: keep them on one line. */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim();

export function normalizeEmail(v: unknown): string | null {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return EMAIL_RE.test(e) ? e : null;
}

/**
 * Adds or refreshes a sign-up and sends the confirmation email when needed.
 * Always resolves the same way whether or not the address was already on the list (no way to probe who signed up).
 */
export async function subscribeToCareers(opts: { employerId: string; company: string; email: string; source: 'WIDGET' | 'CAREERS_PAGE' }): Promise<void> {
  const consentText = notifyConsentText(opts.company);
  const existing = await prisma.jobBoardCareersSubscriber.findUnique({
    where: { employerId_email: { employerId: opts.employerId, email: opts.email } },
    select: { id: true, confirmedAt: true, unsubscribedAt: true, consentAt: true },
  });

  let id: string;
  if (!existing) {
    id = crypto.randomUUID();
    try {
      await prisma.jobBoardCareersSubscriber.create({
        data: { id, employerId: opts.employerId, email: opts.email, source: opts.source, consentText, tokenHash: hashToken(subscriberToken(id)) },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') return; // signed up twice at once
      throw err;
    }
  } else {
    if (existing.confirmedAt && !existing.unsubscribedAt) return; // already on the list
    if (!existing.unsubscribedAt && Date.now() - existing.consentAt.getTime() < RESEND_AFTER_MS) return; // email just sent
    id = existing.id;
    await prisma.jobBoardCareersSubscriber.update({
      where: { id },
      data: { consentAt: new Date(), consentText, source: opts.source, unsubscribedAt: null, confirmedAt: null },
    });
  }

  // Cap confirmation emails per address across all companies, so sign-ups can't be used to flood someone's inbox.
  const { success: allowed } = await checkRateLimit(careersConfirmPerEmailRateLimit, opts.email);
  if (!allowed) return;

  const token = subscriberToken(id);
  sendEmailFireAndForget({
    to: opts.email,
    subject: `Confirm: get notified when ${oneLine(opts.company)} is hiring`,
    type: 'careers_notify_confirm',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Confirm your email</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">You asked to hear when <strong>${esc(opts.company)}</strong> posts a new role. Confirm your email to turn this on.</p>
<p style="margin:0 0 24px">${button(alertLink(token, 'confirm'), 'Confirm my email')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">Didn't ask for this? Ignore this email and you won't hear from us.</p>`),
  });
}

type TokenResult = { ok: true; company: string; slug: string } | { ok: false };

async function byToken(token: string) {
  if (!token || token.length > 100) return null;
  return prisma.jobBoardCareersSubscriber.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, confirmedAt: true, unsubscribedAt: true, Employer: { select: { companyName: true, slug: true } } },
  });
}

export async function confirmCareersSubscription(token: string): Promise<TokenResult> {
  const s = await byToken(token);
  if (!s) return { ok: false };
  if (!s.confirmedAt || s.unsubscribedAt) {
    await prisma.jobBoardCareersSubscriber.update({ where: { id: s.id }, data: { confirmedAt: new Date(), unsubscribedAt: null } });
  }
  return { ok: true, company: s.Employer.companyName, slug: s.Employer.slug };
}

export async function unsubscribeCareers(token: string): Promise<TokenResult> {
  const s = await byToken(token);
  if (!s) return { ok: false };
  if (!s.unsubscribedAt) await prisma.jobBoardCareersSubscriber.update({ where: { id: s.id }, data: { unsubscribedAt: new Date() } });
  return { ok: true, company: s.Employer.companyName, slug: s.Employer.slug };
}

/** Tells confirmed subscribers that a role went live (at most once a day each). Never throws. */
export async function notifyCareersSubscribers(employerId: string, job: { title: string; slug: string }): Promise<number> {
  try {
    // The same company name candidates saw when signing up (a verified startup's own name); null when deactivated.
    const company = await getCareersCompany({ id: employerId });
    if (!company) return 0;
    const employer = { companyName: oneLine(company.name), slug: company.slug };
    // Only for a role candidates can actually open (not held for review, hidden or already closed).
    const live = await prisma.jobBoardListing.count({ where: { ...publicListingWhere(), employerId, slug: job.slug } });
    if (!live) return 0;
    const since = new Date(Date.now() - NOTIFY_GAP_MS);
    let sent = 0;
    // Each batch is marked as notified, so it drops out of the next query (no cursor needed; a failed send is not retried).
    for (;;) {
      const subs = await prisma.jobBoardCareersSubscriber.findMany({
        where: { employerId, confirmedAt: { not: null }, unsubscribedAt: null, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: since } }] },
        select: { id: true, email: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!subs.length) break;
      const company = esc(employer.companyName);
      await sendEmailBatch(subs.map((s) => {
        const token = subscriberToken(s.id);
        return {
          to: s.email,
          subject: `${employer.companyName} is hiring: ${oneLine(job.title)}`,
          type: 'careers_notify_new_role',
          headers: { 'List-Unsubscribe': `<${oneClickLink(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${company} is hiring</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">A new role just opened: <strong>${esc(job.title)}</strong>.</p>
<p style="margin:0 0 16px">${button(`${SITE}/jobs/${encodeURIComponent(job.slug)}?utm_source=careers_notify&utm_medium=email`, 'View the role')}</p>
<p style="margin:0 0 24px;font-size:14px"><a href="${SITE}/jobs/company/${encodeURIComponent(employer.slug)}" style="color:#A50F15">See every open role at ${company}</a></p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">You get this because you asked to hear when ${company} is hiring. <a href="${alertLink(token, 'unsubscribe')}" style="color:#6b7280">Unsubscribe</a></p>`),
        };
      }), { idempotencyKey: `careers-notify:${employerId}:${job.slug}:${subs[0].id}` });
      await prisma.jobBoardCareersSubscriber.updateMany({ where: { id: { in: subs.map((s) => s.id) } }, data: { lastNotifiedAt: new Date() } });
      sent += subs.length;
    }
    return sent;
  } catch (err) {
    console.error('[careers-notify] failed', employerId, err);
    return 0;
  }
}
