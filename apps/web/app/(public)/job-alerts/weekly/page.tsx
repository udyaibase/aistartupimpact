import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircle, BellOff, BellRing } from 'lucide-react';
import { confirmJobAlert, unsubscribeJobAlert } from '@/lib/jobs/job-alerts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Job alert', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type Search = { t?: string; a?: string; done?: string; title?: string };

/** Confirm or stop a weekly job alert. Changes happen on a button press, so email scanners can't act on the link. */
export default async function WeeklyJobAlertPage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams;
  const token = typeof sp.t === 'string' ? sp.t : '';
  const action = sp.a === 'unsubscribe' ? 'unsubscribe' : 'confirm';

  async function act(formData: FormData) {
    'use server';
    const t = String(formData.get('t') ?? '');
    const a = formData.get('a') === 'unsubscribe' ? 'unsubscribe' : 'confirm';
    const r = a === 'unsubscribe' ? await unsubscribeJobAlert(t) : await confirmJobAlert(t);
    redirect(`/job-alerts/weekly?${new URLSearchParams(r.ok ? { a, done: '1', title: r.title } : { a, done: 'invalid' })}`);
  }

  const box = 'max-w-md mx-auto my-12 sm:my-20 card p-6 sm:p-8 text-center font-jakarta';
  const btn = 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-brand hover:bg-brand-600 text-white font-semibold text-sm';

  if (sp.done === 'invalid' || (!sp.done && !token)) {
    return (
      <div className={box}>
        <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">This link doesn’t work</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">It may be incomplete. Open the link from your email again, or set up a new alert on the jobs page.</p>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Browse AI jobs</Link>
      </div>
    );
  }
  if (sp.done === '1') {
    return (
      <div className={box}>
        {action === 'unsubscribe' ? <BellOff className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden /> : <BellRing className="w-10 h-10 text-brand mx-auto mb-3" aria-hidden />}
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">{action === 'unsubscribe' ? 'Alert stopped' : 'Your alert is on'}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {action === 'unsubscribe' ? `You won’t get “${sp.title ?? 'this alert'}” emails any more.` : `Every Monday we’ll email you new ${sp.title ?? 'jobs'}. Each email has a link to stop it.`}
        </p>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Browse AI jobs</Link>
      </div>
    );
  }
  return (
    <div className={box}>
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">{action === 'unsubscribe' ? 'Stop this job alert?' : 'Confirm your job alert'}</h1>
      <form action={act} className="mt-6">
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="a" value={action} />
        <button type="submit" className={btn}>{action === 'unsubscribe' ? 'Stop the alert' : 'Turn on my alert'}</button>
      </form>
    </div>
  );
}
