'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, Star } from 'lucide-react';

type Settings = { open: boolean; closesAt: string | null; intro: string; formats: string[] };
type Sub = {
  id: string; name: string; email: string; company: string | null; jobTitle: string | null; bio: string | null; linkedinUrl: string | null;
  title: string; abstract: string; format: string | null; track: string | null; status: string; rating: number | null; notes: string | null; createdAt: string;
};
const STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'New', cls: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
  ACCEPTED: { label: 'Accepted', cls: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  WAITLISTED: { label: 'Waitlist', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
  REJECTED: { label: 'Declined', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};
const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';

export default function CfpBoard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<{ event: { slug: string; title: string }; isOpen: boolean; settings: Settings; submissions: Sub[] } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch(`/api/organizer/events/${eventId}/cfp`);
    const d = await r.json().catch(() => ({}));
    if (d.success) { setData(d); setSettings((s) => s ?? d.settings); }
    else setNote(d.error || 'Couldn’t load.');
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  async function saveSettings() {
    setBusy('settings');
    const r = await fetch(`/api/organizer/events/${eventId}/cfp`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
    setBusy('');
    setNote(r.ok ? 'Saved.' : 'Couldn’t save.');
    load();
  }

  async function review(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    const r = await fetch(`/api/organizer/events/${eventId}/cfp/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, notify }) });
    const d = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) setNote(d.error || 'Couldn’t update.');
    else {
      if (patch.status === 'ACCEPTED') setNote('Accepted and added to your speakers. Assign them a session on the Agenda page.');
      load();
    }
  }

  if (!data || !settings) return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {note || 'Loading…'}</div>;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/events/${data.event.slug}/speak` : '';
  const shown = data.submissions.filter((s) => filter === 'ALL' || s.status === filter);
  const count = (st: string) => data.submissions.filter((s) => s.status === st).length;

  return (
    <div className="font-jakarta max-w-4xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0"><h1 className="portal-title">Call for speakers</h1><p className="portal-subtitle truncate">{data.event.title}</p></div>
      </div>
      {note && <p role="status" className="mb-4 p-3 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200">{note}</p>}

      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 mb-5 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.open} onChange={(e) => setSettings({ ...settings, open: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-brand" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Accept talk proposals</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.isOpen ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{data.isOpen ? 'Open' : 'Closed'}</span>
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cfp-close" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Closes on <span className="font-normal text-gray-500">(optional)</span></label>
            <input id="cfp-close" type="date" value={settings.closesAt ? settings.closesAt.slice(0, 10) : ''} onChange={(e) => setSettings({ ...settings, closesAt: e.target.value ? new Date(`${e.target.value}T23:59:59+05:30`).toISOString() : null })} className={input} />
          </div>
          <div>
            <label htmlFor="cfp-formats" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Formats</label>
            <input id="cfp-formats" value={settings.formats.join(', ')} onChange={(e) => setSettings({ ...settings, formats: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} className={input} />
          </div>
        </div>
        <div>
          <label htmlFor="cfp-intro" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">What you’re looking for <span className="font-normal text-gray-500">(shown on the form)</span></label>
          <textarea id="cfp-intro" rows={3} maxLength={2000} value={settings.intro} onChange={(e) => setSettings({ ...settings, intro: e.target.value })} className={`${input} py-2`} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={saveSettings} disabled={busy === 'settings'} className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">{busy === 'settings' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save</button>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold">
            {copied ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} Copy form link
          </button>
          <a href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">Open form <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {[['ALL', `All (${data.submissions.length})`], ['SUBMITTED', `New (${count('SUBMITTED')})`], ['ACCEPTED', `Accepted (${count('ACCEPTED')})`], ['WAITLISTED', `Waitlist (${count('WAITLISTED')})`], ['REJECTED', `Declined (${count('REJECTED')})`]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`h-8 px-3 rounded-[8px] text-[13px] font-semibold ${filter === k ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>{l}</button>
        ))}
        <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-brand" /> Email speakers about decisions</label>
      </div>

      <div className="space-y-3">
        {shown.length === 0 && <p className="text-sm text-gray-500 p-4 rounded-[12px] border border-dashed border-gray-300 dark:border-gray-700">No proposals here yet.</p>}
        {shown.map((s) => (
          <article key={s.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">{s.title}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">{s.name}{s.jobTitle ? `, ${s.jobTitle}` : ''}{s.company ? ` · ${s.company}` : ''} · <a href={`mailto:${s.email}`} className="underline">{s.email}</a>{s.linkedinUrl && <> · <a href={s.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">LinkedIn</a></>}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[s.status]?.cls}`}>{STATUS[s.status]?.label ?? s.status}</span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{[s.format, s.track].filter(Boolean).join(' · ')}{(s.format || s.track) ? ' · ' : ''}{new Date(s.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            <p className="mt-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{s.abstract}</p>
            {s.bio && <details className="mt-2"><summary className="cursor-pointer text-[13px] font-semibold text-gray-600">Bio</summary><p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{s.bio}</p></details>}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-3">
              <div className="flex items-center" role="group" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => review(s.id, { rating: n })} aria-label={`Rate ${n}`} aria-pressed={s.rating === n} className="p-0.5">
                    <Star className={`w-5 h-5 ${s.rating && n <= s.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} aria-hidden />
                  </button>
                ))}
              </div>
              <input aria-label="Private notes" defaultValue={s.notes ?? ''} placeholder="Private notes" onBlur={(e) => { if (e.target.value !== (s.notes ?? '')) review(s.id, { notes: e.target.value }); }} className={`${input} flex-1 min-w-[160px]`} />
              <div className="flex gap-1.5">
                {busy === s.id && <Loader2 className="w-4 h-4 animate-spin self-center" aria-hidden />}
                {s.status !== 'ACCEPTED' && <button type="button" onClick={() => review(s.id, { status: 'ACCEPTED' })} className="min-h-[36px] px-3 rounded-[8px] bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold">Accept</button>}
                {s.status !== 'WAITLISTED' && <button type="button" onClick={() => review(s.id, { status: 'WAITLISTED' })} className="min-h-[36px] px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold">Waitlist</button>}
                {s.status !== 'REJECTED' && <button type="button" onClick={() => review(s.id, { status: 'REJECTED' })} className="min-h-[36px] px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-300">Decline</button>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
