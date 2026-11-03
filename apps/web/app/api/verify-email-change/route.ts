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
        await tx.founderUser.update({
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

      await prisma.$transaction(async (tx) => {
        await tx.newsletterSubscriber.updateMany({
          where: { email: organizer.email },
          data: { email: organizer.pendingEmail! },
        });
        await tx.eventOrganizer.update({
          where: { id: organizer.id },
          data: {
            email: organizer.pendingEmail!,
            pendingEmail: null,
            emailChangeToken: null,
            emailChangeTokenExpiry: null,
          },
        });
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
