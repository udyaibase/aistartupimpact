import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@udyaibase/database';
import { hashToken } from '@/lib/employer/team';
import { employerContext } from '@/lib/employer/applications';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/employer/roles';
import JoinForm from './JoinForm';
import { InviteCard, InviteFooter, InviteHeading, InviteShell } from '@/components/invite/InviteFrame';
import { CONTROL_PRIMARY } from '@/lib/ui/form-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join your hiring team', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function JoinPage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await props.searchParams;
  const member = token
    ? await prisma.jobBoardTeamMember.findUnique({ where: { inviteTokenHash: hashToken(token) }, select: { email: true, role: true, status: true, inviteExpiresAt: true, invitedByEmail: true, employerId: true } })
    : null;
  const valid = member && member.status === 'PENDING' && (!member.inviteExpiresAt || member.inviteExpiresAt > new Date());
  const company = valid ? (await employerContext(member.employerId)).company : null;

  return (
    // Same frame as every team invitation (organizer, founder): logo, centered card, locked email, one button.
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950 flex items-start sm:items-center justify-center px-4 pt-12 pb-24 sm:py-12">
      <InviteShell>
        {valid ? (
          <>
            <InviteCard>
              <InviteHeading team={`the ${company} hiring team`} inviter={member.invitedByEmail} role={ROLE_LABEL[member.role]} detail={ROLE_DESCRIPTION[member.role]} />
              <JoinForm token={token} email={member.email} />
            </InviteCard>
            <InviteFooter expiresAt={member.inviteExpiresAt} />
          </>
        ) : (
          <InviteCard>
            <div className="text-center">
              <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">This invitation isn’t valid</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">It may have expired, been used already, or been cancelled. Ask the person who invited you to send a new one.</p>
              <Link href="/employer/login" className={`${CONTROL_PRIMARY} mt-6`}>Go to sign in</Link>
            </div>
          </InviteCard>
        )}
      </InviteShell>
    </div>
  );
}
