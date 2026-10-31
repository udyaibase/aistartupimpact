'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FounderTeamPanel from '@/components/founder/FounderTeamPanel';
import { ArrowRight, BadgeCheck, Briefcase, Building2, Loader2, ShieldCheck, Clock } from 'lucide-react';

interface StartupRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
  isApproved: boolean;
  claimStatus: string;
  /** Null until the startup has a hiring workspace. */
  hiring: { openJobs: number; newCandidates: number; interviewing: number; waitingLong: number; applied30d: number } | null;
}

function domainOf(url?: string | null) {
  if (!url) return null;
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return null; }
}

const inputCls = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';

export default function FounderHiringClient({ startups, suggestedEmail }: { startups: StartupRow[]; suggestedEmail: string }) {
  return (
    <ul className="space-y-3">
      {startups.map((s) => <StartupCard key={s.id} startup={s} suggestedEmail={suggestedEmail} />)}
    </ul>
  );
}

function StartupCard({ startup, suggestedEmail }: { startup: StartupRow; suggestedEmail: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const domain = domainOf(startup.websiteUrl);

  async function startHiring() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/founder/hiring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startupId: startup.id }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.redirect) { window.location.href = data.redirect; return; }
      setError(data.error || 'Couldn’t open hiring. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center shrink-0" aria-hidden>
            {startup.logoUrl ? <Image src={startup.logoUrl} alt="" width={48} height={48} sizes="48px" className="w-full h-full object-cover" /> : <Building2 className="w-5 h-5 text-gray-400" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">{startup.name}</p>
            {startup.isVerified ? (
              <p className="flex items-center gap-1 text-[13px] text-green-700 dark:text-green-400"><BadgeCheck className="w-4 h-4" aria-hidden /> Verified{domain ? ` · ${domain}` : ''}</p>
            ) : (
              <p className="flex items-center gap-1 text-[13px] text-amber-700 dark:text-amber-400"><Clock className="w-4 h-4" aria-hidden /> Verify ownership to post jobs</p>
            )}
            {startup.isVerified && startup.hiring && (
              <p className="text-[13px] text-gray-500 dark:text-gray-400">{startup.hiring.openJobs} open job{startup.hiring.openJobs === 1 ? '' : 's'}</p>
            )}
          </div>
        </div>

        {startup.isVerified ? (
          <button onClick={startHiring} disabled={busy} className="btn-brand gap-2 shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Briefcase className="w-4 h-4" aria-hidden />}
            {startup.hiring ? 'Open hiring' : 'Start hiring'} <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        ) : !verifying ? (
          <button onClick={() => setVerifying(true)} className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold shrink-0">
            <ShieldCheck className="w-4 h-4" aria-hidden /> Verify ownership
          </button>
        ) : null}
      </div>

      {startup.isVerified && startup.hiring && (startup.hiring.openJobs > 0 || startup.hiring.applied30d > 0) && (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'New candidates', value: startup.hiring.newCandidates, note: startup.hiring.waitingLong > 0 ? `${startup.hiring.waitingLong} waiting 5+ days` : null },
            { label: 'In interviews', value: startup.hiring.interviewing, note: null },
            { label: 'Applied, 30 days', value: startup.hiring.applied30d, note: null },
            { label: 'Open jobs', value: startup.hiring.openJobs, note: null },
          ].map((s) => (
            <div key={s.label} className="rounded-[10px] bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5">
              <dt className="text-xs text-gray-500 dark:text-gray-400">{s.label}</dt>
              <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{s.value}</dd>
              {s.note && <dd className="text-xs font-semibold text-amber-700 dark:text-amber-400">{s.note}</dd>}
            </div>
          ))}
        </dl>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}

      {startup.isVerified && startup.hiring && <FounderTeamPanel startupId={startup.id} startupName={startup.name} />}

      {!startup.isVerified && verifying && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          {domain ? (
            <EmailVerify startupId={startup.id} startupName={startup.name} domain={domain} suggestedEmail={suggestedEmail} onDone={() => router.refresh()} />
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {startup.name} has no website on file. <Link href={`/founder/startups/${startup.slug}`} className="font-semibold text-brand hover:underline">Add your website</Link> to verify with a work email.
            </p>
          )}
          <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400">
            No work email on {domain ?? 'your domain'}? <Link href={`/founder/claim/${startup.id}`} className="font-semibold text-brand hover:underline">Verify with a DNS record instead</Link>.
          </p>
        </div>
      )}
    </li>
  );
}

export function EmailVerify({ startupId, startupName, domain, suggestedEmail, onDone }: {
  startupId: string; startupName: string; domain: string; suggestedEmail: string; onDone: () => void;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(suggestedEmail.toLowerCase().endsWith(`@${domain}`) ? suggestedEmail : '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  async function call(body: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/founder/startups/${startupId}/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (data.retryAfter) setCooldown(data.retryAfter);
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return null; }
      return data;
    } catch {
      setBusy(false);
      setError('You seem to be offline.');
      return null;
    }
  }

  return step === 'email' ? (
    <form onSubmit={async (e) => { e.preventDefault(); const d = await call({ step: 'send', email }); if (d) { setStep('code'); setCooldown(d.cooldown ?? 60); } }} noValidate>
      <label htmlFor={`ve-${startupId}`} className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Your work email at {domain}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id={`ve-${startupId}`} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`you@${domain}`} className={inputCls} />
        <button type="submit" disabled={busy || !email.trim() || cooldown > 0} className="btn-brand gap-2 shrink-0 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {cooldown > 0 ? `Wait ${cooldown}s` : 'Send code'}
        </button>
      </div>
      <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">We send a 6-digit code to prove you work at {startupName}. Personal emails like Gmail aren&apos;t accepted.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </form>
  ) : (
    <form onSubmit={async (e) => { e.preventDefault(); const d = await call({ step: 'verify', email, code }); if (d) onDone(); else setCode(''); }} noValidate>
      <label htmlFor={`vc-${startupId}`} className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Enter the 6-digit code sent to {email}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input ref={codeRef} id={`vc-${startupId}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputCls} sm:w-44 text-center tracking-[0.3em] font-semibold text-base`} />
        <button type="submit" disabled={busy || code.length !== 6} className="btn-brand gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ShieldCheck className="w-4 h-4" aria-hidden />} Verify
        </button>
        <button type="button" onClick={() => call({ step: 'send', email }).then((d) => d && setCooldown(d.cooldown ?? 60))} disabled={busy || cooldown > 0}
          className="min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60">
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
      <button type="button" onClick={() => { setStep('email'); setError(''); }} className="mt-2 min-h-[40px] text-sm text-gray-600 hover:underline">Use a different email</button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </form>
  );
}
