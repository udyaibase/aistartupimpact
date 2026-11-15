import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserCheck, UserMinus, AlertCircle } from 'lucide-react';
import { extendPool, leavePool, poolCompanyName, verifyPoolToken, type PoolAction } from '@/lib/jobs/talent-pool';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Talent pool', robots: { index: false, follow: false } };

type Search = { a?: string; id?: string; t?: string; done?: string; company?: string; until?: string };

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Leave a company's talent pool, or stay another 12 months. The change happens on a button press, not on opening
 * the link, so email security scanners that open links can't act for anyone.
 */
export default async function TalentPoolPage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams;
  const action: PoolAction = sp.a === 'extend' ? 'extend' : 'leave';
  const id = typeof sp.id === 'string' ? sp.id : '';
  const token = typeof sp.t === 'string' ? sp.t : '';

  async function act(formData: FormData) {
    'use server';
    const a: PoolAction = formData.get('a') === 'extend' ? 'extend' : 'leave';
    const appId = String(formData.get('id') ?? '');
    const t = String(formData.get('t') ?? '');
    if (!verifyPoolToken(appId, a, t)) redirect(`/talent-pool?a=${a}&done=invalid`);
    const r: { ok: boolean; employerId?: string; until?: Date } = a === 'extend' ? await extendPool(appId) : await leavePool(appId);
    if (!r.ok || !r.employerId) redirect(`/talent-pool?a=${a}&done=${a === 'extend' ? 'expired' : 'invalid'}`);
    const company = await poolCompanyName(r.employerId);
    const q = new URLSearchParams({ a, done: '1', company, ...(r.until ? { until: r.until.toISOString() } : {}) });
    redirect(`/talent-pool?${q.toString()}`);
  }

  const box = 'max-w-md mx-auto my-12 sm:my-20 card p-6 sm:p-8 text-center font-jakarta';
  const btn = 'inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-brand hover:bg-brand-600 text-white font-semibold text-sm';
  const Icon = action === 'extend' ? UserCheck : UserMinus;

  if (sp.done === 'invalid' || sp.done === 'expired' || (!sp.done && !(id && token))) {
    return (
      <div className={box}>
        <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">
          {sp.done === 'expired' ? 'This membership can’t be extended' : 'This link doesn’t work'}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {sp.done === 'expired'
            ? 'It ended more than 30 days ago, or you left the talent pool. Apply to one of the company’s roles to be considered again.'
            : 'It may be incomplete. Open the link from your email again.'}
        </p>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Browse AI jobs</Link>
      </div>
    );
  }

  if (sp.done === '1') {
    const company = sp.company ?? 'the company';
    return (
      <div className={box}>
        <Icon className={`w-10 h-10 mx-auto mb-3 ${action === 'extend' ? 'text-brand' : 'text-gray-400'}`} aria-hidden />
        <h1 className="font-sora font-bold text-xl text-navy dark:text-white">
          {action === 'extend' ? 'You’re staying in the talent pool' : 'You’ve left the talent pool'}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {action === 'extend'
            ? `${company} may contact you about other roles until ${sp.until ? fmt(sp.until) : 'a year from today'}. You can leave any time from the link in their emails.`
            : `${company} won’t contact you about other roles. Applications you’ve already sent aren’t affected.`}
        </p>
        <Link href="/jobs" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">Browse AI jobs</Link>
      </div>
    );
  }

  return (
    <div className={box}>
      <Icon className={`w-10 h-10 mx-auto mb-3 ${action === 'extend' ? 'text-brand' : 'text-gray-400'}`} aria-hidden />
      <h1 className="font-sora font-bold text-xl text-navy dark:text-white">
        {action === 'extend' ? 'Stay in the talent pool for another year?' : 'Leave the talent pool?'}
      </h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {action === 'extend'
          ? 'The company may contact you about other roles for 12 more months. You can leave any time.'
          : 'The company won’t contact you about other roles any more. Applications you’ve already sent aren’t affected.'}
      </p>
      <form action={act} className="mt-6">
        <input type="hidden" name="a" value={action} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={btn}>{action === 'extend' ? 'Yes, keep me for 12 months' : 'Leave the talent pool'}</button>
      </form>
    </div>
  );
}
