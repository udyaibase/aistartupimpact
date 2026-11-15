import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellRing, BellOff, AlertCircle } from 'lucide-react';
import { confirmCareersSubscription, unsubscribeCareers } from '@/lib/jobs/careers-subscribers';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Job alerts', robots: { index: false, follow: false } };

type Search = { t?: string; a?: string; done?: string; company?: string; slug?: string };

/**
 * Confirm or stop "now hiring" emails. The change happens on a button press, not on opening the link,
 * so email security scanners that open links can't confirm or unsubscribe anyone.
 */
export default async function JobAlertsPage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams;
  const token = typeof sp.t === 'string' ? sp.t : '';
  const action = sp.a === 'unsubscribe' ? 'unsubscribe' : 'confirm';

  async function act(formData: FormData) {
    'use server';
    const t = String(formData.get('t') ?? '');
    const a = formData.get('a') === 'unsubscribe' ? 'unsubscribe' : 'confirm';
    const r = a === 'unsubscribe' ? await unsubscribeCareers(t) : await confirmCareersSubscription(t);
    const q = new URLSearchParams(r.ok ? { a, done: '1', company: r.company, slug: r.slug } : { a, done: 'invalid' });
    redirect(`/job-alerts?${q.toString()}`);
  }

  const box = 'max-w-md mx-auto my-12 sm:my-20 card p-6 sm:p-8 text-center font-jakarta';
  const btn = 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-brand hover:bg-brand-600 text-white font-semibold text-sm';

  if (sp.done === 'invalid' || (!sp.done && !token)) {
    return (
      <div className={box}>
        <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">This link doesn’t work</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">It may be incomplete. Open the link from your email again, or sign up again on the company’s careers page.</p>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Browse AI jobs</Link>
      </div>
    );
  }

  if (sp.done === '1') {
    const company = sp.company ?? 'the company';
    const companyHref = sp.slug ? `/jobs/company/${encodeURIComponent(sp.slug)}` : '/jobs';
    return (
      <div className={box}>
        {action === 'unsubscribe'
          ? <BellOff className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
          : <BellRing className="w-10 h-10 text-brand mx-auto mb-3" aria-hidden />}
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">
          {action === 'unsubscribe' ? 'You’re unsubscribed' : 'You’re on the list'}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {action === 'unsubscribe'
            ? `You won’t get emails about new roles at ${company} any more.`
            : `We’ll email you when ${company} posts a new role. Every email has a link to stop them.`}
        </p>
        <Link href={companyHref} className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Go to {company}’s careers page</Link>
      </div>
    );
  }

  return (
    <div className={box}>
      {action === 'unsubscribe'
        ? <BellOff className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
        : <BellRing className="w-10 h-10 text-brand mx-auto mb-3" aria-hidden />}
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">
        {action === 'unsubscribe' ? 'Stop emails about new roles?' : 'Confirm your email'}
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {action === 'unsubscribe'
          ? 'You’ll stop getting emails when this company posts a new role.'
          : 'Confirm to get an email when this company posts a new role.'}
      </p>
      <form action={act} className="mt-6">
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="a" value={action} />
        <button type="submit" className={btn}>{action === 'unsubscribe' ? 'Unsubscribe' : 'Confirm my email'}</button>
      </form>
    </div>
  );
}
