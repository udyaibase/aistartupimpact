import { prisma } from '@udyaibase/database';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { eraseApplication } from '@/lib/jobs/candidate-status';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;

/** How long candidate data is kept (also stated in the apply consent text). */
export const RETENTION = {
  afterDecisionDays: 180, // rejected
  afterWithdrawDays: 30,
  afterJobClosedDays: 365,
  talentPoolDays: 365,
};

/**
 * Daily nudges and data retention, run from the data-retention cron.
 * Placeholder (admin-managed) workspaces have no inbox, so they get no emails.
 */
export async function runHiringMaintenance(now = new Date(), opts: { onlyEmployerId?: string } = {}) {
  const t = now.getTime();
  // onlyEmployerId scopes every step to one workspace (tests run against a shared database).
  const only = opts.onlyEmployerId ? { id: opts.onlyEmployerId } : {};
  const real = { passwordHash: { not: '' }, deletedAt: null, isActive: true, ...only };

  // 1. Candidates waiting more than 5 days: at most one reminder every 3 days per workspace.
  const waiting = await prisma.jobBoardApplication.groupBy({
    by: ['listingId'],
    where: {
      status: { in: ['APPLIED', 'REVIEWED'] }, withdrawnAt: null, appliedAt: { lt: new Date(t - 5 * DAY) },
      NOT: { email: { endsWith: '@deleted.invalid' } },
      Listing: { status: 'OPEN', deletedAt: null, Employer: { ...real, OR: [{ reviewNudgeAt: null }, { reviewNudgeAt: { lt: new Date(t - 3 * DAY) } }] } },
    },
    _count: { _all: true },
  });
  const listings = waiting.length
    ? await prisma.jobBoardListing.findMany({ where: { id: { in: waiting.map((w) => w.listingId) } }, select: { id: true, title: true, employerId: true, Employer: { select: { email: true } } } })
    : [];
  const byEmployer = new Map<string, { email: string; jobs: { title: string; id: string; n: number }[] }>();
  for (const w of waiting) {
    const l = listings.find((x) => x.id === w.listingId);
    if (!l) continue;
    const e = byEmployer.get(l.employerId) ?? { email: l.Employer.email, jobs: [] };
    e.jobs.push({ title: l.title, id: l.id, n: w._count._all });
    byEmployer.set(l.employerId, e);
  }
  for (const [employerId, e] of byEmployer) {
    for (const to of await hiringInboxes(employerId, e.email)) sendWaitingEmail(to, e.jobs);
    await prisma.jobBoardEmployer.update({ where: { id: employerId }, data: { reviewNudgeAt: now } });
  }

  // 2. "Still hiring?" 3 days before a job closes, once per closing date.
  const closing = await prisma.jobBoardListing.findMany({
    where: { status: 'OPEN', deletedAt: null, expiryNudgeAt: null, expiresAt: { gt: now, lte: new Date(t + 3 * DAY) }, Employer: real },
    select: { id: true, title: true, expiresAt: true, employerId: true, Employer: { select: { email: true } }, _count: { select: { Applications: true } } },
    take: 500,
  });
  const closingBy = new Map<string, { email: string; jobs: typeof closing }>();
  for (const l of closing) {
    const e = closingBy.get(l.employerId) ?? { email: l.Employer.email, jobs: [] };
    e.jobs.push(l);
    closingBy.set(l.employerId, e);
  }
  for (const [employerId, e] of closingBy) {
    for (const to of await hiringInboxes(employerId, e.email)) sendClosingEmail(to, e.jobs);
  }
  if (closing.length) await prisma.jobBoardListing.updateMany({ where: { id: { in: closing.map((l) => l.id) } }, data: { expiryNudgeAt: now } });

  // 2b. Jobs on admin-managed placeholder workspaces have no inbox: one digest to the Udyaibase team instead.
  const adminClosing = await prisma.jobBoardListing.findMany({
    where: {
      status: 'OPEN', deletedAt: null, expiryNudgeAt: null, expiresAt: { gt: now, lte: new Date(t + 3 * DAY) },
      Employer: { passwordHash: '', deletedAt: null, ...only },
    },
    select: { id: true, title: true, expiresAt: true, Employer: { select: { companyName: true } }, _count: { select: { Applications: true } } },
    orderBy: { expiresAt: 'asc' },
    take: 200,
  });
  if (adminClosing.length) {
    sendAdminClosingDigest(adminClosing);
    await prisma.jobBoardListing.updateMany({ where: { id: { in: adminClosing.map((l) => l.id) } }, data: { expiryNudgeAt: now } });
  }

  // 3. Retention (DPDP): erase candidate data once its purpose is over, unless they joined the talent pool.
  const notInPool = { OR: [{ talentPoolUntil: null }, { talentPoolUntil: { lt: now } }] };
  const due = await prisma.jobBoardApplication.findMany({
    where: {
      NOT: { email: { endsWith: '@deleted.invalid' } },
      AND: [notInPool, {
        OR: [
          { status: 'REJECTED', statusChangedAt: { lt: new Date(t - RETENTION.afterDecisionDays * DAY) }, ...(opts.onlyEmployerId ? { Listing: { employerId: opts.onlyEmployerId } } : {}) },
          { withdrawnAt: { lt: new Date(t - RETENTION.afterWithdrawDays * DAY) }, ...(opts.onlyEmployerId ? { Listing: { employerId: opts.onlyEmployerId } } : {}) },
          { Listing: { ...(opts.onlyEmployerId ? { employerId: opts.onlyEmployerId } : {}), OR: [{ closedAt: { lt: new Date(t - RETENTION.afterJobClosedDays * DAY) } }, { deletedAt: { lt: new Date(t - RETENTION.afterJobClosedDays * DAY) } }] } },
        ],
      }],
    },
    select: { id: true },
    take: 200,
  });
  let erased = 0;
  for (const a of due) {
    try { await eraseApplication(a.id); erased++; } catch (err) { console.error('[retention] erase', a.id, err instanceof Error ? err.message : err); }
  }

  return { reviewNudgesSent: byEmployer.size, closingNudgesSent: closingBy.size, adminClosingJobs: adminClosing.length, applicationsErased: erased };
}

/** Workspace email plus active owners and recruiters (the people who can act on candidates and jobs). */
async function hiringInboxes(employerId: string, workspaceEmail: string): Promise<string[]> {
  const members = await prisma.jobBoardTeamMember.findMany({
    where: { employerId, status: 'ACTIVE', role: { in: ['OWNER', 'RECRUITER'] } },
    select: { email: true },
    take: 10,
  });
  return Array.from(new Set([workspaceEmail, ...members.map((m) => m.email)].map((x) => x.toLowerCase())));
}

function sendWaitingEmail(to: string, jobs: { title: string; id: string; n: number }[]) {
  const total = jobs.reduce((n, j) => n + j.n, 0);
  const list = jobs.slice(0, 5).map((j) => `<li style="margin:0 0 6px"><a href="${SITE}/employer/applications?job=${j.id}" style="color:#A50F15">${esc(j.title)}</a> · ${j.n} waiting</li>`).join('');
  sendEmailFireAndForget({
    to,
    subject: `${total} candidate${total === 1 ? ' is' : 's are'} waiting for a reply`,
    type: 'employer_review_nudge',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${total} candidate${total === 1 ? ' has' : 's have'} waited more than 5 days</h1>
<ul style="margin:0 0 20px;padding-left:18px;font-size:15px;line-height:1.5">${list}</ul>
<p style="margin:0 0 24px">${button(`${SITE}/employer/applications?stage=new`, 'Review candidates')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Even a quick “not this time” helps: candidates who hear back think better of your company, and a slow reply is the top reason good people drop out.</p>`),
  });
}

function sendClosingEmail(to: string, jobs: { id: string; title: string; expiresAt: Date | null; _count: { Applications: number } }[]) {
  const list = jobs.map((j) => {
    const date = j.expiresAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    return `<li style="margin:0 0 6px"><strong>${esc(j.title)}</strong> · closes ${date} · ${j._count.Applications} candidate${j._count.Applications === 1 ? '' : 's'}</li>`;
  }).join('');
  sendEmailFireAndForget({
    to,
    subject: jobs.length === 1 ? `Still hiring for ${jobs[0].title}?` : `Still hiring? ${jobs.length} jobs close soon`,
    type: 'employer_closing_nudge',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Still hiring?</h1>
<ul style="margin:0 0 20px;padding-left:18px;font-size:15px;line-height:1.5">${list}</ul>
<p style="margin:0 0 24px">${button(`${SITE}/employer/jobs`, 'Renew or close')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Renew to keep it open for another 30 days. If you’ve filled the role, close it as filled so candidates aren’t left waiting.</p>`),
  });
}

function sendAdminClosingDigest(jobs: { id: string; title: string; expiresAt: Date | null; Employer: { companyName: string }; _count: { Applications: number } }[]) {
  const admin = (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');
  const rows = jobs.map((j) => {
    const date = j.expiresAt!.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    return `<li style="margin:0 0 6px"><a href="${admin}/jobs-board/${j.id}" style="color:#A50F15">${esc(j.title)}</a> · ${esc(j.Employer.companyName)} · closes ${date} · ${j._count.Applications} applicant${j._count.Applications === 1 ? '' : 's'}</li>`;
  }).join('');
  sendEmailFireAndForget({
    to: process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com',
    subject: `${jobs.length} admin-managed job${jobs.length === 1 ? '' : 's'} close${jobs.length === 1 ? 's' : ''} within 3 days`,
    type: 'admin_jobs_closing',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Admin-managed jobs closing soon</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">These jobs were added from the admin app, so there's no employer to remind. Renew the ones still open, or let them close.</p>
<ul style="margin:0 0 20px;padding-left:18px;font-size:15px;line-height:1.5">${rows}</ul>`),
  });
}
