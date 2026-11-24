import { prisma } from '@udyaibase/database';
import { calendarMonthStart, effectivePlan, periodStart, planPhase } from '@/lib/employer/plans';
import { employerContext } from '@/lib/employer/applications';
import { publicListingWhere } from '@/lib/jobs/public';
import { emailDomain, isFreeMailDomain, registrableDomain, websiteDomain } from '@/lib/jobs/trust';
import { sendEmail } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { networkEmailHeaders, sendIntroEmail } from './profile';
import {
  PENDING_CAP, RENEW_REMINDER_DAYS, REPEAT_REQUEST_DAYS, REQUEST_EXPIRE_DAYS, cleanIntroMessage, toNetworkCard,
  type IntroStatus, type NetworkCard,
} from './rules';

/**
 * The companies' side of "Open to opportunities" (server only): who may use it, the anonymous search, sending a
 * request, and the daily tidy-up.
 *
 * Search never returns a name, email, phone, links or resume (see toNetworkCard). People are left out when they:
 * - paused, or their 90 days ended;
 * - hid this company, or work there (their email's domain is the company's, or their current company has its name);
 * - already applied to this company (the company has their details already, and showing them would let it match
 *   an anonymous profile to a known applicant);
 * - have PENDING_CAP requests they haven't answered yet.
 */

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const DAY = 864e5;
/** Most profiles one search returns (the pilot network is small; filtering happens on the page). */
const SEARCH_LIMIT = 500;

export interface NetworkAccess {
  allowed: boolean;
  reason: 'ok' | 'not_in_pilot' | 'paused';
  allowance: number;
  used: number;
  left: number;
}

type EmployerForNetwork = {
  id: string; networkPilot: boolean; networkPausedAt: Date | null; plan: string; planExpiresAt: Date | null; planIsTrial: boolean;
};

const EMPLOYER_SELECT = { id: true, networkPilot: true, networkPausedAt: true, plan: true, planExpiresAt: true, planIsTrial: true } as const;

/** Requests this month (the plan's 30-day period on paid plans, the calendar month on Free). */
function allowanceWindow(e: EmployerForNetwork, now: Date) {
  const phase = planPhase(e, now.getTime()).phase;
  const since = phase === 'free' ? calendarMonthStart(now.getTime()) : (periodStart(e.planExpiresAt, now.getTime()) ?? calendarMonthStart(now.getTime()));
  return { since, allowance: effectivePlan(e, now.getTime()).introRequestsPerPeriod };
}

export async function networkAccess(employerId: string, now = new Date()): Promise<NetworkAccess> {
  const e = await prisma.jobBoardEmployer.findUnique({ where: { id: employerId }, select: EMPLOYER_SELECT });
  if (!e || !e.networkPilot) return { allowed: false, reason: 'not_in_pilot', allowance: 0, used: 0, left: 0 };
  const { since, allowance } = allowanceWindow(e, now);
  const used = await prisma.jobBoardIntroRequest.count({ where: { employerId, createdAt: { gte: since } } });
  const left = Math.max(0, allowance - used);
  if (e.networkPausedAt) return { allowed: false, reason: 'paused', allowance, used, left };
  return { allowed: true, reason: 'ok', allowance, used, left };
}

/** What the company is called and where its email and website live, to recognise its own staff. */
async function companyIdentity(employerId: string) {
  const e = await prisma.jobBoardEmployer.findUnique({
    where: { id: employerId },
    select: { companyName: true, email: true, websiteUrl: true, Startup: { select: { name: true } } },
  });
  if (!e) return null;
  const domains = new Set<string>();
  const site = websiteDomain(e.websiteUrl);
  if (site) domains.add(site);
  const own = emailDomain(e.email);
  if (own && !isFreeMailDomain(own)) domains.add(registrableDomain(own));
  const names = new Set([e.companyName, e.Startup?.name].filter((n): n is string => !!n).map((n) => n.trim().toLowerCase()));
  return { domains, names };
}

/** True when this person works at the company (so the company never sees its own staff on the network). */
export function worksAt(person: { email: string; currentCompany: string | null }, company: { domains: Set<string>; names: Set<string> }) {
  const d = emailDomain(person.email);
  if (d && !isFreeMailDomain(d) && company.domains.has(registrableDomain(d))) return true;
  return !!person.currentCompany && company.names.has(person.currentCompany.trim().toLowerCase());
}

/** Profiles this company can see right now, as anonymous cards. */
export async function searchNetwork(employerId: string, now = new Date()): Promise<NetworkCard[]> {
  const company = await companyIdentity(employerId);
  if (!company) return [];
  const profiles = await prisma.jobBoardOpenProfile.findMany({
    where: { visibleUntil: { gt: now }, pausedAt: null, NOT: { blockedEmployerIds: { has: employerId } } },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_LIMIT,
    select: {
      id: true, headline: true, experienceYears: true, skills: true, city: true, workMode: true, noticePeriodDays: true,
      currentCompany: true, showCompany: true, WebUser: { select: { email: true } },
    },
  });
  if (!profiles.length) return [];
  const ids = profiles.map((p) => p.id);
  const emails = profiles.map((p) => p.WebUser.email);
  const [pending, mine, applied] = await Promise.all([
    prisma.jobBoardIntroRequest.groupBy({ by: ['profileId'], where: { profileId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.jobBoardIntroRequest.findMany({
      where: { employerId, profileId: { in: ids }, createdAt: { gt: new Date(now.getTime() - REPEAT_REQUEST_DAYS * DAY) } },
      orderBy: { createdAt: 'desc' },
      select: { profileId: true, createdAt: true },
    }),
    prisma.jobBoardApplication.findMany({
      where: { Listing: { employerId }, email: { in: emails, mode: 'insensitive' } },
      select: { email: true },
    }),
  ]);
  const busy = new Set(pending.filter((p) => p._count._all >= PENDING_CAP).map((p) => p.profileId));
  const askedAt = new Map<string, Date>();
  for (const r of mine) if (!askedAt.has(r.profileId)) askedAt.set(r.profileId, r.createdAt);
  const appliedEmails = new Set(applied.map((a) => a.email.toLowerCase()));

  return profiles
    .filter((p) => !worksAt({ email: p.WebUser.email, currentCompany: p.currentCompany }, company))
    .filter((p) => !appliedEmails.has(p.WebUser.email.toLowerCase()))
    // Someone this company already asked stays listed (marked "Requested"), even if their inbox is full.
    .filter((p) => askedAt.has(p.id) || !busy.has(p.id))
    .map((p) => toNetworkCard(p, askedAt.get(p.id) ?? null));
}

export type RequestResult = { ok: true; id: string; left: number } | { ok: false; error: string; status: number };

/** Ask one person to apply for one open job, with a personal note. Every limit is checked here, not on the page. */
export async function requestIntro(opts: { employerId: string; sentByEmail: string; profileId: unknown; listingId: unknown; message: unknown }, now = new Date()): Promise<RequestResult> {
  const access = await networkAccess(opts.employerId, now);
  if (!access.allowed) {
    return access.reason === 'paused'
      ? { ok: false, error: 'Requests are paused for your company while our team reviews a report. We’ll email you.', status: 403 }
      : { ok: false, error: 'Open to opportunities is in a pilot and isn’t on for your company yet.', status: 403 };
  }
  if (access.left < 1) return { ok: false, error: `You’ve used all ${access.allowance} requests this month.`, status: 429 };

  const message = cleanIntroMessage(opts.message);
  if (!message.ok) return { ok: false, error: message.error, status: 400 };

  const listing = await prisma.jobBoardListing.findFirst({
    where: { id: String(opts.listingId ?? ''), employerId: opts.employerId, ...publicListingWhere(), applicationType: { not: 'EXTERNAL' } },
    select: { id: true, title: true },
  });
  if (!listing) return { ok: false, error: 'Choose one of your open jobs.', status: 400 };

  const profileId = String(opts.profileId ?? '');
  // The same checks as search: if they wouldn't be listed, they can't be asked.
  const visible = (await searchNetwork(opts.employerId, now)).find((c) => c.id === profileId);
  if (!visible) return { ok: false, error: 'This person isn’t available any more.', status: 404 };
  if (visible.requestedAt) return { ok: false, error: `You asked this person recently. You can ask again ${REPEAT_REQUEST_DAYS} days after your last request.`, status: 409 };

  const profile = await prisma.jobBoardOpenProfile.findUnique({ where: { id: profileId }, select: { id: true, WebUser: { select: { email: true } } } });
  if (!profile) return { ok: false, error: 'This person isn’t available any more.', status: 404 };

  const created = await prisma.jobBoardIntroRequest.create({
    data: { profileId, employerId: opts.employerId, listingId: listing.id, message: message.message, sentByEmail: opts.sentByEmail },
    select: { id: true },
  });
  const { company } = await employerContext(opts.employerId);
  await sendIntroEmail({ to: profile.WebUser.email, profileId, company, jobTitle: listing.title, message: message.message, requestId: created.id }).catch(() => null);
  return { ok: true, id: created.id, left: access.left - 1 };
}

export interface SentRequest {
  id: string;
  jobTitle: string;
  headline: string;
  status: IntroStatus;
  statusText: string;
  createdAt: string;
  applicationId: string | null;
}

/** Requests this company sent (the last 90 days), as the company sees them. */
export async function sentRequests(employerId: string, now = new Date()) {
  return prisma.jobBoardIntroRequest.findMany({
    where: { employerId, createdAt: { gt: new Date(now.getTime() - REPEAT_REQUEST_DAYS * DAY) } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, status: true, createdAt: true, applicationId: true, Listing: { select: { title: true } }, Profile: { select: { headline: true } } },
  });
}

/**
 * Daily, from the data-retention job:
 * 1. unanswered requests expire after REQUEST_EXPIRE_DAYS;
 * 2. a reminder RENEW_REMINDER_DAYS before a profile ends (once);
 * 3. profiles ended more than 30 days ago are deleted, with their requests.
 */
export async function runNetworkMaintenance(now = new Date()) {
  const t = now.getTime();
  const expired = await prisma.jobBoardIntroRequest.updateMany({
    where: { status: 'PENDING', createdAt: { lt: new Date(t - REQUEST_EXPIRE_DAYS * DAY) } },
    data: { status: 'EXPIRED' },
  });

  const ending = await prisma.jobBoardOpenProfile.findMany({
    where: { renewReminderAt: null, pausedAt: null, visibleUntil: { gt: now, lt: new Date(t + RENEW_REMINDER_DAYS * DAY) } },
    select: { id: true, visibleUntil: true, WebUser: { select: { email: true, name: true } } },
    take: 500,
  });
  let reminded = 0;
  for (const p of ending) {
    const r = await sendEmail({
      to: p.WebUser.email,
      subject: 'Your “Open to opportunities” profile ends soon',
      type: 'network_renew_reminder',
      headers: networkEmailHeaders(p.id),
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Still open to opportunities?</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Hi ${esc(p.WebUser.name.split(' ')[0] || 'there')}, companies on Udyaibase stop seeing your anonymous profile on ${p.visibleUntil.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}. Keep it on for another 90 days with one click, or let it end.</p>
<p style="margin:0 0 24px">${button(`${SITE()}/open-to-work`, 'Keep me visible')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">If you do nothing, your profile ends and is deleted 30 days later.</p>`),
    });
    if (r.success) {
      reminded++;
      await prisma.jobBoardOpenProfile.update({ where: { id: p.id }, data: { renewReminderAt: now } });
    }
  }

  const removed = await prisma.jobBoardOpenProfile.deleteMany({ where: { visibleUntil: { lt: new Date(t - 30 * DAY) } } });
  return { networkRequestsExpired: expired.count, networkRenewReminders: reminded, networkProfilesRemoved: removed.count };
}
