import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@udyaibase/database';
import { sql } from '@/lib/db';
import { sendEmail, sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { emailDomain, isFreeMailDomain, registrableDomain, websiteDomain, VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';
import { CODE_ONLY_MARKER, ensureOwnerMember, internalAccountEmail } from '@/lib/employer/owners';
import { ownerInboxes } from '@/lib/employer/team';
import { uniqueEmployerSlug } from '@/lib/employer/founder-workspace';
import { employerSubmitter } from '@/lib/startups/ownership';
import { setEmployerSession } from '@/lib/employer-auth';
import { needsTwoFactor, signInMemberships } from '@/lib/employer/sign-in';
import { ROLE_LABEL } from '@/lib/employer/roles';

/**
 * Employer signup without passwords: work email → code → company → first job.
 * After the code, a short-lived signed "verified email" pass (cookie) carries the address through the company
 * step; no account exists until a workspace is created. A work-email domain matching the company's website
 * verifies the company in the same step.
 */

export { CODE_ONLY_MARKER } from '@/lib/employer/owners';
export const SIGNUP_PURPOSE = 'employer_signup_code';
const PASS_COOKIE = 'employer_signup';
const PASS_MINUTES = 30;
const SECRET = new TextEncoder().encode(process.env.EMPLOYER_JWT_SECRET || process.env.USER_JWT_SECRET!);
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
/** After a declined request, the same person can ask again after this many days. */
export const REQUEST_COOLOFF_DAYS = 30;

export async function setSignupPass(email: string) {
  const jwt = await new SignJWT({ email: email.toLowerCase(), purpose: 'employer-signup' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${PASS_MINUTES}m`).sign(SECRET);
  (await cookies()).set(PASS_COOKIE, jwt, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: PASS_MINUTES * 60, path: '/' });
}

/** The verified email from the signup pass, or null when missing or expired. */
export async function signupEmail(): Promise<string | null> {
  const raw = (await cookies()).get(PASS_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, SECRET);
    return payload.purpose === 'employer-signup' && typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function clearSignupPass() {
  (await cookies()).delete(PASS_COOKIE);
}

/** Send the 6-digit signup code (callers rate-limit per IP and per email). Same answer whether or not the email exists. */
export async function sendSignupCode(email: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const recent = await sql`SELECT EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int AS age FROM "EmailOtp" WHERE email = ${email} AND purpose = ${SIGNUP_PURPOSE} ORDER BY "createdAt" DESC LIMIT 1`;
  const age = (recent[0] as { age: number } | undefined)?.age;
  if (age !== undefined && age < 60) return { ok: false, status: 429, error: `Please wait ${60 - age} seconds before requesting another code.` };
  const code = crypto.randomInt(100000, 1000000).toString();
  await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = ${SIGNUP_PURPOSE}`;
  await sql`INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
    VALUES (gen_random_uuid()::text, ${email}, ${crypto.createHash('sha256').update(code).digest('hex')}, ${SIGNUP_PURPOSE}, ${new Date(Date.now() + 600_000).toISOString()}::timestamp, NOW())`;
  const sent = await sendEmail({
    to: email,
    subject: `${code} is your Udyaibase code`,
    type: 'employer_signup_code',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your code</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Enter this code to start hiring on Udyaibase:</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
<p style="margin:0;font-size:13px;color:#6b7280">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`),
  });
  return sent.success ? { ok: true } : { ok: false, status: 502, error: 'We couldn’t send the code. Try again in a minute.' };
}

const STARTUP_SELECT = { id: true, name: true, logoUrl: true, websiteUrl: true, headquartersCity: true, tagline: true } as const;
type StartupRow = { id: string; name: string; logoUrl: string | null; websiteUrl: string | null; headquartersCity: string | null; tagline: string };

/** A real, verified hiring workspace for this startup (not an admin placeholder). */
function existingTeam(startupId: string) {
  return prisma.jobBoardEmployer.findFirst({
    where: { startupId, passwordHash: { not: '' }, isActive: true, deactivatedAt: null, deletedAt: null, startupClaimMethod: { in: [...VERIFIED_CLAIM_METHODS] } },
    select: { id: true, companyName: true },
  });
}

async function withTeams(rows: StartupRow[]) {
  return Promise.all(rows.map(async (s) => ({
    id: s.id, name: s.name, logoUrl: s.logoUrl, city: s.headquartersCity, tagline: s.tagline, domain: websiteDomain(s.websiteUrl),
    hasTeam: !!(await existingTeam(s.id)),
  })));
}

/** What the company step shows: startups matching the email's domain, and teams the person is already on. */
export async function companyOptions(email: string) {
  const host = emailDomain(email);
  const domain = host ? registrableDomain(host) : null;
  const freeMail = !domain || isFreeMailDomain(domain);
  const candidates = freeMail ? [] : await prisma.startup.findMany({
    where: { deletedAt: null, websiteUrl: { contains: domain!, mode: 'insensitive' } },
    select: STARTUP_SELECT,
    take: 10,
  });
  const matches = await withTeams(candidates.filter((s) => websiteDomain(s.websiteUrl) === domain).slice(0, 3));
  const teams = (await signInMemberships(email)).filter((m) => !needsTwoFactor(m)).map((m) => ({
    employerId: m.employerId, companyName: m.Employer.companyName, logoUrl: m.Employer.logoUrl, role: ROLE_LABEL[m.role], invited: m.status === 'PENDING',
  }));
  return { email, domain: freeMail ? null : domain, freeMail, matches, teams };
}

/** Startups by name, for people whose email doesn't identify their company. */
export async function searchStartups(q: string) {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const rows = await prisma.startup.findMany({
    where: { deletedAt: null, name: { contains: term, mode: 'insensitive' } },
    select: STARTUP_SELECT,
    orderBy: [{ isVerified: 'desc' }, { name: 'asc' }],
    take: 8,
  });
  return withTeams(rows);
}

/** Sign in to a newly created or joined workspace as the given member. */
async function enter(employerId: string, memberId: string, memberEmail: string) {
  const e = await prisma.jobBoardEmployer.findUniqueOrThrow({ where: { id: employerId } });
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true }, { id: memberId, email: memberEmail });
  await clearSignupPass();
}

/**
 * Create a workspace owned by this email, linked to the chosen startup. It starts as drafts only: only the
 * startup's founder can verify the startup (founder portal), and their "Start hiring" takes this workspace over,
 * which unlocks publishing.
 */
export async function createWorkspace(email: string, startup: StartupRow | null, company: { name: string; websiteUrl: string | null }) {
  const slug = await uniqueEmployerSlug(company.name);
  // One account email per workspace: someone who already owns a workspace gets an internal account address here.
  const emailTaken = !!(await prisma.jobBoardEmployer.findUnique({ where: { email }, select: { id: true } }));
  const employer = await prisma.jobBoardEmployer.create({
    data: {
      email: emailTaken ? internalAccountEmail(slug) : email,
      passwordHash: CODE_ONLY_MARKER,
      companyName: company.name,
      slug,
      logoUrl: startup?.logoUrl ?? null,
      websiteUrl: company.websiteUrl,
      emailVerified: true,
      onboardingCompleted: true,
      // Linked but not trusted (no claim method): drafts only, and public pages keep the workspace's own name.
      startupId: startup?.id ?? null,
    },
  });
  const member = await ensureOwnerMember(employer.id, { email });
  if (!member) throw new Error('owner_row');
  await enter(employer.id, member.id, member.email);
  return { employerId: employer.id };
}

/** Add a company that isn't on Udyaibase yet (waits for directory approval), then its workspace. */
export async function addCompany(email: string, name: string, website: string) {
  const domain = websiteDomain(website);
  if (!domain) return { error: 'Enter your company website, like acme.ai.', field: 'websiteUrl' as const };
  const same = await prisma.startup.findFirst({ where: { deletedAt: null, websiteUrl: { contains: domain, mode: 'insensitive' } }, select: STARTUP_SELECT });
  if (same && websiteDomain(same.websiteUrl) === domain) return { existing: (await withTeams([same]))[0] };

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'startup';
  const taken = await prisma.startup.findUnique({ where: { slug: base }, select: { id: true } });
  const startup = await prisma.startup.create({
    data: {
      id: randomUUID(), name, slug: taken ? `${base}-${randomUUID().slice(0, 6)}` : base,
      tagline: `${name} is hiring on Udyaibase`, description: `${name} is hiring on Udyaibase.`,
      websiteUrl: `https://${domain}`, claimStatus: 'PENDING', updatedAt: new Date(),
    },
    select: STARTUP_SELECT,
  });
  const created = await createWorkspace(email, startup, { name, websiteUrl: `https://${domain}` });
  // Shows up for directory review like other employer-added startups.
  await prisma.startup.update({ where: { id: startup.id }, data: { submittedBy: employerSubmitter(created.employerId) } });
  return { created };
}

/**
 * Ask to join a startup's existing hiring team. Owners approve on the Team page. An invite already waiting for
 * this email is accepted instead (the code proved the address).
 */
export async function requestToJoin(email: string, startupId: string) {
  const team = await existingTeam(startupId);
  if (!team) return { noTeam: true as const };
  const row = await prisma.jobBoardTeamMember.findUnique({ where: { employerId_email: { employerId: team.id, email } } });
  if (row?.status === 'ACTIVE') return { error: `You’re already on ${team.companyName}’s team. Sign in instead.`, signIn: true };
  if (row?.status === 'PENDING') {
    const m = await prisma.jobBoardTeamMember.update({ where: { id: row.id }, data: { status: 'ACTIVE', acceptedAt: new Date(), lastActiveAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null } });
    await enter(team.id, m.id, m.email);
    return { joined: true, company: team.companyName };
  }
  if (row?.status === 'REQUESTED') return { requested: true, company: team.companyName };
  if (row?.status === 'DECLINED' && row.updatedAt.getTime() > Date.now() - REQUEST_COOLOFF_DAYS * 864e5) {
    return { error: `Your request to join ${team.companyName} was declined recently. You can ask again after ${REQUEST_COOLOFF_DAYS} days.` };
  }
  await prisma.jobBoardTeamMember.upsert({
    where: { employerId_email: { employerId: team.id, email } },
    create: { employerId: team.id, email, role: 'RECRUITER', status: 'REQUESTED', invitedByEmail: email, invitedAt: new Date() },
    update: { role: 'RECRUITER', status: 'REQUESTED', jobIds: [], invitedByEmail: email, invitedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
  });
  for (const to of await ownerInboxes(team.id)) {
    sendEmailFireAndForget({
      to,
      subject: `${email} wants to join ${team.companyName}'s hiring team`,
      type: 'employer_join_request',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">New request to join your hiring team</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6"><strong>${esc(email)}</strong> asked to join ${esc(team.companyName)} on Udyaibase. They can’t see anything until an owner approves.</p>
<p style="margin:0 0 24px">${button(`${SITE()}/employer/team`, 'Review the request')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Don’t recognise them? Decline the request; they can’t ask again for ${REQUEST_COOLOFF_DAYS} days.</p>`),
    });
  }
  await clearSignupPass();
  return { requested: true, company: team.companyName };
}

/** Continue into a team this person is already on (or invited to), from the signup flow. */
export async function continueToTeam(email: string, employerId: string) {
  const m = (await signInMemberships(email)).find((x) => x.employerId === employerId);
  if (!m || needsTwoFactor(m)) return { error: 'Sign in from the sign-in page to open that team.' };
  if (m.status === 'PENDING') await prisma.jobBoardTeamMember.update({ where: { id: m.id }, data: { status: 'ACTIVE', acceptedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null } });
  await prisma.jobBoardTeamMember.update({ where: { id: m.id }, data: { lastActiveAt: new Date() } });
  await enter(m.employerId, m.id, m.email);
  return { redirect: m.role === 'INTERVIEWER' ? '/employer/applications' : '/employer/dashboard' };
}
