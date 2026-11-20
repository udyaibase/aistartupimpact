import crypto from 'node:crypto';
import { prisma } from '@udyaibase/database';
import { sendEmailBatch, sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { checkRateLimit } from '@/lib/rate-limit';
import { careersConfirmPerEmailRateLimit } from '@/lib/event-rate-limit';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';
import { publicListingWhere } from '@/lib/jobs/public';
import { isClaimVerified, showsVerifiedTick } from '@/lib/jobs/trust';
import { alertTitle, JOB_ALERT_CONSENT } from '@/lib/jobs/job-alert-text';

export { alertTitle, JOB_ALERT_CONSENT };

/**
 * Weekly job alerts for site visitors: "AI Engineer jobs in Bengaluru", sent once a week with new matching jobs.
 * Double opt-in: only confirmed alerts are emailed, and every email has a one-click unsubscribe.
 * Link tokens are an HMAC of the alert id, stored as their sha256 (nothing secret in the database).
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;
/** One person can keep at most this many alerts. */
export const MAX_ALERTS_PER_EMAIL = 5;
/** Jobs per email; the rest are behind "See all". */
const JOBS_PER_EMAIL = 8;
const RESEND_AFTER_MS = 60 * 60 * 1000;


function secret(): string {
  const s = process.env.EMPLOYER_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('EMPLOYER_JWT_SECRET is not configured');
  return s;
}
export const alertToken = (id: string) => crypto.createHmac('sha256', secret()).update(`job-alert:${id}`).digest('base64url');
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export const jobAlertLink = (token: string, action: 'confirm' | 'unsubscribe') => `${SITE}/job-alerts/weekly?t=${encodeURIComponent(token)}&a=${action}`;
const oneClickLink = (token: string) => `${SITE}/api/jobs/alerts/unsubscribe?t=${encodeURIComponent(token)}`;

export interface AlertFilters { category: string | null; city: string | null; remoteOnly: boolean }

export function cleanFilters(b: { category?: unknown; city?: unknown; remoteOnly?: unknown }): AlertFilters {
  const category = typeof b.category === 'string' && JOB_CATEGORIES.some((c) => c.value === b.category) ? b.category : null;
  const city = typeof b.city === 'string' ? b.city.trim().replace(/\s+/g, ' ').slice(0, 80) || null : null;
  return { category, city, remoteOnly: b.remoteOnly === true };
}

/**
 * Adds the alert (or re-confirms an old one) and sends the confirmation email.
 * Resolves the same way whether or not the address already had alerts, so it can't be used to probe who signed up.
 */
export async function subscribeToJobAlert(email: string, f: AlertFilters): Promise<'ok' | 'limit'> {
  const workType = f.remoteOnly ? 'REMOTE' : null;
  const city = f.remoteOnly ? null : f.city;
  const existing = await prisma.jobAlertSubscription.findFirst({
    where: { email, category: f.category, city, workType },
    select: { id: true, confirmedAt: true, unsubscribedAt: true, consentAt: true },
  });
  let id: string;
  if (!existing) {
    const active = await prisma.jobAlertSubscription.count({ where: { email, unsubscribedAt: null } });
    if (active >= MAX_ALERTS_PER_EMAIL) return 'limit';
    id = crypto.randomUUID();
    await prisma.jobAlertSubscription.create({
      data: { id, email, category: f.category, city, workType, consentText: JOB_ALERT_CONSENT, tokenHash: hashToken(alertToken(id)) },
    });
  } else {
    if (existing.confirmedAt && !existing.unsubscribedAt) return 'ok';
    if (!existing.unsubscribedAt && Date.now() - existing.consentAt.getTime() < RESEND_AFTER_MS) return 'ok';
    id = existing.id;
    await prisma.jobAlertSubscription.update({ where: { id }, data: { consentAt: new Date(), consentText: JOB_ALERT_CONSENT, confirmedAt: null, unsubscribedAt: null } });
  }
  const { success } = await checkRateLimit(careersConfirmPerEmailRateLimit, email);
  if (!success) return 'ok';
  const title = alertTitle({ category: f.category, city, workType });
  sendEmailFireAndForget({
    to: email,
    subject: `Confirm your job alert: ${title}`,
    type: 'job_alert_confirm',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Confirm your job alert</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">You asked for a weekly email of new <strong>${esc(title)}</strong> on Udyaibase. Confirm to turn it on.</p>
<p style="margin:0 0 24px">${button(jobAlertLink(alertToken(id), 'confirm'), 'Confirm my alert')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">Didn’t ask for this? Ignore this email and you won’t hear from us.</p>`),
  });
  return 'ok';
}

async function byToken(token: string) {
  if (!token || token.length > 100) return null;
  return prisma.jobAlertSubscription.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, category: true, city: true, workType: true, confirmedAt: true, unsubscribedAt: true } });
}

export async function confirmJobAlert(token: string): Promise<{ ok: true; title: string } | { ok: false }> {
  const a = await byToken(token);
  if (!a) return { ok: false };
  // From now on, only jobs published after confirming count as new.
  if (!a.confirmedAt || a.unsubscribedAt) await prisma.jobAlertSubscription.update({ where: { id: a.id }, data: { confirmedAt: new Date(), unsubscribedAt: null, lastSentAt: new Date() } });
  return { ok: true, title: alertTitle(a) };
}

export async function unsubscribeJobAlert(token: string): Promise<{ ok: true; title: string } | { ok: false }> {
  const a = await byToken(token);
  if (!a) return { ok: false };
  if (!a.unsubscribedAt) await prisma.jobAlertSubscription.update({ where: { id: a.id }, data: { unsubscribedAt: new Date() } });
  return { ok: true, title: alertTitle(a) };
}

/** New public jobs for one alert since its last email, newest first, with the company's verified tick. */
export async function jobsForAlert(a: { category: string | null; city: string | null; workType: string | null }, since: Date, now = new Date()) {
  const rows = await prisma.jobBoardListing.findMany({
    where: {
      ...publicListingWhere(now), isGeneral: false, showOnJobsPage: true, publishedAt: { gt: since },
      ...(a.category ? { category: a.category as never } : {}),
      ...(a.workType === 'REMOTE' ? { workType: 'REMOTE' as const } : {}),
      ...(a.city ? { OR: [{ city: { equals: a.city, mode: 'insensitive' as const } }, { workType: 'REMOTE' as const }] } : {}),
    },
    orderBy: { publishedAt: 'desc' },
    take: JOBS_PER_EMAIL + 1,
    select: {
      title: true, slug: true, city: true, workType: true,
      Employer: { select: { companyName: true, isVerified: true, startupId: true, startupClaimMethod: true, Startup: { select: { name: true } } } },
    },
  });
  return rows.map((j) => {
    const verified = showsVerifiedTick(j.Employer);
    return {
      title: j.title, slug: j.slug,
      company: (isClaimVerified(j.Employer) && j.Employer.Startup?.name) || j.Employer.companyName,
      where: j.workType === 'REMOTE' ? 'Remote' : j.city ?? '',
      verified,
    };
  });
}

export function jobAlertEmail(title: string, jobs: Awaited<ReturnType<typeof jobsForAlert>>, token: string, searchHref: string) {
  const list = jobs.slice(0, JOBS_PER_EMAIL).map((j) => `<li style="margin:0 0 12px">
<a href="${SITE}/jobs/${encodeURIComponent(j.slug)}?utm_source=job_alert&utm_medium=email" style="color:#111827;font-weight:600;text-decoration:none">${esc(j.title)}</a><br>
<span style="font-size:13px;color:#6b7280">${esc(j.company)}${j.verified ? ' <span style="color:#3b82f6" title="Verified company">✔ Verified</span>' : ''}${j.where ? ` · ${esc(j.where)}` : ''}</span></li>`).join('');
  return {
    subject: `${jobs.length > JOBS_PER_EMAIL ? `${JOBS_PER_EMAIL}+` : jobs.length} new ${title}`.replace(/[\r\n]+/g, ' '),
    html: shell(`
<p style="margin:0 0 4px;font-size:13px;color:#6b7280">Your weekly job alert</p>
<h1 style="font-size:20px;margin:0 0 16px">New ${esc(title)}</h1>
<ul style="margin:0 0 20px;padding:0;list-style:none;font-size:15px;line-height:1.4">${list}</ul>
<p style="margin:0 0 24px">${button(searchHref, 'See all matching jobs')}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">You get this because you set up this alert on Udyaibase. <a href="${jobAlertLink(token, 'unsubscribe')}" style="color:#6b7280">Stop this alert</a></p>`),
    headers: { 'List-Unsubscribe': `<${oneClickLink(token)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Weekly run: one email per confirmed alert that has new jobs. Alerts are marked sent before sending, so a retry never doubles. */
export async function runJobAlerts(now = new Date(), opts: { limit?: number } = {}) {
  const cutoff = new Date(now.getTime() - 6 * DAY);
  const alerts = await prisma.jobAlertSubscription.findMany({
    where: { confirmedAt: { not: null }, unsubscribedAt: null, OR: [{ lastSentAt: null }, { lastSentAt: { lt: cutoff } }] },
    orderBy: { lastSentAt: { sort: 'asc', nulls: 'first' } },
    take: opts.limit ?? 2000,
    select: { id: true, email: true, category: true, city: true, workType: true, lastSentAt: true, confirmedAt: true },
  });
  let sent = 0, empty = 0;
  const batch: Parameters<typeof sendEmailBatch>[0] = [];
  for (const a of alerts) {
    const since = a.lastSentAt ?? a.confirmedAt ?? new Date(now.getTime() - 7 * DAY);
    const claimed = await prisma.jobAlertSubscription.updateMany({ where: { id: a.id, OR: [{ lastSentAt: null }, { lastSentAt: { lt: cutoff } }] }, data: { lastSentAt: now } });
    if (!claimed.count) continue;
    const jobs = await jobsForAlert(a, since, now);
    if (!jobs.length) { empty++; continue; }
    const q = new URLSearchParams({ ...(a.category ? { category: a.category } : {}), ...(a.city ? { city: a.city } : {}), ...(a.workType === 'REMOTE' ? { workType: 'REMOTE' } : {}) });
    const e = jobAlertEmail(alertTitle(a), jobs, alertToken(a.id), `${SITE}/jobs?${q}`);
    batch.push({ to: a.email, subject: e.subject, html: e.html, headers: e.headers, type: 'job_alert_weekly' });
  }
  for (let i = 0; i < batch.length; i += 100) {
    const res = await sendEmailBatch(batch.slice(i, i + 100), { idempotencyKey: `job-alerts:${now.toISOString().slice(0, 10)}:${i / 100}` });
    sent += res.filter((r) => r.success).length;
  }
  return { alerts: alerts.length, sent, empty };
}
