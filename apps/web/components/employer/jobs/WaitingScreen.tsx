'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, Loader2, Mail, Plus, ShieldCheck, Check } from 'lucide-react';
import { AskFounder } from '@/components/employer/ClaimStartup';
import type { Clearance } from '@/lib/employer/portal';

const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';

/** "Send to your founder": we email them the verify link (one reminder after a day if they haven't). */
export function FounderAskForm({ clearance }: { clearance: Clearance }) {
  const [email, setEmail] = useState(clearance.founderAskEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(clearance.founderAskedAt ? { ok: true, text: `We emailed ${clearance.founderAskEmail} on ${new Date(clearance.founderAskedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` } : null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/employer/founder-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
    setMsg(res?.ok ? { ok: true, text: `Sent. We’ll remind ${email} once tomorrow if they haven’t verified.` } : { ok: false, text: data.error || 'Couldn’t send. Try again.' });
    setBusy(false);
  }

  return (
    <form onSubmit={send} className="text-left">
      <label htmlFor="founder-email" className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1">Your founder’s email</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id="founder-email" type="email" required autoComplete="off" placeholder="founder@yourstartup.com" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        <button type="submit" disabled={busy || !email.trim()} className={`${btn} shrink-0`}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Mail className="w-4 h-4" aria-hidden />} Email them for me
        </button>
      </div>
      <p role="status" className={`mt-1.5 text-[13px] ${msg?.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{msg?.text}</p>
    </form>
  );
}

/** Optional details that speed up our company check. */
function CompanyCheckForm({ clearance }: { clearance: Clearance }) {
  const [linkedinUrl, setLinkedin] = useState(clearance.linkedinUrl ?? '');
  const [cin, setCin] = useState(clearance.cin ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch('/api/employer/company-check', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linkedinUrl, cin }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
    setMsg(res?.ok ? { ok: true, text: 'Saved. Thanks, that helps us check faster.' } : { ok: false, text: data.error || 'Couldn’t save.' });
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="text-left space-y-2.5">
      <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Help us check faster <span className="font-normal text-gray-500">(optional)</span></p>
      <div>
        <label htmlFor="cc-li" className="block text-[13px] text-gray-700 dark:text-gray-300 mb-1">Company LinkedIn page</label>
        <input id="cc-li" type="url" placeholder="https://www.linkedin.com/company/…" value={linkedinUrl} onChange={(e) => setLinkedin(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor="cc-cin" className="block text-[13px] text-gray-700 dark:text-gray-300 mb-1">CIN or LLPIN (from the MCA)</label>
        <input id="cc-cin" placeholder="U72900KA2021PTC123456" value={cin} onChange={(e) => setCin(e.target.value)} className={input} />
      </div>
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />} Save
      </button>
      <p role="status" className={`text-[13px] ${msg?.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{msg?.text}</p>
    </form>
  );
}

/**
 * Shown after Publish when the company isn't cleared yet: the job is complete and waits, and goes live by itself
 * once the founder verifies the startup ('founder') or our company check passes ('review').
 */
export default function WaitingScreen({ title, waiting, clearance }: { title: string; waiting: 'founder' | 'review'; clearance: Clearance | null }) {
  return (
    <div className="max-w-xl mx-auto font-jakarta py-6 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5 sm:p-7">
        <div className="text-center">
          <Clock className="w-12 h-12 text-amber-500 mx-auto" aria-hidden />
          <h1 className="portal-title mt-3" tabIndex={-1} autoFocus>Your job is ready and waiting</h1>
          <p className="portal-subtitle">
            {waiting === 'review'
              ? <>{title} goes live by itself once our team checks your company. We check the same working day (Mon–Sat, 9:30 to 6:30 IST) and email you.</>
              : <>{title} goes live by itself once {clearance?.startupName ?? 'your startup'}’s founder verifies it on Udyaibase. Nothing else to do on your side.</>}
          </p>
        </div>

        <ol className="mt-6 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex gap-3"><Check className="w-5 h-5 text-green-600 shrink-0" aria-hidden /> <span>Your job is saved and complete.</span></li>
          <li className="flex gap-3"><ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
            <span>{waiting === 'review' ? 'We look at your website, LinkedIn page and MCA record.' : 'Your founder verifies the startup (a few minutes) and joins as an owner.'}</span></li>
          <li className="flex gap-3"><Clock className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
            <span>{waiting === 'review' ? 'Once it passes, your job goes live with an “Email verified” label (up to 2 live jobs until your founder verifies the startup).' : 'Then your job goes live and we email you the link.'}</span></li>
        </ol>

        {clearance && (
          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800 space-y-4">
            {waiting === 'review' ? <CompanyCheckForm clearance={clearance} /> : (
              <>
                <FounderAskForm clearance={clearance} />
                {clearance.startupName && <AskFounder startupName={clearance.startupName} slug={clearance.startupSlug} startupVerified={clearance.startupVerified} />}
              </>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-center gap-2 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <Link href="/employer/jobs" className="btn-brand">Back to jobs</Link>
          <Link href="/employer/jobs/new" className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">
            <Plus className="w-4 h-4" aria-hidden /> Write another job
          </Link>
        </div>
      </div>
    </div>
  );
}
