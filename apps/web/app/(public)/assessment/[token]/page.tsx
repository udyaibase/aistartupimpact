import Link from 'next/link';
import { assessmentByToken } from '@/lib/employer/assessments';
import AssessmentSubmit from '@/components/jobs/candidate/AssessmentSubmit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your assessment', robots: { index: false, follow: false } };

const DONE: Record<string, string> = {
  EXTERNAL: 'Thanks for letting us know you’ve finished. The team will be in touch.',
  QUESTIONS: 'Your answers are in. The team will be in touch.',
};

/** A candidate's assessment: the brief and deadline, and the right way to hand in for its type. */
export default async function AssessmentPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const a = await assessmentByToken(token);
  if (!a || a.Application.withdrawnAt || a.status === 'CANCELLED') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center font-jakarta">
        <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">This assessment isn’t open</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Check the latest email from the hiring team.</p>
        <Link href="/jobs" className="btn-brand mt-6">Browse AI jobs</Link>
      </div>
    );
  }
  const due = a.dueAt?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
  const closed = a.status !== 'SENT' || (!!a.dueAt && a.dueAt < new Date());
  const questions = Array.isArray(a.questions) ? (a.questions as unknown[]).filter((q): q is string => typeof q === 'string') : [];
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16 font-jakarta">
      <p className="text-sm text-gray-500">{a.Application.Listing.title}</p>
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">{a.title || 'Your assessment'}</h1>
      {due && <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Due <strong>{due} IST</strong></p>}
      {a.brief && <div className="mt-6 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-[15px] leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">{a.brief}</div>}
      {a.url && !(a.kind === 'EXTERNAL' && (a.status === 'SUBMITTED' || a.status === 'REVIEWED')) && (
        <p className="mt-4">
          <a href={a.url} target="_blank" rel="noopener noreferrer" className={a.kind === 'EXTERNAL' ? 'btn-brand' : 'font-semibold underline text-sm'}>
            {a.kind === 'EXTERNAL' ? 'Start the test' : 'Open the materials'}
          </a>
        </p>
      )}
      {a.status === 'SUBMITTED' || a.status === 'REVIEWED'
        ? <p role="status" className="mt-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm text-green-900 dark:text-green-200">{DONE[a.kind] ?? 'Handed in. The team will be in touch.'}</p>
        : closed
          ? <p role="status" className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-900 dark:text-amber-200">The deadline has passed. Reply to the team’s email if you need more time.</p>
          : <AssessmentSubmit token={token} kind={a.kind} questions={questions} />}
    </div>
  );
}
