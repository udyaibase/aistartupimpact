'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Building2, Search, ArrowRight, Loader2, Plus, Copy, Check, Mail, MessageCircle, ShieldCheck } from 'lucide-react';

interface StartupOption {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  headquartersCity?: string | null;
  stage?: string | null;
}

function domainOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const inputCls = 'w-full min-h-[44px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand';

/**
 * Link the workspace to the startup it hires for (find it, or add it). Linking grants nothing public:
 * only the startup's founder can verify it, in the founder portal, which unlocks publishing (see AskFounder).
 */
export default function ClaimStartup({ onLinked }: { onLinked: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StartupOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSite, setNewSite] = useState('');

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

  async function link(startupId: string) {
    setBusy(startupId);
    setError('');
    try {
      const res = await fetch('/api/employer/claim/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startupId }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) onLinked();
      else setError(data.error || 'Couldn’t link that startup. Try again.');
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setBusy(null);
  }

  async function addStartup(e: React.FormEvent) {
    e.preventDefault();
    setBusy('add');
    setError('');
    try {
      const res = await fetch('/api/employer/startups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, websiteUrl: newSite }) });
      const data = await res.json().catch(() => ({}));
      setBusy(null);
      if (res.ok && data.startup) { await link(data.startup.id); return; }
      setError(data.error || "Couldn't add your startup. Try again.");
    } catch {
      setBusy(null);
      setError('You seem to be offline. Check your connection and try again.');
    }
  }

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
              <button onClick={() => link(s.id)} disabled={!!busy} className="flex items-center gap-3 w-full px-3 min-h-[56px] hover:bg-gray-50 dark:hover:bg-gray-800 text-left disabled:opacity-60">
                <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                  {s.logoUrl ? <Image src={s.logoUrl} alt="" width={36} height={36} sizes="36px" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4 text-gray-400" aria-hidden />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</span>
                  <span className="block text-xs text-gray-500 truncate">{[s.headquartersCity, s.stage, domainOf(s.websiteUrl)].filter(Boolean).join(' · ')}</span>
                </span>
                {busy === s.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ArrowRight className="w-4 h-4 text-brand shrink-0" aria-hidden />}
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
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!!busy || !newName.trim() || !newSite.trim()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-lg bg-brand hover:bg-brand-600 text-white text-sm font-bold disabled:opacity-50">
              {busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Add and link
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); }} className="min-h-[44px] px-3 text-sm font-semibold text-gray-600 hover:underline">Cancel</button>
          </div>
          <p className="text-xs text-gray-500">Your startup&apos;s founder then verifies it on Udyaibase, and its public profile appears after a quick review by our team.</p>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}

/**
 * The workspace is linked to a startup but can't publish yet: only the founder can unlock it, by verifying the
 * startup and opening hiring. Shares udyaibase.com/startups/claim/<slug>, which signs the founder in and opens it.
 */
export function AskFounder({ startupName, slug, startupVerified }: { startupName: string; slug: string | null; startupVerified: boolean }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('https://udyaibase.com');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const link = slug ? `${origin}/startups/claim/${slug}` : `${origin}/founder`;
  const message = startupVerified
    ? `${startupName} is verified on Udyaibase. To let us publish our job posts, open hiring from your founder account: ${link}`
    : `Please verify ${startupName} on Udyaibase so we can publish our job posts. It takes a few minutes: ${link}`;
  const copy = () => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  const btn = 'inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <div className="font-jakarta p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <ShieldCheck className="w-4 h-4" aria-hidden /> {startupVerified ? `Ask ${startupName}'s founder to open hiring` : `Ask your founder to verify ${startupName}`}
      </p>
      <p className="mt-1 text-[13px] text-amber-900/80 dark:text-amber-300">
        {startupVerified
          ? `${startupName} is verified, but only its founder can let this workspace publish. When they click “Start hiring” in the founder portal, your drafts can go live.`
          : `Only a startup's founder can verify it on Udyaibase. Until then you can set everything up and draft jobs; they go live once ${startupName} is verified and its founder opens hiring.`}
        {' '}This works when your email is on {startupName}&apos;s own domain; with a personal email, ask your founder to invite you to their hiring team instead.
      </p>
      <p className="mt-3 text-xs font-semibold text-gray-600 dark:text-gray-400">Send your founder this link</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[13px]">{link}</code>
        <button type="button" onClick={copy} className={btn} aria-label="Copy link">{copied ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className={btn} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" aria-hidden /> WhatsApp</a>
        <a className={btn} href={`mailto:?subject=${encodeURIComponent(`Verify ${startupName} on Udyaibase`)}&body=${encodeURIComponent(message)}`}><Mail className="w-4 h-4" aria-hidden /> Email</a>
      </div>
    </div>
  );
}
