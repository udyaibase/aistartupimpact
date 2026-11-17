import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const type = searchParams.get('type');

    if (!token || !type) {
      return redirectWithMessage('Invalid verification link');
    }

    if (!['founder', 'user', 'employer', 'organizer'].includes(type)) {
      return redirectWithMessage('Invalid account type');
    }

    if (type === 'founder') {
      const user = await prisma.founderUser.findUnique({ where: { emailChangeToken: token } });
      if (!user || !user.pendingEmail || !user.emailChangeTokenExpiry) {
        return redirectWithMessage('Invalid or expired verification link');
      }
      if (new Date() > user.emailChangeTokenExpiry) {
        await prisma.founderUser.update({
          where: { id: user.id },
          data: { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null },
        });
        return redirectWithMessage('Verification link has expired. Please request a new one.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.newsletterSubscriber.updateMany({
          where: { email: user.email },
          data: { email: user.pendingEmail! },
        });
        // One person, one address: their other sign-in records move too, or the accounts would split.
        const oldEmail = user.email.toLowerCase();
        await tx.accountTwoFactor.updateMany({ where: { email: oldEmail }, data: { email: user.pendingEmail!.toLowerCase() } });
        await tx.webUser.updateMany({ where: { email: oldEmail }, data: { email: user.pendingEmail! } });
        await tx.unifiedUser.updateMany({ where: { email: oldEmail }, data: { email: user.pendingEmail! } });
        await tx.eventOrganizer.updateMany({ where: { email: oldEmail }, data: { email: user.pendingEmail! } });
        await tx.founderUser.update({
          where: { id: user.id },
          data: {
            email: user.pendingEmail!,
            sessionsValidAfter: new Date(),
            pendingEmail: null,
            emailChangeToken: null,
            emailChangeTokenExpiry: null,
          },
        });
      });

      return redirectWithMessage('Email changed successfully! Please log in again.', true);
    }

    if (type === 'user') {
      const user = await prisma.webUser.findUnique({ where: { emailChangeToken: token } });
      if (!user || !user.pendingEmail || !user.emailChangeTokenExpiry) {
        return redirectWithMessage('Invalid or expired verification link');
      }
      if (new Date() > user.emailChangeTokenExpiry) {
        await prisma.webUser.update({
          where: { id: user.id },
          data: { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null },
        });
        return redirectWithMessage('Verification link has expired. Please request a new one.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.newsletterSubscriber.updateMany({
          where: { email: user.email },
          data: { email: user.pendingEmail! },
        });
        await tx.webUser.update({
          where: { id: user.id },
          data: {
            email: user.pendingEmail!,
            pendingEmail: null,
            emailChangeToken: null,
            emailChangeTokenExpiry: null,
          },
        });
      });

      return redirectWithMessage('Email changed successfully! Please log in again.', true);
    }

    if (type === 'employer') {
      const employer = await prisma.jobBoardEmployer.findUnique({ where: { emailChangeToken: token } });
      if (!employer || !employer.pendingEmail || !employer.emailChangeTokenExpiry) {
        return redirectWithMessage('Invalid or expired verification link');
      }
      if (new Date() > employer.emailChangeTokenExpiry) {
        await prisma.jobBoardEmployer.update({
          where: { id: employer.id },
          data: { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null },
        });
        return redirectWithMessage('Verification link has expired. Please request a new one.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.newsletterSubscriber.updateMany({
          where: { email: employer.email },
          data: { email: employer.pendingEmail! },
        });
        await tx.jobBoardEmployer.update({
          where: { id: employer.id },
          data: {
            email: employer.pendingEmail!,
            pendingEmail: null,
            emailChangeToken: null,
            emailChangeTokenExpiry: null,
          },
        });
        // The account owner's OWNER row follows the account email.
        const oldEmail = employer.email.toLowerCase(), newEmail = employer.pendingEmail!.toLowerCase();
        const [oldRow, newRow] = await Promise.all([
          tx.jobBoardTeamMember.findUnique({ where: { employerId_email: { employerId: employer.id, email: oldEmail } } }),
          tx.jobBoardTeamMember.findUnique({ where: { employerId_email: { employerId: employer.id, email: newEmail } } }),
        ]);
        if (newRow) {
          await tx.jobBoardTeamMember.update({ where: { id: newRow.id }, data: { role: 'OWNER', status: 'ACTIVE', jobIds: [], inviteTokenHash: null, inviteExpiresAt: null } });
          if (oldRow) await tx.jobBoardTeamMember.update({ where: { id: oldRow.id }, data: { status: 'REMOVED' } });
        } else if (oldRow) {
          await tx.jobBoardTeamMember.update({ where: { id: oldRow.id }, data: { email: newEmail } });
        }
      });

      return redirectWithMessage('Email changed successfully! Please log in again.', true);
    }

    if (type === 'organizer') {
      const organizer = await prisma.eventOrganizer.findUnique({ where: { emailChangeToken: token } });
      if (!organizer || !organizer.pendingEmail || !organizer.emailChangeTokenExpiry) {
        return redirectWithMessage('Invalid or expired verification link');
      }
      if (new Date() > organizer.emailChangeTokenExpiry) {
        await prisma.eventOrganizer.update({
          where: { id: organizer.id },
          data: { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null },
        });
        return redirectWithMessage('Verification link has expired. Please request a new one.');
      }

      const newEmail = organizer.pendingEmail.trim().toLowerCase();
      const oldEmail = organizer.email;
      // Someone may have taken the address since the change was requested.
      const taken = await prisma.eventOrganizer.findFirst({ where: { id: { not: organizer.id }, email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } });
      if (taken) {
        await prisma.eventOrganizer.update({ where: { id: organizer.id }, data: { pendingEmail: null, emailChangeToken: null, emailChangeTokenExpiry: null } });
        return redirectWithMessage('That email is already in use by another account.');
      }

      await prisma.$transaction(async (tx) => {
        await tx.newsletterSubscriber.updateMany({
          where: { email: oldEmail },
          data: { email: newEmail },
        });
        await tx.eventOrganizer.update({
          where: { id: organizer.id },
          data: {
            email: newEmail,
            pendingEmail: null,
            emailChangeToken: null,
            emailChangeTokenExpiry: null,
          },
        });
        // Team access is matched by email: carry this person's memberships over, so they keep their teams and the
        // old address (which anyone could now register) doesn't inherit them. Where the new address is already on
        // a team, the old row is removed instead.
        const memberships = await tx.eventTeamMember.findMany({
          where: { email: { equals: oldEmail, mode: 'insensitive' }, OR: [{ memberOrganizerId: null }, { memberOrganizerId: organizer.id }] },
          select: { id: true, organizerId: true },
        });
        for (const m of memberships) {
          const clash = await tx.eventTeamMember.findFirst({ where: { organizerId: m.organizerId, id: { not: m.id }, email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } });
          if (clash) await tx.eventTeamMember.update({ where: { id: m.id }, data: { status: 'REVOKED' } });
          else await tx.eventTeamMember.update({ where: { id: m.id }, data: { email: newEmail } });
        }
        // Every device signs in again with the new address.
        await tx.eventOrganizerSession.deleteMany({ where: { organizerId: organizer.id } });
        // The linked sign-in identity follows, unless it also serves a founder profile (whose sign-in email is
        // separate) or the new address already has its own identity.
        if (organizer.unifiedUserId) {
          const unified = await tx.unifiedUser.findUnique({ where: { id: organizer.unifiedUserId }, select: { id: true, founderProfile: { select: { id: true } } } });
          const newTaken = await tx.unifiedUser.findFirst({ where: { email: { equals: newEmail, mode: 'insensitive' } }, select: { id: true } });
          if (unified && !unified.founderProfile && !newTaken) {
            await tx.unifiedUser.update({ where: { id: unified.id }, data: { email: newEmail } });
            await tx.unifiedSession.deleteMany({ where: { userId: unified.id } });
          } else if (unified) {
            // Can't follow: unlink, so the old address's identity no longer opens this workspace.
            await tx.eventOrganizer.update({ where: { id: organizer.id }, data: { unifiedUserId: null } });
          }
        }
      });

      // 2FA is stored once per email. Carry it to the new address unless another of this person's accounts still
      // signs in with the old one (then it stays there).
      const stillUsed = (await prisma.webUser.count({ where: { email: oldEmail.toLowerCase() } })) + (await prisma.founderUser.count({ where: { email: oldEmail.toLowerCase() } }));
      if (!stillUsed) {
        const { moveTwoFactor } = await import('@/lib/auth/account-two-factor');
        await moveTwoFactor(oldEmail, newEmail).catch(() => {});
      }

      // Tell the old address, in case the change wasn't theirs.
      const { sendEmailFireAndForget } = await import('@/lib/email/send');
      sendEmailFireAndForget({
        to: oldEmail,
        subject: 'Your Udyaibase organizer email was changed',
        html: `<p>The sign-in email for your Udyaibase organizer account was changed to a new address.</p><p>If this was you, there is nothing to do. If it wasn't, contact support right away.</p>`,
        type: 'security_alert',
      });

      return redirectWithMessage('Email changed successfully! Please log in again.', true);
    }

    return redirectWithMessage('Invalid request');
  } catch (error) {
    console.error('Email verification error:', error);
    return redirectWithMessage('An error occurred. Please try again.');
  }
}

function redirectWithMessage(message: string, success = false) {
  const baseUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com';
  const params = new URLSearchParams({ message, status: success ? 'success' : 'error' });
  return NextResponse.redirect(`${baseUrl}/?${params.toString()}`);
}
