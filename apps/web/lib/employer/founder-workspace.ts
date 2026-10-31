import { prisma } from '@udyaibase/database';
import { setEmployerSession } from '@/lib/employer-auth';
import { founderOwnsVerifiedStartup } from '@/lib/startups/ownership';

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
 * Opens (or creates) the hiring workspace of a startup the founder has verified, and signs them in.
 * The founder portal is the source of truth for ownership, so no second claim is needed here.
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
        throw new WorkspaceError(`${startup.name} already has a hiring workspace run by a teammate. Ask them to invite you.`, 409, 'workspace_exists');
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
    const byEmail = await prisma.jobBoardEmployer.findUnique({ where: { email: founder.email.toLowerCase() } });
    if (byEmail && byEmail.startupId && byEmail.startupId !== startup.id) {
      throw new WorkspaceError('Your email already runs hiring for another startup. Sign in to the employer portal with that account instead.', 409, 'email_in_use');
    }
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
      : await prisma.jobBoardEmployer.create({
          data: { ...data, email: founder.email.toLowerCase(), passwordHash: FOUNDER_SSO_MARKER, slug: await uniqueEmployerSlug(startup.name) },
        });
    employerId = employer.id;
  }

  // Jobs posted for this startup belong to its workspace.
  await prisma.jobBoardListing.updateMany({ where: { employerId, deletedAt: null }, data: { startupId: startup.id } });

  const e = await prisma.jobBoardEmployer.findUniqueOrThrow({ where: { id: employerId } });
  await setEmployerSession({ id: e.id, email: e.email, companyName: e.companyName, slug: e.slug, plan: e.plan, onboardingCompleted: true });
  return e;
}

/** The founder's hiring workspace, if they already opened one. */
export function findFounderWorkspace(founderUserId: string) {
  return prisma.jobBoardEmployer.findFirst({
    where: { founderUserId, isActive: true, deactivatedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
}
