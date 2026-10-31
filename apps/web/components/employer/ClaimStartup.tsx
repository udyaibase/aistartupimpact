'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Building2, Search, ArrowRight, Loader2, ShieldCheck, ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';

interface StartupOption {
  id: string;
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  headquartersCity?: string | null;
  stage?: string | null;
}

function domainOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Claim a startup profile: pick it, then prove you work there with a code sent to
 * a work email on the startup's own domain. Nothing is linked until the code is confirmed.
 */
export default function ClaimStartup({
  initialStartup,
  defaultEmail = '',
  onClaimed,
}: {
  initialStartup?: StartupOption | null;
  defaultEmail?: string;
  onClaimed: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StartupOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [startup, setStartup] = useState<StartupOption | null>(initialStartup ?? null);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSite, setNewSite] = useState('');

  async function addStartup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/startups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, websiteUrl: newSite }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.startup) { setStartup(data.startup); setAdding(false); }
      else setError(data.error || "Couldn't add your startup. Try again.");
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setBusy(false);
  }

  const domain = domainOf(startup?.websiteUrl);

  useEffect(() => {
    if (!startup) return;
    const d = domainOf(startup.websiteUrl);
    // Prefill only when the account email already sits on the startup's domain.
    setEmail(d && defaultEmail.toLowerCase().endsWith(`@${d}`) ? defaultEmail : '');
  }, [startup, defaultEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/employer/startups/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.startups || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!startup) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/claim/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startupId: startup.id, workEmail: email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStep('code');
        setCode('');
        setCooldown(data.cooldown ?? 60);
      } else {
        if (data.retryAfter) setCooldown(data.retryAfter);
        setError(data.error || "We couldn't send the code. Try again.");
      }
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!startup) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/claim/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startupId: startup.id, workEmail: email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onClaimed();
      else { setCode(''); setError(data.error || "That code didn't work."); }
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setBusy(false);
  }

  const inputCls = 'w-full min-h-[44px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand';

  if (!startup) {
    return (
      <div className="font-jakarta">
        <label htmlFor="claim-search" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Find your startup</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <input id="claim-search" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            inputMode="search" enterKeyHint="search" placeholder="Search by name, e.g. Sarvam AI" className={`${inputCls} pl-9`} />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" aria-hidden />}
        </div>
        {results.length > 0 && (
          <ul className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {results.map((s) => (
              <li key={s.id}>
                <button onClick={() => setStartup(s)} className="flex items-center gap-3 w-full px-3 min-h-[56px] hover:bg-gray-50 dark:hover:bg-gray-800 text-left">
                  <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                    {s.logoUrl ? <Image src={s.logoUrl} alt="" width={36} height={36} sizes="36px" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4 text-gray-400" aria-hidden />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{[s.headquartersCity, s.stage, domainOf(s.websiteUrl)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-brand shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && !searching && results.length === 0 && !adding && (
          <div className="mt-3 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <p className="text-sm text-gray-700 dark:text-gray-300">“{query.trim()}” isn&apos;t on Udyaibase yet.</p>
            <button type="button" onClick={() => { setAdding(true); setNewName(query.trim()); }}
              className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
              <Plus className="w-4 h-4" aria-hidden /> Add your startup
            </button>
          </div>
        )}
        {adding && (
          <form onSubmit={addStartup} noValidate className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Add your startup</p>
            <div>
              <label htmlFor="new-name" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Startup name</label>
              <input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} maxLength={80} />
            </div>
            <div>
              <label htmlFor="new-site" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Company website</label>
              <input id="new-site" value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="acme.ai" inputMode="url" className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">You&apos;ll verify with a work email on this domain next.</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !newName.trim() || !newSite.trim()}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg bg-brand hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Continue
              </button>
              <button type="button" onClick={() => { setAdding(false); setError(''); }} className="min-h-[44px] px-3 text-sm font-semibold text-gray-600 hover:underline">Cancel</button>
            </div>
            <p className="text-xs text-gray-500">Your jobs can go live once you verify. Your public startup profile appears after a quick review by our team.</p>
          </form>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="font-jakarta">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 mb-4">
        <span className="w-10 h-10 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
          {startup.logoUrl ? <Image src={startup.logoUrl} alt="" width={40} height={40} sizes="40px" className="w-full h-full object-cover" /> : <Building2 className="w-5 h-5 text-gray-400" aria-hidden />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-900 dark:text-white truncate">{startup.name}</span>
          <span className="block text-xs text-gray-500">{domain ?? 'No website on file'}</span>
        </span>
        {!initialStartup && (
          <button onClick={() => { setStartup(null); setStep('email'); setError(''); }} className="inline-flex items-center gap-1 min-h-[40px] px-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Change
          </button>
        )}
      </div>

      {!domain ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          This profile has no website, so we can't verify you by email. <Link href="/employer/support" className="font-semibold text-brand hover:underline">Contact support</Link> and we'll verify you manually.
        </p>
      ) : step === 'email' ? (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="claim-email" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Your work email at {domain}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="claim-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={`you@${domain}`} className={inputCls} aria-invalid={!!error} aria-describedby={error ? 'claim-error' : 'claim-hint'} />
            <button type="submit" disabled={busy || !email.trim() || cooldown > 0}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg bg-brand hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-50 shrink-0">
              {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {cooldown > 0 ? `Wait ${cooldown}s` : 'Send code'}
            </button>
          </div>
          <p id="claim-hint" className="mt-1.5 text-xs text-gray-500">We verify that you work at {startup.name} before jobs can carry its name. Personal emails like Gmail aren't accepted.</p>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <label htmlFor="claim-code" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Enter the 6-digit code sent to {email}</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input ref={codeRef} id="claim-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${inputCls} sm:w-44 text-center tracking-[0.3em] font-semibold text-base`} aria-invalid={!!error} aria-describedby={error ? 'claim-error' : undefined} />
            <button type="submit" disabled={busy || code.length !== 6}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg bg-brand hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ShieldCheck className="w-4 h-4" aria-hidden />}
              Verify and claim
            </button>
            <button type="button" onClick={() => sendCode()} disabled={busy || cooldown > 0}
              className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
          <button type="button" onClick={() => { setStep('email'); setError(''); }} className="mt-2 min-h-[40px] text-sm text-gray-600 hover:underline">Use a different email</button>
        </form>
      )}

      {error && <p id="claim-error" role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
