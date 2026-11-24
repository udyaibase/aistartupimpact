import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { lastApplicationDetails, OWN_APPLICATION, type Candidate } from '@/lib/jobs/candidate-account';
import { opsAlert } from '@/lib/ops/alert';
import {
  MAX_BLOCKED, NETWORK_CONSENT_TEXT, NETWORK_CONSENT_VERSION, REQUEST_EXPIRE_DAYS, VISIBLE_DAYS, cleanOpenProfile,
  type IntroStatus, type OpenProfileInput, type WorkMode,
} from './rules';

/**
 * The job seeker's side of "Open to opportunities" (server only): turning it on, editing, pausing, renewing,
 * leaving, hiding companies, and answering requests. Every function takes the signed-in candidate; nothing here
 * acts on someone else's profile.
 */

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;

const PROFILE_SELECT = {
  id: true, headline: true, experienceYears: true, skills: true, city: true, workMode: true, noticePeriodDays: true,
  currentCompany: true, showCompany: true, blockedEmployerIds: true, visibleUntil: true, pausedAt: true, consentAt: true,
} as const;

export async function getOpenProfile(userId: string) {
  return prisma.jobBoardOpenProfile.findUnique({ where: { webUserId: userId }, select: PROFILE_SELECT });
}

/** A first draft from their latest application, so turning it on takes one look rather than a form. */
export async function draftFromApplications(userId: string): Promise<OpenProfileInput> {
  const [last, skillRows] = await Promise.all([
    lastApplicationDetails(userId),
    prisma.jobBoardApplication.findMany({ where: { ...OWN_APPLICATION, webUserId: userId }, orderBy: { appliedAt: 'desc' }, take: 10, select: { confirmedSkills: true } }),
  ]);
  const n = (v: string | undefined) => (v ? Number(v) : null);
  return {
    headline: last?.currentTitle ?? '',
    experienceYears: n(last?.experienceYears),
    skills: Array.from(new Set(skillRows.flatMap((r) => r.confirmedSkills))).slice(0, 15),
    city: last?.city || null,
    workMode: 'ANY' as WorkMode,
    noticePeriodDays: n(last?.noticePeriodDays),
    currentCompany: last?.currentCompany || null,
    showCompany: false,
  };
}

export type SaveResult = { ok: true } | { ok: false; error: string; status: number; field?: string };

/**
 * Turn it on (with their consent) or save changes. Only with a verified email: otherwise someone could sign up with
 * another person's address and put them on the network.
 */
export async function saveOpenProfile(me: Candidate, raw: unknown, opts: { consent?: boolean } = {}, now = new Date()): Promise<SaveResult> {
  if (!me.emailVerified) return { ok: false, error: 'Verify your email first.', status: 403 };
  const clean = cleanOpenProfile(raw);
  if (!clean.ok) return { ok: false, error: clean.error, field: clean.field, status: 400 };
  const existing = await prisma.jobBoardOpenProfile.findUnique({ where: { webUserId: me.id }, select: { id: true } });
  if (existing) {
    await prisma.jobBoardOpenProfile.update({ where: { id: existing.id }, data: clean.data });
    return { ok: true };
  }
  if (opts.consent !== true) return { ok: false, error: 'Please agree before turning this on.', field: 'consent', status: 400 };
  await prisma.jobBoardOpenProfile.create({
    data: {
      ...clean.data,
      webUserId: me.id,
      visibleUntil: new Date(now.getTime() + VISIBLE_DAYS * DAY),
      consentAt: now,
      consentText: `[${NETWORK_CONSENT_VERSION}] ${NETWORK_CONSENT_TEXT}`,
    },
  });
  return { ok: true };
}

/** Pause hides them at once (open requests stay answerable); resume shows them again. */
export async function setPaused(userId: string, paused: boolean, now = new Date()) {
  const r = await prisma.jobBoardOpenProfile.updateMany({ where: { webUserId: userId }, data: { pausedAt: paused ? now : null } });
  return r.count > 0;
}

/** Another 90 days from today. */
export async function renewProfile(userId: string, now = new Date()) {
  const r = await prisma.jobBoardOpenProfile.updateMany({
    where: { webUserId: userId },
    data: { visibleUntil: new Date(now.getTime() + VISIBLE_DAYS * DAY), renewReminderAt: null, pausedAt: null },
  });
  return r.count > 0;
}

/** Leaving deletes the profile and every request sent to it. Applications they sent stay theirs to manage. */
export async function leaveNetwork(userId: string) {
  const r = await prisma.jobBoardOpenProfile.deleteMany({ where: { webUserId: userId } });
  return r.count > 0;
}

/** Hide from one company (or show to it again). Hiding also closes that company's open requests. */
export async function setBlocked(userId: string, employerId: string, blocked: boolean) {
  const p = await prisma.jobBoardOpenProfile.findUnique({ where: { webUserId: userId }, select: { id: true, blockedEmployerIds: true } });
  if (!p) return false;
  const set = new Set(p.blockedEmployerIds);
  if (blocked) {
    if (!set.has(employerId) && set.size >= MAX_BLOCKED) return false;
    set.add(employerId);
  } else set.delete(employerId);
  await prisma.jobBoardOpenProfile.update({ where: { id: p.id }, data: { blockedEmployerIds: Array.from(set) } });
  if (blocked) {
    await prisma.jobBoardIntroRequest.updateMany({ where: { profileId: p.id, employerId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } });
  }
  return true;
}

/** Requests sent to them, newest first, with the company and job. */
export async function myIntroRequests(userId: string) {
  const rows = await prisma.jobBoardIntroRequest.findMany({
    where: { Profile: { webUserId: userId } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, status: true, message: true, createdAt: true, respondedAt: true, applicationId: true, employerId: true,
      Listing: { select: { title: true, slug: true } },
      Employer: { select: { companyName: true, startupClaimMethod: true, startupId: true, Startup: { select: { name: true } } } },
    },
  });
  return rows;
}

export type RespondResult =
  | { ok: true; status: IntroStatus; applyUrl?: string }
  | { ok: false; error: string; status: number };

/**
 * Answer a request:
 * - accept: opens the job's normal application form with the request attached (the application, and only it,
 *   shares their details with the company);
 * - decline: the company sees "Not interested";
 * - report: as a decline to the company, and the company's network access is paused until our team looks.
 */
export async function respondToIntro(userId: string, requestId: string, action: unknown, reason: unknown, now = new Date()): Promise<RespondResult> {
  const req = await prisma.jobBoardIntroRequest.findFirst({
    where: { id: requestId, Profile: { webUserId: userId } },
    select: { id: true, status: true, employerId: true, createdAt: true, message: true, Listing: { select: { slug: true, title: true, status: true, deletedAt: true } }, Employer: { select: { companyName: true } } },
  });
  if (!req) return { ok: false, error: 'Request not found.', status: 404 };

  if (action === 'report') {
    if (req.status === 'REPORTED') return { ok: true, status: 'REPORTED' };
    const why = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    await prisma.jobBoardIntroRequest.update({ where: { id: req.id }, data: { status: 'REPORTED', reportReason: why || null, respondedAt: req.status === 'PENDING' ? now : undefined } });
    await prisma.jobBoardEmployer.update({ where: { id: req.employerId }, data: { networkPausedAt: now } });
    await opsAlert(`network-report:${req.employerId}`, `Network request reported: ${req.Employer.companyName}`, [
      `Job: ${req.Listing.title}`, `Reason: ${why || '(none given)'}`, `Message: ${req.message.slice(0, 300)}`,
      'Their network access is paused. Review in admin → Open to opportunities.',
    ], 0).catch(() => {});
    return { ok: true, status: 'REPORTED' };
  }

  if (req.status !== 'PENDING' && !(action === 'accept' && req.status === 'ACCEPTED')) {
    return { ok: false, error: 'You’ve already answered this request.', status: 409 };
  }
  if (now.getTime() - req.createdAt.getTime() > REQUEST_EXPIRE_DAYS * DAY && req.status === 'PENDING') {
    await prisma.jobBoardIntroRequest.update({ where: { id: req.id }, data: { status: 'EXPIRED' } });
    return { ok: false, error: 'This request has expired.', status: 410 };
  }
  if (action === 'decline') {
    await prisma.jobBoardIntroRequest.update({ where: { id: req.id }, data: { status: 'DECLINED', respondedAt: now } });
    return { ok: true, status: 'DECLINED' };
  }
  if (action === 'accept') {
    if (req.Listing.status !== 'OPEN' || req.Listing.deletedAt) return { ok: false, error: 'This job has closed.', status: 410 };
    if (req.status === 'PENDING') await prisma.jobBoardIntroRequest.update({ where: { id: req.id }, data: { status: 'ACCEPTED', respondedAt: now } });
    return { ok: true, status: 'ACCEPTED', applyUrl: `/jobs/${req.Listing.slug}/apply?intro=${encodeURIComponent(req.id)}` };
  }
  return { ok: false, error: 'Unknown action.', status: 400 };
}

/**
 * Called by the application form: an application sent from an accepted request is linked to it (and marked as
 * coming from the network). Only the request's own candidate, for that job, once.
 */
export async function linkIntroApplication(opts: { introId: unknown; userId: string | null | undefined; listingId: string; applicationId: string }) {
  if (typeof opts.introId !== 'string' || !opts.introId || !opts.userId) return false;
  const r = await prisma.jobBoardIntroRequest.updateMany({
    where: { id: opts.introId, listingId: opts.listingId, status: 'ACCEPTED', applicationId: null, Profile: { webUserId: opts.userId } },
    data: { applicationId: opts.applicationId },
  });
  return r.count > 0;
}

/** Is this an accepted request of theirs for this job (so the application can be marked as coming from the network)? */
export async function isAcceptedIntro(introId: unknown, userId: string | null | undefined, listingId: string) {
  if (typeof introId !== 'string' || !introId || !userId) return false;
  const n = await prisma.jobBoardIntroRequest.count({ where: { id: introId, listingId, status: 'ACCEPTED', applicationId: null, Profile: { webUserId: userId } } });
  return n > 0;
}

// ── Signed link for pausing from an email (one-click unsubscribe; no sign-in needed to stop emails)

function secret(): string {
  const s = process.env.EMPLOYER_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('EMPLOYER_JWT_SECRET is not configured');
  return s;
}
export const pauseToken = (profileId: string) => createHmac('sha256', secret()).update(`network:pause:${profileId}`).digest('base64url');
export function verifyPauseToken(profileId: string, token: unknown): boolean {
  if (!profileId || typeof token !== 'string' || !token) return false;
  try {
    const want = Buffer.from(pauseToken(profileId));
    const got = Buffer.from(token);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}
export function networkEmailHeaders(profileId: string): Record<string, string> {
  const url = `${SITE()}/api/network/pause?${new URLSearchParams({ id: profileId, t: pauseToken(profileId) })}`;
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** The email a person gets when a company asks them to apply. Their name isn't known to the company. */
export async function sendIntroEmail(opts: { to: string; profileId: string; company: string; jobTitle: string; message: string; requestId: string }) {
  const link = `${SITE()}/open-to-work#req-${opts.requestId}`;
  return sendEmail({
    to: opts.to,
    subject: `${opts.company} invited you to apply: ${opts.jobTitle}`.replace(/[\r\n]+/g, ' '),
    type: 'network_intro_request',
    headers: networkEmailHeaders(opts.profileId),
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${esc(opts.company)} would like you to apply</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">They found your anonymous profile on Udyaibase and think you’d fit <strong>${esc(opts.jobTitle)}</strong>. They don’t know who you are.</p>
<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #A50F15;background:#f9fafb;font-size:14px;line-height:1.6;white-space:pre-line">${esc(opts.message)}</blockquote>
<p style="margin:0 0 24px">${button(link, 'See the request')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">Accept to apply (your details are shared only when you send the application), or decline. Requests close after ${REQUEST_EXPIRE_DAYS} days. You’re getting this because you turned on “Open to opportunities”; you can pause it from the same page or with your mail app’s unsubscribe button.</p>`),
  });
}
