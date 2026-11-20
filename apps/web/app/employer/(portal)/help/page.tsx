import { redirect } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { effectivePlan } from '@/lib/employer/plans';
import { replyPromise } from '@/lib/support/reply-times';
import HelpCenter from '@/components/employer/help/HelpCenter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Help' };

/** Help: answers to common questions, and "Report a problem" with the reply-time promise for this plan. */
export default async function EmployerHelpPage(props: { searchParams: Promise<{ from?: string; topic?: string }> }) {
  const session = await getEmployerSession();
  if (!session) redirect('/employer/login');
  const sp = await props.searchParams;
  const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { plan: true, planExpiresAt: true } });
  const plan = employer ? effectivePlan(employer) : null;
  const from = typeof sp.from === 'string' && sp.from.startsWith('/employer') ? sp.from.slice(0, 200) : null;
  const jobId = from?.match(/\/employer\/jobs\/([a-z0-9]{20,30})/)?.[1] ?? from?.match(/[?&]job=([a-z0-9]{20,30})/)?.[1] ?? null;
  const whatsapp = plan?.key === 'SCALE' ? (process.env.SUPPORT_WHATSAPP_NUMBER || '').replace(/[^\d]/g, '') || null : null;
  return (
    <HelpCenter
      planName={plan?.name ?? 'Free'}
      promise={{ normal: replyPromise(plan?.key ?? 'FREE', false).text, urgent: replyPromise(plan?.key ?? 'FREE', true).text }}
      context={{ page: from, jobId }}
      whatsapp={whatsapp}
      initialTopic={typeof sp.topic === 'string' ? sp.topic : null}
    />
  );
}
