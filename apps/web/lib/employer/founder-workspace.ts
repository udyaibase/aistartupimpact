import { prisma } from '@udyaibase/database';
import { setEmployerSession } from '@/lib/employer-auth';
import { founderOwnsVerifiedStartup } from '@/lib/startups/ownership';
import { ensureOwnerMember, internalAccountEmail } from '@/lib/employer/owners';
import { ownerInboxes } from '@/lib/employer/team';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';

/** passwordHash marker for workspaces that sign in through the founder portal (never a valid bcrypt hash). */
export const FOUNDER_SSO_MARKER = '!founder-sso';

export class WorkspaceError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}

async function uniqueEmployerSlug(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'company';
  const taken = await prisma.jobBoardEmployer.findUnique({ where: { slug: base }, select: { id: true } });
  return taken ? `${base}-${Date.now().toString(36)}` : base;
}

/**
 * Opens (or creates) the hiring workspace of a startup the founder has verified, and signs them in as an Owner.
 * The founder portal is the source of truth for ownership, so no second claim is needed here:
 * - No workspace yet: one is created, verified, with the founder as Owner.
 * - A teammate already runs a verified workspace: the founder joins it as Owner (owners are told).
 * - The founder already owns a workspace for another startup: this one gets its own workspace too.
 */
export async function openFounderWorkspace(founderUserId: string, startupId: string) {
  const startup = await founderOwnsVerifiedStartup(founderUserId, startupId);
  if (!startup) throw new WorkspaceError('Verify ownership of this startup first.', 403, 'not_verified');

  const founder = await prisma.founderUser.findUnique({ where: { id: founderUserId }, select: { email: true, name: true, emailVerified: true } });
  if (!founder) throw new WorkspaceError('Founder account not found.', 404);

  let existing = await prisma.jobBoardEmployer.findFirst({ where: { startupId: startup.id } });
  if (existing) {
    const isPlaceholder = existing.passwordHash === '';
    const isMine = existing.founderUserId === founderUserId || existing.email.toLowerCase() === founder.email.toLowerCase();
    const verifiedClaim = existing.startupClaimMethod === 'DOMAIN_OTP' || existing.startupClaimMethod === 'ADMIN' || existing.startupClaimMethod === 'FOUNDER';
    if (!isPlaceholder && !isMine) {
      if (verifiedClaim) {
        // A verified founder always gets Owner access to their own startup's workspace.
        const owners = await ownerInboxes(existing.id);
        const member = await ensureOwnerMember(existing.id, { email: founder.email, name: founder.name });
        if (!member) throw new WorkspaceError('Founder account email can’t be used for hiring.', 400);
        if (!existing.founderUserId) await prisma.jobBoardEmployer.update({ where: { id: existing.id }, data: { founderUserId } });
        for (const to of owners.filter((o) => o !== founder.email.toLowerCase())) sendFounderJoinedEmail(to, founder.name ?? founder.email, founder.email, startup.name);
        await setEmployerSession({ id: existing.id, email: existing.email, companyName: existing.companyName, slug: existing.slug, plan: existing.plan, onboardingCompleted: true }, { id: member.id, email: member.email });
        return existing;
      }
      // Someone else's unverified link: release it (never hand over their account), then create ours.
      await prisma.jobBoardEmployer.update({ where: { id: existing.id }, data: { startupId: null, startupClaimMethod: null, startupClaimVerifiedAt: null } });
      await prisma.jobBoardListing.updateMany({ where: { employerId: existing.id }, data: { startupId: null } });
      existing = null;
    }
  }

  let employerId: string;
  if (existing) {
    // Our own workspace, or an admin-created placeholder whose jobs now move to the verified founder.
    const isPlaceholder = existing.passwordHash === '';
    const emailFree = !(await prisma.jobBoardEmployer.findFirst({ where: { email: founder.email.toLowerCase(), id: { not: existing.id } }, select: { id: true } }));
    const updated = await prisma.jobBoardEmployer.update({
      where: { id: existing.id },
      data: {
        founderUserId,
        startupClaimMethod: 'FOUNDER',
        startupClaimVerifiedAt: new Date(),
        verifiedCompanyDomain: startup.verifiedDomain,
        emailVerified: true,
        onboardingCompleted: true,
        isActive: true,
        deactivatedAt: null,
        ...(isPlaceholder ? { passwordHash: FOUNDER_SSO_MARKER, ...(emailFree ? { email: founder.email.toLowerCase() } : {}) } : {}),
      },
    });
    employerId = updated.id;
  } else {
    // A founder may already have an employer login under their email (e.g. signed up earlier): link it.
    const found = await prisma.jobBoardEmployer.findUnique({ where: { email: founder.email.toLowerCase() } });
    // That email already runs hiring for another startup: this startup gets its own workspace with an internal
    // account address, and the founder owns it through their OWNER row.
    const byEmail = found && found.startupId && found.startupId !== startup.id ? null : found;
    const accountEmail = found && !byEmail ? null : founder.email.toLowerCase();
    const data = {
      founderUserId,
      startupId: startup.id,
      startupClaimMethod: 'FOUNDER' as const,
      startupClaimVerifiedAt: new Date(),
      verifiedCompanyDomain: startup.verifiedDomain,
      emailVerified: true,
      onboardingCompleted: true,
      companyName: startup.name,
      logoUrl: startup.logoUrl,
      websiteUrl: startup.websiteUrl,
    };
    const employer = byEmail
      ? await prisma.jobBoardEmployer.update({ where: { id: byEmail.id }, data })
      : await (async () => {
          const slug = await uniqueEmployerSlug(startup.name);
          return prisma.jobBoardEmployer.create({
            data: { ...data, email: accountEmail ?? internalAccountEmail(slug), passwordHash: FOUNDER_SSO_MARKER, slug },
          });
        })();
    employerId = employer.id;
  }

  // Jobs posted for this startup belong to its workspace.
  await prisma.jobBoardListing.updateMany({ where: { employerId, deletedAt: null }, data: { startupId: startup.id } });

  const e = await prisma.jobBoardEmployer.findUniqueOrThrow({ where: { id: employerId } });
  const member = await ensureOwnerMember(e.id, { email: founder.email, name: founder.name });
  await setEmployerSession(
    { id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true },
    member ? { id: member.id, email: member.email } : undefined,
  );
  return e;
}

function sendFounderJoinedEmail(to: string, who: string, email: string, startupName: string) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  sendEmailFireAndForget({
    to,
    subject: `${who} joined ${startupName}'s hiring team as Owner`,
    type: 'employer_founder_joined',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">${esc(who)} joined as Owner</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${esc(email)} is a verified founder of ${esc(startupName)} on Udyaibase, so they now have Owner access to your hiring workspace.</p>
<p style="margin:0 0 24px">${button(`${site}/employer/team`, 'See your team')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Not expected? Reply to this email and we’ll look into it.</p>`),
  });
}

/** The founder's hiring workspace, if they already opened one. */
export function findFounderWorkspace(founderUserId: string) {
  return prisma.jobBoardEmployer.findFirst({
    where: { founderUserId, isActive: true, deactivatedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
}
