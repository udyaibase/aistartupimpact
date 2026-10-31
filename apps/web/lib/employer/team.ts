import crypto from 'crypto';
import { effectivePlan } from '@/lib/employer/plans';
import { prisma } from '@udyaibase/database';
import type { EmployerRole } from '@/lib/employer-auth';
import { sendEmail } from '@/lib/email/send';
import { ROLE_LABEL } from '@/lib/employer/roles';
import { employerContext } from '@/lib/employer/applications';
import { emailDomain, emailMatchesDomain, isFreeMailDomain, websiteDomain } from '@/lib/jobs/trust';

/** Safety cap for plans with unlimited seats. */
const MAX_SEATS_CAP = 200;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
export const INVITE_TTL_DAYS = 7;

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
export const newInviteToken = () => crypto.randomBytes(32).toString('base64url');

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function shell(body: string) {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:32px">${body}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Udyaibase &middot; Hiring for India's AI startups</p>
</td></tr></table></body></html>`;
}
const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${label}</a>`;

export interface TeamRow {
  id: string | null;
  email: string;
  name: string | null;
  role: EmployerRole;
  status: 'OWNER_ACCOUNT' | 'PENDING' | 'ACTIVE';
  invitedAt: string | null;
  inviteExpired: boolean;
  /** Interviewers: the jobs they can see. Empty = all jobs. */
  jobIds: string[];
}

/** Workspace account (always an owner) plus active and pending teammates. */
export async function listTeam(employerId: string): Promise<TeamRow[]> {
  const [employer, members] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true, FounderUser: { select: { name: true } } } }),
    prisma.jobBoardTeamMember.findMany({ where: { employerId, status: { in: ['PENDING', 'ACTIVE'] } }, orderBy: [{ status: 'asc' }, { invitedAt: 'asc' }] }),
  ]);
  const now = Date.now();
  return [
    ...(employer && !employer.email.endsWith('@udyaibase.com')
      ? [{ id: null, email: employer.email, name: employer.FounderUser?.name ?? null, role: 'OWNER' as const, status: 'OWNER_ACCOUNT' as const, invitedAt: null, inviteExpired: false, jobIds: [] }]
      : []),
    ...members.map((m) => ({
      id: m.id, email: m.email, name: m.name, role: m.role, status: m.status as 'PENDING' | 'ACTIVE',
      invitedAt: m.invitedAt.toISOString(), inviteExpired: m.status === 'PENDING' && !!m.inviteExpiresAt && m.inviteExpiresAt.getTime() < now,
      jobIds: m.role === 'INTERVIEWER' ? m.jobIds : [],
    })),
  ];
}

export async function sendInviteEmail(opts: { employerId: string; to: string; role: EmployerRole; inviterEmail: string; inviterName: string | null; token: string }) {
  const { company } = await employerContext(opts.employerId);
  const link = `${SITE}/employer/join?token=${encodeURIComponent(opts.token)}`;
  const who = opts.inviterName ? `${esc(opts.inviterName)} (${esc(opts.inviterEmail)})` : esc(opts.inviterEmail);
  return sendEmail({
    to: opts.to,
    replyTo: opts.inviterEmail,
    subject: `Join ${company}'s hiring team on Udyaibase`,
    type: 'employer_team_invite',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">You're invited to hire with ${esc(company)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${who} invited you to join ${esc(company)} on Udyaibase as <strong>${ROLE_LABEL[opts.role]}</strong>, to review candidates and manage hiring together.</p>
<p style="margin:0 0 24px">${btn(link, 'Accept invitation')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">The link works once and expires in ${INVITE_TTL_DAYS} days. No password needed: next time, sign in with a code sent to this email. If you weren't expecting this, ignore it.</p>`),
  });
}

export async function sendMemberLoginCode(to: string, code: string) {
  return sendEmail({
    to,
    subject: `${code} is your Udyaibase sign-in code`,
    type: 'employer_member_login',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your sign-in code</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Enter this code to sign in to your hiring team on Udyaibase:</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
<p style="margin:0;font-size:13px;color:#6b7280">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>`),
  });
}

/** Emails teammates who were @mentioned in a note. */
export async function sendMentionEmails(opts: {
  employerId: string; to: string[]; authorName: string; candidateName: string; jobId: string; applicationId: string; note: string;
}) {
  const link = `${SITE}/employer/applications?job=${opts.jobId}&candidate=${opts.applicationId}`;
  await Promise.all(opts.to.map((to) => sendEmail({
    to,
    subject: `${opts.authorName} mentioned you on ${opts.candidateName}`,
    type: 'employer_note_mention',
    html: shell(`
<p style="margin:0 0 12px;font-size:15px;line-height:1.6"><strong>${esc(opts.authorName)}</strong> mentioned you in a note on <strong>${esc(opts.candidateName)}</strong>:</p>
<p style="margin:0 0 20px;padding:12px 16px;background:#F7F7F9;border-radius:10px;font-size:14px;line-height:1.6;white-space:pre-line">${esc(opts.note.slice(0, 600))}</p>
<p style="margin:0">${btn(link, 'Open candidate')}</p>`),
  })));
}

/** The company domain recruiters are expected to use: the verified one, else the startup website's. */
export async function teamCompanyDomain(employerId: string): Promise<string | null> {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { verifiedCompanyDomain: true, email: true, Startup: { select: { websiteUrl: true } } },
  });
  if (!e) return null;
  if (e.verifiedCompanyDomain) return e.verifiedCompanyDomain;
  const site = websiteDomain(e.Startup?.websiteUrl);
  if (site) return site;
  const own = emailDomain(e.email);
  return own && !isFreeMailDomain(own) ? own : null;
}

export type InviteResult =
  | { ok: true; memberId: string }
  | { ok: false; status: number; error: string; field?: string; code?: 'outside_domain' | 'seat_limit'; domain?: string };

/**
 * The one place teammates are invited (employer Team page and founder portal both call it).
 * Recruiters can publish jobs under the startup's verified name, so inviting one on an email outside
 * the company domain needs an explicit confirmation from the owner.
 */
/**
 * The workspace's own (non-deleted) jobs among `raw`, for an interviewer's access list.
 * Returns null when `raw` isn't a list of ids; [] means "every job".
 */
export async function cleanJobIds(employerId: string, raw: unknown): Promise<string[] | null> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 200 || raw.some((x) => typeof x !== 'string')) return null;
  if (raw.length === 0) return [];
  const rows = await prisma.jobBoardListing.findMany({ where: { employerId, deletedAt: null, id: { in: raw as string[] } }, select: { id: true } });
  return rows.length === new Set(raw).size ? rows.map((r) => r.id) : null;
}

export async function inviteTeammate(opts: {
  employerId: string;
  inviter: { email: string; name: string | null };
  email: string;
  role: EmployerRole;
  confirmOutsideDomain?: boolean;
  jobIds?: string[];
}): Promise<InviteResult> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return { ok: false, status: 400, error: 'Enter a valid email address.', field: 'email' };
  }
  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: opts.employerId }, select: { email: true, plan: true, planExpiresAt: true, planIsTrial: true } });
  if (!employer) return { ok: false, status: 404, error: 'Workspace not found.' };
  if (employer.email.toLowerCase() === email) return { ok: false, status: 409, error: 'That’s the workspace owner’s email already.', field: 'email' };
  const existing = await prisma.jobBoardTeamMember.findUnique({ where: { employerId_email: { employerId: opts.employerId, email } } });
  if (existing?.status === 'ACTIVE') return { ok: false, status: 409, error: `${email} is already on your team.`, field: 'email' };
  // Seats include the workspace owner. Over the limit after a downgrade, existing people keep access; only new invites stop.
  const plan = effectivePlan(employer);
  const maxSeats = plan.maxSeats ?? MAX_SEATS_CAP;
  const seats = 1 + await prisma.jobBoardTeamMember.count({ where: { employerId: opts.employerId, status: { in: ['PENDING', 'ACTIVE'] } } });
  if (!existing && seats >= maxSeats) {
    return {
      ok: false, status: 403, code: 'seat_limit',
      error: plan.maxSeats === null
        ? `You’ve reached ${MAX_SEATS_CAP} people. Contact us to add more.`
        : `The ${plan.name} plan includes ${plan.maxSeats} seats, including you. Remove someone or upgrade for more.`,
    };
  }

  if (opts.role === 'RECRUITER' && !opts.confirmOutsideDomain) {
    const domain = await teamCompanyDomain(opts.employerId);
    if (domain && !emailMatchesDomain(email, domain)) {
      return {
        ok: false, status: 409, code: 'outside_domain', domain, field: 'email',
        error: `${email} isn’t a @${domain} address. Recruiters can publish jobs under your verified startup name. Invite them anyway?`,
      };
    }
  }

  const token = newInviteToken();
  const data = {
    role: opts.role, jobIds: opts.role === 'INTERVIEWER' ? opts.jobIds ?? [] : [], status: 'PENDING' as const, inviteTokenHash: hashToken(token),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000), invitedByEmail: opts.inviter.email, invitedAt: new Date(),
  };
  const member = existing
    ? await prisma.jobBoardTeamMember.update({ where: { id: existing.id }, data })
    : await prisma.jobBoardTeamMember.create({ data: { ...data, employerId: opts.employerId, email } });

  const sent = await sendInviteEmail({ employerId: opts.employerId, to: email, role: opts.role, inviterEmail: opts.inviter.email, inviterName: opts.inviter.name, token });
  if (!sent.success) return { ok: false, status: 502, error: 'We couldn’t send the invite email. Try again in a few minutes.' };
  return { ok: true, memberId: member.id };
}

/** Owner alert: a teammate published a job under the workspace's name. */
export function sendTeammatePublishedEmail(opts: { to: string; who: string; jobTitle: string; slug: string; jobId: string }) {
  void sendEmail({
    to: opts.to,
    subject: `${opts.who} published “${opts.jobTitle}”`,
    type: 'employer_teammate_published',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">${esc(opts.who)} published a job</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6"><strong>${esc(opts.jobTitle)}</strong> is now live on Udyaibase AI Jobs under your company name.</p>
<p style="margin:0 0 12px"><a href="${SITE}/jobs/${opts.slug}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">View the job</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">Not expected? <a href="${SITE}/employer/jobs/${opts.jobId}/edit" style="color:#A50F15">Pause or edit it</a> and review your team on the Team page.</p>
</div>`,
  }).catch(() => {});
}

/** Owners of a workspace (account email plus active owner teammates), for approval requests. */
export async function ownerInboxes(employerId: string): Promise<string[]> {
  const [employer, owners] = await Promise.all([
    prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: { email: true, passwordHash: true } }),
    prisma.jobBoardTeamMember.findMany({ where: { employerId, status: 'ACTIVE', role: 'OWNER' }, select: { email: true }, take: 10 }),
  ]);
  // Placeholder workspaces (created by the founder portal or admin) have no inbox of their own.
  const account = employer && employer.passwordHash !== '' && !employer.email.endsWith('@udyaibase.com') ? [employer.email] : [];
  return Array.from(new Set([...account, ...owners.map((o) => o.email)].map((e) => e.toLowerCase())));
}

/** Approval mode: a recruiter asked owners to publish a job. */
export function sendApprovalRequestEmail(opts: { to: string; who: string; jobTitle: string; jobId: string }) {
  void sendEmail({
    to: opts.to,
    subject: `${opts.who} wants to publish “${opts.jobTitle}”`,
    type: 'employer_job_approval_request',
    html: shell(`<h1 style="font-size:20px;margin:0 0 8px">A job is waiting for your approval</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${esc(opts.who)} wrote <strong>${esc(opts.jobTitle)}</strong> and asked to publish it. It stays a draft until an owner publishes it.</p>
<p style="margin:0 0 12px">${btn(`${SITE}/employer/jobs/${opts.jobId}/edit`, 'Review and publish')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">You turned on owner approval on the Team page. Turn it off there to let recruiters publish directly.</p>`),
  }).catch(() => {});
}

/** Approval mode: an owner sent a job back to the recruiter who asked. */
export function sendApprovalDeclinedEmail(opts: { to: string; who: string; jobTitle: string; jobId: string; note: string }) {
  void sendEmail({
    to: opts.to,
    subject: `“${opts.jobTitle}” wasn’t published yet`,
    type: 'employer_job_approval_declined',
    html: shell(`<h1 style="font-size:20px;margin:0 0 8px">Your job needs changes</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(opts.who)} didn’t publish <strong>${esc(opts.jobTitle)}</strong> yet. It’s still saved as a draft.</p>
${opts.note ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;padding:12px 14px;background:#F7F7F9;border-radius:10px">${esc(opts.note)}</p>` : ''}
<p style="margin:0">${btn(`${SITE}/employer/jobs/${opts.jobId}/edit`, 'Edit the job')}</p>`),
  }).catch(() => {});
}
