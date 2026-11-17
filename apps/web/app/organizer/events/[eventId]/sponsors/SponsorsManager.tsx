'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp, Download, ImagePlus, Link2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { MAX_SPONSORS, SPONSOR_TIERS } from '@/lib/events/sponsor-tiers';

type Startup = { id: string; name: string; slug: string };
type Sponsor = {
  key: string; id?: string; name: string; tier: string; logoUrl: string | null; websiteUrl: string | null;
  startupId: string | null; startup: Startup | null; impressions: number; clicks: number;
};

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const primary = 'inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800';
let seq = 0;
const newKey = () => `s${Date.now()}${seq++}`;

function StartupPicker({ onPick }: { onPick: (s: Startup) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Startup[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/startups/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const d = await r.json().catch(() => ({}));
        setResults((d.startups ?? []).slice(0, 6).map((s: Startup) => ({ id: s.id, name: s.name, slug: s.slug })));
      } catch { /* aborted */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the startup directory" aria-label="Search the startup directory" className={input} />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
          {results.map((s) => (
            <li key={s.id}><button type="button" onClick={() => { onPick(s); setQ(''); setResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">{s.name}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SponsorsManager({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<{ slug: string; title: string } | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [list, setList] = useState<Sponsor[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string>('');

  const load = useCallback(async () => {
    const r = await fetch(`/api/organizer/events/${eventId}/sponsors`);
    const d = await r.json().catch(() => ({}));
    if (!d.success) { setNote(d.error || 'Couldn’t load.'); return; }
    setEvent(d.event); setAllowed(d.allowed);
    setList(d.sponsors.map((s: Omit<Sponsor, 'key'>) => ({ ...s, key: s.id ?? newKey() })));
    setDirty(false);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const edit = (key: string, patch: Partial<Sponsor>) => { setList((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s))); setDirty(true); };
  const move = (i: number, by: number) => {
    setList((l) => { const n = [...l]; const j = i + by; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setDirty(true);
  };

  async function upload(file: File) {
    const key = uploadFor.current;
    setBusy(`logo:${key}`);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/organizer/upload', { method: 'POST', body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) setNote(d.error || 'Upload failed.');
      else edit(key, { logoUrl: d.url });
    } catch { setNote('You seem to be offline.'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function save() {
    setBusy('save'); setNote('');
    const sponsors = list.map(({ id, name, tier, logoUrl, websiteUrl, startupId }) => ({ id, name, tier, logoUrl, websiteUrl, startupId }));
    const r = await fetch(`/api/organizer/events/${eventId}/sponsors`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsors }) });
    const d = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setNote(d.error || 'Couldn’t save.'); return; }
    setNote('Saved. Sponsors are sorted by tier on your event page.');
    load();
  }

  if (!event) return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {note || 'Loading…'}</div>;

  return (
    <div className="font-jakarta max-w-3xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1"><h1 className="portal-title">Sponsors</h1><p className="portal-subtitle truncate">{event.title}</p></div>
        {list.some((s) => s.id) && (
          <a href={`/api/organizer/events/${eventId}/sponsors/report`} className={secondary}><Download className="w-4 h-4" aria-hidden /> Report</a>
        )}
      </div>

      {!allowed && (
        <div className="mb-5 p-4 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">Sponsor logos, tiers and the sponsor report are part of Pro.</p>
          <Link href="/organizer/billing" className={primary}>See Pro</Link>
        </div>
      )}
      {note && <p role="status" className="mb-4 p-3 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200">{note}</p>}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      <fieldset disabled={!allowed} className="space-y-3">
        {list.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500 border border-dashed border-gray-300 dark:border-gray-700 rounded-[14px]">No sponsors yet. Add the companies supporting this event.</p>
        )}
        {list.map((s, i) => (
          <div key={s.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
            <div className="flex gap-4">
              <button type="button" onClick={() => { uploadFor.current = s.key; fileRef.current?.click(); }} aria-label={s.logoUrl ? 'Change logo' : 'Upload logo'}
                className="w-20 h-20 shrink-0 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                {busy === `logo:${s.key}` ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-hidden />
                  // eslint-disable-next-line @next/next/no-img-element
                  : s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-contain p-1.5" />
                  : <ImagePlus className="w-5 h-5 text-gray-400" aria-hidden />}
              </button>
              <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-3">
                <input value={s.name} onChange={(e) => edit(s.key, { name: e.target.value })} placeholder="Sponsor name" aria-label="Sponsor name" maxLength={100} className={input} />
                <select value={s.tier} onChange={(e) => edit(s.key, { tier: e.target.value })} aria-label="Tier" className={input}>
                  {SPONSOR_TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input value={s.websiteUrl ?? ''} onChange={(e) => edit(s.key, { websiteUrl: e.target.value || null })} placeholder="https://sponsor.com" aria-label="Website" type="url" className={`${input} sm:col-span-2`} />
                <div className="sm:col-span-2">
                  {s.startup ? (
                    <p className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Link2 className="w-4 h-4 text-gray-400" aria-hidden /> Linked to <a href={`/startups/${s.startup.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">{s.startup.name}</a>
                      <button type="button" onClick={() => edit(s.key, { startupId: null, startup: null })} aria-label="Remove link" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-3.5 h-3.5" aria-hidden /></button>
                    </p>
                  ) : (
                    <StartupPicker onPick={(st) => edit(s.key, { startupId: st.id, startup: st, name: s.name || st.name })} />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"><ArrowUp className="w-4 h-4" aria-hidden /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"><ArrowDown className="w-4 h-4" aria-hidden /></button>
                <button type="button" onClick={() => { setList((l) => l.filter((x) => x.key !== s.key)); setDirty(true); }} aria-label="Remove sponsor" className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
              </div>
            </div>
            {s.id && <p className="mt-3 text-xs text-gray-500">{s.impressions.toLocaleString('en-IN')} page views · {s.clicks.toLocaleString('en-IN')} clicks</p>}
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={list.length >= MAX_SPONSORS}
            onClick={() => { setList((l) => [...l, { key: newKey(), name: '', tier: 'GOLD', logoUrl: null, websiteUrl: null, startupId: null, startup: null, impressions: 0, clicks: 0 }]); setDirty(true); }}
            className={secondary}><Plus className="w-4 h-4" aria-hidden /> Add sponsor</button>
          <button type="button" onClick={save} disabled={!dirty || busy === 'save'} className={primary}>
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
          </button>
        </div>
      </fieldset>
    </div>
  );
}
