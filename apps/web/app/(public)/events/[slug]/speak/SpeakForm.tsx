'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

const field = 'w-full min-h-[44px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';

export default function SpeakForm({ slug, formats, tracks }: { slug: string; formats: string[]; tracks: string[] }) {
  const [v, setV] = useState({ name: '', email: '', company: '', jobTitle: '', linkedinUrl: '', bio: '', title: '', abstract: '', format: formats[0] ?? '', track: '', website: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); if (error?.field === k) setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      const r = await fetch(`/api/events/${encodeURIComponent(slug)}/cfp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) { setError({ text: d.error || 'Couldn’t send your proposal.', field: d.field }); setState('idle'); return; }
      setState('done');
    } catch { setError({ text: 'You seem to be offline. Try again.' }); setState('idle'); }
  }

  if (state === 'done') {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 mx-auto text-green-600 mb-3" aria-hidden />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Proposal sent</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">We emailed you a copy. The host will email you with their decision.</p>
      </div>
    );
  }

  const err = (k: string) => (error?.field === k ? <p className="mt-1 text-sm text-red-600">{error.text}</p> : null);
  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 space-y-5">
      <div className="hidden" aria-hidden><label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={set('website')} /></label></div>
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">About you</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="sp-name" className={label}>Full name</label><input id="sp-name" autoComplete="name" value={v.name} onChange={set('name')} maxLength={100} className={field} aria-invalid={error?.field === 'name' || undefined} />{err('name')}</div>
          <div><label htmlFor="sp-email" className={label}>Email</label><input id="sp-email" type="email" autoComplete="email" value={v.email} onChange={set('email')} maxLength={200} className={field} aria-invalid={error?.field === 'email' || undefined} />{err('email')}</div>
          <div><label htmlFor="sp-job" className={label}>Job title <span className="font-normal text-gray-500">(optional)</span></label><input id="sp-job" value={v.jobTitle} onChange={set('jobTitle')} maxLength={100} className={field} /></div>
          <div><label htmlFor="sp-co" className={label}>Company <span className="font-normal text-gray-500">(optional)</span></label><input id="sp-co" autoComplete="organization" value={v.company} onChange={set('company')} maxLength={100} className={field} /></div>
        </div>
        <div><label htmlFor="sp-li" className={label}>LinkedIn <span className="font-normal text-gray-500">(optional)</span></label><input id="sp-li" type="url" value={v.linkedinUrl} onChange={set('linkedinUrl')} placeholder="https://linkedin.com/in/…" className={field} /></div>
        <div><label htmlFor="sp-bio" className={label}>Short bio <span className="font-normal text-gray-500">(optional)</span></label><textarea id="sp-bio" rows={3} value={v.bio} onChange={set('bio')} maxLength={1500} className={`${field} py-2.5`} /></div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your talk</legend>
        <div><label htmlFor="sp-title" className={label}>Title</label><input id="sp-title" value={v.title} onChange={set('title')} maxLength={200} className={field} aria-invalid={error?.field === 'title' || undefined} />{err('title')}</div>
        <div><label htmlFor="sp-abs" className={label}>What it’s about</label><textarea id="sp-abs" rows={6} value={v.abstract} onChange={set('abstract')} maxLength={3000} className={`${field} py-2.5`} aria-invalid={error?.field === 'abstract' || undefined} placeholder="What will people learn? Who is it for?" />{err('abstract')}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="sp-format" className={label}>Format</label><select id="sp-format" value={v.format} onChange={set('format')} className={field}>{formats.map((f) => <option key={f}>{f}</option>)}</select></div>
          {tracks.length > 0 && <div><label htmlFor="sp-track" className={label}>Track <span className="font-normal text-gray-500">(optional)</span></label><select id="sp-track" value={v.track} onChange={set('track')} className={field}><option value="">No preference</option>{tracks.map((t) => <option key={t}>{t}</option>)}</select></div>}
        </div>
      </fieldset>
      {error && !error.field && <p role="alert" className="text-sm text-red-600">{error.text}</p>}
      <button type="submit" disabled={state === 'busy'} className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 text-white font-medium text-[15px] disabled:opacity-60">
        {state === 'busy' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send proposal
      </button>
      <p className="text-xs text-center text-gray-500">Your details go to the event host only, to review your proposal.</p>
    </form>
  );
}
