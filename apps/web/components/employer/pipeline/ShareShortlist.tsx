'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Share2, X } from 'lucide-react';

interface Share { id: string; name: string; expiresAt: string; lastViewedAt: string | null; votes: number }

/** "Share shortlist": a private link for a co-founder to vote yes, maybe or no on this job's shortlist, no account needed. */
export default function ShareShortlist({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch(`/api/employer/jobs/${jobId}/shortlist-share`, { cache: 'no-store' }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setShares(res?.ok ? d.shares : []);
  }
  useEffect(() => { if (open && !shares) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setLink('');
    try {
      const res = await fetch(`/api/employer/jobs/${jobId}/shortlist-share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setLink(d.link); setName(''); void load(); } else setError(d.error || 'Couldn’t create the link.');
    } catch { setError('You seem to be offline.'); }
    setBusy(false);
  }

  async function revoke(id: string) {
    await fetch(`/api/employer/jobs/${jobId}/shortlist-share?share=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    void load();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError('Copy failed. Select the link and copy it.'); }
  }

  const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        <Share2 className="w-4 h-4" aria-hidden /> Share shortlist
      </button>
      {open && (
        <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-[14px] shadow-xl p-5 font-jakarta">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 id="share-title" className="portal-dialog-title">Share the shortlist</h2>
                <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">A private link for someone without an account (like a co-founder) to say yes, maybe or no on the shortlisted and interviewing candidates for {jobTitle}. They see work details and resumes, never email or phone. Works for 14 days.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-10 h-10 -mr-2 -mt-1 flex items-center justify-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" aria-hidden /></button>
            </div>
            <form onSubmit={create} className="mt-4 flex gap-2">
              <label htmlFor="share-name" className="sr-only">Who is it for?</label>
              <input id="share-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Who is it for? e.g. Rahul (co-founder)" className={input} />
              <button type="submit" disabled={busy || name.trim().length < 2} className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Create link
              </button>
            </form>
            {link && (
              <div className="mt-3 rounded-[10px] bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">Send this link to them (it’s shown only once):</p>
                <div className="flex gap-2">
                  <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${input} text-xs`} aria-label="Shortlist link" />
                  <button type="button" onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold">
                    {copied ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
            <h3 className="mt-5 text-sm font-semibold text-gray-900 dark:text-white">Active links</h3>
            {!shares ? <Loader2 className="mt-2 w-4 h-4 animate-spin text-gray-400" aria-label="Loading" /> : shares.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">None yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
                {shares.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-900 dark:text-white truncate">{s.name}</span>
                      <span className="block text-xs text-gray-500">{s.votes} vote{s.votes === 1 ? '' : 's'} · {s.lastViewedAt ? 'opened' : 'not opened yet'} · until {new Date(s.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </span>
                    <button type="button" onClick={() => revoke(s.id)} className="min-h-[36px] px-2.5 rounded-[8px] text-[13px] font-semibold text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">Turn off</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
