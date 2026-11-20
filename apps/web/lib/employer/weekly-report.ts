import { createHmac, timingSafeEqual } from 'crypto';
import { IN_PIPELINE } from '@/lib/employer/stages';
import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { isRealInbox } from '@/lib/employer/owners';
import { employerContext, loadTopTen } from '@/lib/employer/applications';
import { ACTIVE_WAITING, WAIT_RED_DAYS } from '@/lib/employer/pipeline';

/**
 * The Monday hiring report: one email per owner and recruiter who has it on, about the whole workspace.
 * Interviewers never get it (it names candidates from every job).
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;
/** Estimated minutes a person spends reading one resume against a job; shown as an estimate. */
export const MINUTES_PER_AI_REVIEW = 4;
/** A workspace gets at most one report per this many days, so a retried job never sends twice. */
const MIN_GAP_DAYS = 6;

// ── Signed one-click unsubscribe ───────────────────────────────────

export type ReportRecipient = { kind: 'workspace' | 'member'; id: string };

function secret(): string {
  const s = process.env.EMPLOYER_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('EMPLOYER_JWT_SECRET is not configured');
  return s;
}

export function reportToken(r: ReportRecipient): string {
  return createHmac('sha256', secret()).update(`weekly-report:off:${r.kind}:${r.id}`).digest('base64url');
}

export function verifyReportToken(r: ReportRecipient, token: string): boolean {
  if (!r.id || !token) return false;
  try {
    const want = Buffer.from(reportToken(r));
    const got = Buffer.from(token);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

const params = (r: ReportRecipient) => new URLSearchParams({ k: r.kind, id: r.id, t: reportToken(r) });
/** Page with a button (email scanners can't turn it off by following the link). */
export const reportUnsubscribePage = (r: ReportRecipient) => `${SITE}/hiring-report/unsubscribe?${params(r)}`;
/** RFC 8058 one-click target for the List-Unsubscribe header. */
export const reportOneClickUrl = (r: ReportRecipient) => `${SITE}/api/employer/weekly-report/unsubscribe?${params(r)}`;

export async function turnOffReport(r: ReportRecipient): Promise<boolean> {
  if (r.kind === 'workspace') {
    const res = await prisma.jobBoardEmployer.updateMany({ where: { id: r.id }, data: { weeklyReport: false } });
    return res.count > 0;
  }
  const res = await prisma.jobBoardTeamMember.updateMany({ where: { id: r.id }, data: { weeklyReport: false } });
  return res.count > 0;
}

// ── Contents ───────────────────────────────────────────────────────

export interface WeeklyReport {
  company: string;
  applications: number;
  aiReviewed: number;
  aiShortlisted: number;
  hoursSaved: number;
  waitingLong: number;
  holdDue: number;
  openJobs: number;
  hires: number;
  top: { name: string; job: string; reason: string | null }[];
}

export async function buildWeeklyReport(employerId: string, now = new Date()): Promise<WeeklyReport> {
  const t = now.getTime();
  const weekAgo = new Date(t - 7 * DAY);
  const notErased = { NOT: { email: { endsWith: '@deleted.invalid' } } };
  const mine = { Listing: { employerId, deletedAt: null }, ...IN_PIPELINE };
  const [ctx, applications, aiReviewed, aiShortlisted, waitingLong, holdDue, openJobs, hires, top] = await Promise.all([
    employerContext(employerId),
    prisma.jobBoardApplication.count({ where: { ...mine, appliedAt: { gte: weekAgo }, ...notErased } }),
    prisma.jobBoardAiScreening.count({ where: { employerId, status: 'DONE', completedAt: { gte: weekAgo } } }),
    prisma.jobBoardAiScreening.count({ where: { employerId, status: 'DONE', completedAt: { gte: weekAgo }, recommendation: 'shortlist' } }),
    prisma.jobBoardApplication.count({
      where: { ...mine, status: { in: [...ACTIVE_WAITING] }, withdrawnAt: null, ...notErased, OR: [{ statusChangedAt: { lt: new Date(t - WAIT_RED_DAYS * DAY) } }, { statusChangedAt: null, appliedAt: { lt: new Date(t - WAIT_RED_DAYS * DAY) } }] },
    }),
    prisma.jobBoardApplication.count({ where: { ...mine, status: 'ON_HOLD', withdrawnAt: null, onHoldUntil: { lte: new Date(t + 7 * DAY) }, ...notErased } }),
    prisma.jobBoardListing.count({ where: { employerId, deletedAt: null, isGeneral: false, status: 'OPEN' } }),
    prisma.jobBoardApplicationEvent.count({ where: { toStatus: 'HIRED', createdAt: { gte: weekAgo }, Application: { Listing: { employerId } } } }),
    loadTopTen(employerId),
  ]);
  return {
    company: ctx.company,
    applications, aiReviewed, aiShortlisted, waitingLong, holdDue, openJobs, hires,
    hoursSaved: Math.round((aiReviewed * MINUTES_PER_AI_REVIEW) / 6) / 10,
    top: top.candidates.slice(0, 3).map((c) => ({ name: c.fullName, job: c.jobTitle, reason: c.ai?.strengths[0]?.point ?? null })),
  };
}

/** Nothing worth a Monday email: no open jobs and nothing happened or is waiting. */
export function reportIsEmpty(r: WeeklyReport): boolean {
  return r.openJobs === 0 && r.applications === 0 && r.waitingLong === 0 && r.holdDue === 0 && r.hires === 0;
}

export function weeklyReportEmail(r: WeeklyReport, unsubscribeUrl: string): { subject: string; html: string } {
  const stat = (n: number | string, label: string) =>
    `<td style="padding:10px 12px;background:#F7F7F9;border-radius:10px;text-align:center;width:33%"><div style="font-size:22px;font-weight:700;color:#111827">${n}</div><div style="font-size:12px;color:#6b7280">${label}</div></td>`;
  const top = r.top.length
    ? `<h2 style="font-size:16px;margin:24px 0 8px">Start with these</h2><ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.5">${r.top
        .map((c) => `<li style="margin:0 0 6px"><strong>${esc(c.name)}</strong> · ${esc(c.job)}${c.reason ? `<br><span style="color:#6b7280;font-size:13px">${esc(c.reason)}</span>` : ''}</li>`)
        .join('')}</ol>`
    : '';
  const alerts = [
    r.waitingLong ? `<li style="margin:0 0 6px"><strong>${r.waitingLong}</strong> candidate${r.waitingLong === 1 ? ' has' : 's have'} waited ${WAIT_RED_DAYS}+ days in the same stage</li>` : '',
    r.holdDue ? `<li style="margin:0 0 6px"><strong>${r.holdDue}</strong> on-hold candidate${r.holdDue === 1 ? ' is' : 's are'} due back this week</li>` : '',
    r.hires ? `<li style="margin:0 0 6px"><strong>${r.hires}</strong> hire${r.hires === 1 ? '' : 's'} this week. Congratulations!</li>` : '',
  ].filter(Boolean).join('');
  const html = shell(`
<p style="margin:0 0 4px;font-size:13px;color:#6b7280">${esc(r.company)} · last 7 days</p>
<h1 style="font-size:20px;margin:0 0 16px">Your weekly hiring report</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>
${stat(r.applications, `new application${r.applications === 1 ? '' : 's'}`)}${stat(r.aiShortlisted, 'AI picks')}${stat(r.hoursSaved ? `~${r.hoursSaved}h` : '0h', 'reading saved (est.)')}
</tr></table>
${alerts ? `<ul style="margin:16px 0 0;padding-left:18px;font-size:15px;line-height:1.5">${alerts}</ul>` : ''}
${top}
<p style="margin:20px 0 24px">${button(`${SITE}/employer/applications?review=new`, 'Review new candidates')}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">“Reading saved” counts ${MINUTES_PER_AI_REVIEW} minutes for each resume AI reviewed for you. You get this because you’re on the ${esc(r.company)} hiring team. <a href="${unsubscribeUrl}" style="color:#6b7280">Stop these emails</a>.</p>`);
  const subject = r.applications
    ? `${r.applications} new application${r.applications === 1 ? '' : 's'} this week · ${r.company}`
    : `Your weekly hiring report · ${r.company}`;
  return { subject: subject.replace(/[\r\n]+/g, ' '), html };
}

// ── Sending ────────────────────────────────────────────────────────

/** Owners and recruiters who have the report on, plus the workspace account itself. One entry per address. */
export async function reportRecipients(employerId: string): Promise<{ email: string; recipient: ReportRecipient }[]> {
  const [e, members] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { id: true, email: true, weeklyReport: true } }),
    prisma.jobBoardTeamMember.findMany({
      where: { employerId, status: 'ACTIVE', role: { in: ['OWNER', 'RECRUITER'] }, weeklyReport: true },
      select: { id: true, email: true },
      take: 20,
    }),
  ]);
  const out = new Map<string, { email: string; recipient: ReportRecipient }>();
  if (e && e.weeklyReport && isRealInbox(e.email)) out.set(e.email.toLowerCase(), { email: e.email, recipient: { kind: 'workspace', id: e.id } });
  for (const m of members) {
    const key = m.email.toLowerCase();
    if (!out.has(key)) out.set(key, { email: m.email, recipient: { kind: 'member', id: m.id } });
  }
  return Array.from(out.values());
}

/**
 * Sends this week's reports. Each workspace is claimed first (weeklyReportSentAt), so two overlapping runs or a
 * retry never send a second report the same week. `onlyEmployerId` scopes it for tests.
 */
export async function runWeeklyReports(now = new Date(), opts: { onlyEmployerId?: string; limit?: number } = {}) {
  const cutoff = new Date(now.getTime() - MIN_GAP_DAYS * DAY);
  const employers = await prisma.jobBoardEmployer.findMany({
    where: {
      ...(opts.onlyEmployerId ? { id: opts.onlyEmployerId } : {}),
      isActive: true, deletedAt: null, deactivatedAt: null, passwordHash: { not: '' },
      OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lt: cutoff } }],
      Listings: { some: { deletedAt: null, publishedAt: { not: null } } },
    },
    select: { id: true },
    take: opts.limit ?? 300,
  });
  let sent = 0, skipped = 0, failed = 0;
  for (const { id } of employers) {
    const claimed = await prisma.jobBoardEmployer.updateMany({
      where: { id, OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lt: cutoff } }] },
      data: { weeklyReportSentAt: now },
    });
    if (!claimed.count) { skipped++; continue; }
    try {
      const report = await buildWeeklyReport(id, now);
      if (reportIsEmpty(report)) { skipped++; continue; }
      for (const r of await reportRecipients(id)) {
        const { subject, html } = weeklyReportEmail(report, reportUnsubscribePage(r.recipient));
        const res = await sendEmail({
          to: r.email, subject, html, type: 'employer_weekly_report',
          headers: { 'List-Unsubscribe': `<${reportOneClickUrl(r.recipient)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        });
        if (res.success) sent++; else failed++;
      }
    } catch (err) {
      failed++;
      console.error('[weekly-report]', id, err instanceof Error ? err.message : err);
    }
  }
  return { workspaces: employers.length, sent, skipped, failed };
}
