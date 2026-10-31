import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@udyaibase/database';
import { hashToken } from '@/lib/employer/team';
import { employerContext } from '@/lib/employer/applications';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/employer/roles';
import JoinForm from './JoinForm';

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
    <div className="min-h-[100dvh] bg-[#F7F7F9] dark:bg-gray-950 flex items-center justify-center px-4 py-10 font-jakarta">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-6 sm:p-8">
        {valid ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">{member.invitedByEmail} invited you to</p>
            <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white mt-1">Join {company}&apos;s hiring team</h1>
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
              You&apos;ll join as <strong>{ROLE_LABEL[member.role]}</strong>: {ROLE_DESCRIPTION[member.role]}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Signing in as {member.email}. No password needed.</p>
            <JoinForm token={token} />
          </>
        ) : (
          <>
            <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">This invite isn’t valid</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">It may have expired, been used already, or been cancelled. Ask the person who invited you to send a new one.</p>
            <Link href="/employer/login" className="btn-brand mt-5">Go to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
