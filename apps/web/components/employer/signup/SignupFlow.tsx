'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Check, Loader2, Mail, Search, ShieldCheck } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

type Startup = { id: string; name: string; logoUrl: string | null; city: string | null; tagline: string; domain: string | null; hasTeam: boolean };
type Team = { employerId: string; companyName: string; logoUrl: string | null; role: string; invited: boolean };
type Options = { email: string; domain: string | null; freeMail: boolean; matches: Startup[]; teams: Team[] };
type Step = 'email' | 'code' | 'company' | 'add' | 'requested';

const input = 'w-full min-h-[44px] px-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30';
const primary = 'w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50';
const secondary = 'w-full min-h-[44px] rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center justify-center gap-2 disabled:opacity-50';
const label = 'block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

/** Company name and website guessed from a work-email domain: "neural-pay.in" → "Neural Pay", "neural-pay.in". */
function guessFromDomain(domain: string | null) {
  if (!domain) return { name: '', website: '' };
  const first = domain.split('.')[0];
  return { name: first.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), website: domain };
}

function Logo({ src, name }: { src: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
    : <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0" aria-hidden>{name.charAt(0)}</span>;
}

/**
 * Passwordless employer signup: work email → code → company (match, search, add, or join an existing team) →
 * first job. One question per screen; nothing is typed twice (company details come from the startup profile).
 */
export default function SignupFlow() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [opts, setOpts] = useState<Options | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Startup[]>([]);
  const [company, setCompany] = useState({ name: '', website: '' });
  const [requestedCompany, setRequestedCompany] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const turnstile = useRef('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);

  async function post(action: string, body: Record<string, unknown> = {}, key = action) {
    setBusy(key);
    setError('');
    try {
      const res = await fetch('/api/employer/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      const d = await res.json().catch(() => ({}));
      setBusy(null);
      if (d.restart) { setStep('email'); setCode(''); }
      if (!res.ok) { setError(d.error || 'Something went wrong. Try again.'); return null; }
      return d;
    } catch {
      setBusy(null);
      setError('You seem to be offline.');
      return null;
    }
  }

  // Debounced startup search on the company step.
  useEffect(() => {
    if (step !== 'company' || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const d = await post('search', { q }, 'search');
      if (d) setResults(d.results);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, step]);

  const done = (d: { redirect?: string; requested?: boolean; company?: string; existing?: Startup }) => {
    if (d.redirect) { window.location.href = d.redirect; return; }
    if (d.requested) { setRequestedCompany(d.company ?? ''); setStep('requested'); return; }
    if (d.existing) { setNotice(`${d.existing.name} is already on Udyaibase.`); setResults([d.existing]); setStep('company'); }
  };
  const pick = async (s: Startup) => { const d = await post('workspace', { startupId: s.id }, s.id); if (d) done(d); };

  return (
    <div className="font-jakarta space-y-4">
      {step === 'email' && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const d = await post('code', { email, turnstileToken: turnstile.current });
          if (d) setStep('code');
        }} className="space-y-3" noValidate>
          <div>
            <label htmlFor="su-email" className={label}>Work email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input id="su-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className={`${input} pl-10`} />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">Use your company email and we can find your company for you.</p>
          </div>
          <TurnstileWidget onSuccess={(t) => { turnstile.current = t; }} onExpire={() => { turnstile.current = ''; }} />
          <button type="submit" disabled={!!busy || !email.trim()} className={primary}>
            {busy === 'code' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Continue <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const d = await post('verify', { email, code });
          if (!d) return;
          setOpts(d);
          setCompany(guessFromDomain(d.domain));
          setStep('company');
        }} className="space-y-3" noValidate>
          <label htmlFor="su-code" className={label}>Enter the 6-digit code we sent to {email}</label>
          <input id="su-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} text-center tracking-[0.3em] font-semibold`} />
          <button type="submit" disabled={!!busy || code.length !== 6} className={primary}>
            {busy === 'verify' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Verify
          </button>
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }} className="w-full min-h-[40px] text-sm text-gray-600 dark:text-gray-400 hover:underline">Use a different email</button>
        </form>
      )}

      {step === 'company' && opts && (
        <div className="space-y-4">
          {opts.teams.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">You’re already on {opts.teams.length === 1 ? 'a hiring team' : 'these hiring teams'}</p>
              {opts.teams.map((t) => (
                <button key={t.employerId} type="button" disabled={!!busy} onClick={async () => { const d = await post('continue', { employerId: t.employerId }, t.employerId); if (d) done(d); }}
                  className="w-full min-h-[56px] px-3 flex items-center gap-3 rounded-xl border border-gray-300 dark:border-gray-700 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                  <Logo src={t.logoUrl} name={t.companyName} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">Continue to {t.companyName}</span>
                    <span className="block text-xs text-gray-500">{t.role}{t.invited ? ' · invitation' : ''}</span>
                  </span>
                  {busy === t.employerId ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ArrowRight className="w-4 h-4 text-gray-400" aria-hidden />}
                </button>
              ))}
              <p className="pt-2 text-xs text-gray-500">Or set up hiring for another company:</p>
            </div>
          )}

          {opts.matches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Is this your company?</p>
              {opts.matches.map((s) => (
                <div key={s.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-3">
                    <Logo src={s.logoUrl} name={s.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{[s.tagline, s.city].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => pick(s)} disabled={!!busy} className={`${primary} mt-3`}>
                    {busy === s.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                    {s.hasTeam ? `Yes, ask to join ${s.name}'s team` : 'Yes, this is us'}
                  </button>
                  {!s.hasTeam && <p className="mt-1.5 text-xs text-gray-500">You can set up and draft jobs right away. Jobs go live once {s.name}&apos;s founder verifies it on Udyaibase.</p>}
                </div>
              ))}
              <p className="text-xs text-gray-500">Not your company? Search below or add yours.</p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{opts.freeMail ? 'What company do you hire for?' : 'We couldn’t find your company yet'}</p>
          )}

          {notice && <p role="status" className="text-sm text-gray-700 dark:text-gray-300">{notice}</p>}
          <div>
            <label htmlFor="su-search" className="sr-only">Search companies</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <input id="su-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Udyaibase startups" className={`${input} pl-10`} autoComplete="off" />
              {busy === 'search' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" aria-hidden />}
            </div>
            {results.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {results.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => pick(s)} disabled={!!busy}
                      className="w-full min-h-[52px] px-3 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                      <Logo src={s.logoUrl} name={s.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</span>
                        <span className="block text-xs text-gray-500 truncate">{s.hasTeam ? 'Already hiring here: ask to join' : s.domain ?? s.city ?? ''}</span>
                      </span>
                      {busy === s.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => { setStep('add'); setError(''); }} className={secondary}>
            <Building2 className="w-4 h-4" aria-hidden /> Add a new company
          </button>
          <p className="text-xs text-gray-500">Only verified startups can publish jobs, and only a startup&apos;s founder can verify it. You can set everything up and draft jobs in the meantime.</p>
        </div>
      )}

      {step === 'add' && opts && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          const d = await post('company', { name: company.name, websiteUrl: company.website });
          if (d) done(d);
        }} className="space-y-3" noValidate>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Tell us about your company</p>
          <div>
            <label htmlFor="su-name" className={label}>Company name</label>
            <input id="su-name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} className={input} autoComplete="organization" />
          </div>
          <div>
            <label htmlFor="su-web" className={label}>Website</label>
            <input id="su-web" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} placeholder="acme.ai" className={input} autoComplete="url" inputMode="url" />
            <p className="mt-1.5 text-xs text-gray-500">You can draft jobs now. They go live once your founder verifies the startup on Udyaibase; we&apos;ll give you a link to send them.</p>
          </div>
          <button type="submit" disabled={!!busy || company.name.trim().length < 2 || !company.website.trim()} className={primary}>
            {busy === 'company' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Create workspace
          </button>
          <button type="button" onClick={() => setStep('company')} className="w-full min-h-[40px] text-sm text-gray-600 dark:text-gray-400 hover:underline">Back</button>
        </form>
      )}

      {step === 'requested' && (
        <div role="status" className="text-center space-y-2 py-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Check className="w-6 h-6 text-green-600" aria-hidden /></div>
          <p className="text-base font-semibold text-gray-900 dark:text-white">Request sent to {requestedCompany}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">An owner will review it. We’ll email you when you’re in; then sign in with a code, no password needed.</p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {step === 'email' && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 pt-1">
          Already hiring with us? <Link href="/employer/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
        </p>
      )}
    </div>
  );
}
