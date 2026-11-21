'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Copy, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import ConfirmSheet from '@/components/ui/ConfirmSheet';

type Rule = { freq: 'WEEKLY' | 'MONTHLY'; interval: number; monthWeek: number | null; createAheadDays: number; templateEventId: string };
type Ev = { id: string; title: string; startAt: string; timezone: string; status: string; inSeries: boolean; inOtherSeries: boolean };
type Data = { series: { id: string; slug: string; name: string; description: string | null; recurrence: Rule | null }; followers: number; events: Ev[] };

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateText = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
const weekdayIn = (iso: string, tz: string) => DAYS.indexOf(new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }));

export default function SeriesEditor({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [repeat, setRepeat] = useState(false);
  const [rule, setRule] = useState<Rule>({ freq: 'MONTHLY', interval: 1, monthWeek: 1, createAheadDays: 21, templateEventId: '' });
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/organizer/series/${id}`);
    const d = await r.json().catch(() => ({}));
    if (!d.success) { setNote(d.error || 'Couldn’t load.'); return; }
    setData(d);
    setName(d.series.name);
    setDescription(d.series.description ?? '');
    setPicked(new Set(d.events.filter((e: Ev) => e.inSeries).map((e: Ev) => e.id)));
    setRepeat(!!d.series.recurrence);
    if (d.series.recurrence) setRule(d.series.recurrence);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const template = useMemo(() => data?.events.find((e) => e.id === rule.templateEventId) ?? null, [data, rule.templateEventId]);
  const weekday = template ? weekdayIn(template.startAt, template.timezone) : -1;

  async function save() {
    if (repeat && !rule.templateEventId) { setNote('Choose which event to copy for each repeat.'); return; }
    setBusy('save'); setNote('');
    const r = await fetch(`/api/organizer/series/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, eventIds: Array.from(picked), recurrence: repeat ? rule : null }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) { setNote(d.error || 'Couldn’t save.'); return; }
    setNote('Saved.');
    load();
  }

  // Asked in the app's own sheet; on success it stays busy until the list has opened.
  const [askDelete, setAskDelete] = useState(false);
  async function remove(): Promise<string | void> {
    setBusy('delete');
    try {
      const r = await fetch(`/api/organizer/series/${id}`, { method: 'DELETE' });
      if (!r.ok) { setBusy(''); return 'Couldn’t delete the series. Try again.'; }
      router.push('/organizer/series');
    } catch { setBusy(''); return 'You seem to be offline. Try again.'; }
  }

  if (!data) return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {note || 'Loading…'}</div>;
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/series/${data.series.slug}` : '';
  const toggle = (eid: string) => setPicked((p) => { const n = new Set(p); if (n.has(eid)) n.delete(eid); else n.add(eid); return n; });

  return (
    <div className="font-jakarta max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/organizer/series" aria-label="Back to series" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1"><h1 className="portal-title truncate">{data.series.name}</h1><p className="portal-subtitle">{data.followers} {data.followers === 1 ? 'follower' : 'followers'}</p></div>
        <a href={`/series/${data.series.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200"><ExternalLink className="w-4 h-4" aria-hidden /> View</a>
      </div>
      {note && <p role="status" className="p-3 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm text-gray-800 dark:text-gray-200">{note}</p>}

      <section className={`${card} space-y-4`}>
        <div>
          <label htmlFor="s-name" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Name</label>
          <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={input} />
        </div>
        <div>
          <label htmlFor="s-desc" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">About this series <span className="font-normal text-gray-500">(optional)</span></label>
          <textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} className={`${input} py-2`} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Public page</p>
          <div className="flex gap-2">
            <input readOnly value={publicUrl} aria-label="Public page link" className={`${input} text-gray-600`} />
            <button type="button" onClick={() => { navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} aria-label="Copy link"
              className="inline-flex items-center justify-center w-10 min-h-[40px] rounded-[10px] border border-gray-300 dark:border-gray-700 shrink-0">{copied ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}</button>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Events in this series</h2>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">Published public events show on the series page. Followers are emailed when a new one is published.</p>
        {data.events.length === 0 ? <p className="text-sm text-gray-500">You don’t have any events yet.</p> : (
          <ul className="max-h-80 overflow-y-auto -mx-1 divide-y divide-gray-100 dark:divide-gray-800">
            {data.events.map((e) => (
              <li key={e.id}>
                <label className="flex items-center gap-3 px-1 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 rounded border-gray-300" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900 dark:text-white truncate">{e.title}</span>
                    <span className="block text-xs text-gray-500">{dateText(e.startAt, e.timezone)} · {e.status === 'PUBLISHED' ? 'Published' : e.status === 'DRAFT' ? 'Draft' : e.status.toLowerCase()}{e.inOtherSeries ? ' · in another series (will move here)' : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-4`}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Repeat automatically</span>
        </label>
        {repeat && (
          <>
            <p className="text-xs text-gray-500 -mt-2">We copy an event as a <strong>draft</strong> ahead of each date and email you. Nothing is published until you publish it.</p>
            <div>
              <label htmlFor="s-template" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Event to copy</label>
              <select id="s-template" value={rule.templateEventId} onChange={(e) => setRule({ ...rule, templateEventId: e.target.value })} className={input}>
                <option value="">Choose an event…</option>
                {data.events.map((e) => <option key={e.id} value={e.id}>{e.title} ({dateText(e.startAt, e.timezone)})</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Details, speakers, agenda, tickets and questions are copied. Attendees never are.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-freq" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">How often</label>
                <select id="s-freq" value={`${rule.freq}:${rule.interval}`} onChange={(e) => { const [f, n] = e.target.value.split(':'); setRule({ ...rule, freq: f as Rule['freq'], interval: Number(n), monthWeek: f === 'MONTHLY' ? rule.monthWeek ?? 1 : null }); }} className={input}>
                  <option value="WEEKLY:1">Every week</option>
                  <option value="WEEKLY:2">Every 2 weeks</option>
                  <option value="MONTHLY:1">Every month</option>
                  <option value="MONTHLY:2">Every 2 months</option>
                  <option value="MONTHLY:3">Every 3 months</option>
                </select>
              </div>
              {rule.freq === 'MONTHLY' && (
                <div>
                  <label htmlFor="s-week" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Which {weekday >= 0 ? DAYS[weekday] : 'day'}</label>
                  <select id="s-week" value={rule.monthWeek ?? 1} onChange={(e) => setRule({ ...rule, monthWeek: Number(e.target.value) })} className={input}>
                    <option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option><option value={4}>Fourth</option><option value={-1}>Last</option>
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="s-ahead" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Create the draft</label>
                <select id="s-ahead" value={rule.createAheadDays} onChange={(e) => setRule({ ...rule, createAheadDays: Number(e.target.value) })} className={input}>
                  {[7, 14, 21, 30, 45, 60].map((n) => <option key={n} value={n}>{n} days before</option>)}
                </select>
              </div>
            </div>
            {template && weekday >= 0 && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Repeats {rule.freq === 'WEEKLY' ? (rule.interval === 1 ? `every ${DAYS[weekday]}` : `every ${rule.interval} weeks on ${DAYS[weekday]}`)
                  : `on the ${rule.monthWeek === -1 ? 'last' : ['first', 'second', 'third', 'fourth'][(rule.monthWeek ?? 1) - 1]} ${DAYS[weekday]} of every ${rule.interval === 1 ? 'month' : `${rule.interval} months`}`}, at the same time as the event you copy.
              </p>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy === 'save'} className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
        </button>
        <button onClick={() => setAskDelete(true)} disabled={busy === 'delete'} className="ml-auto inline-flex items-center gap-2 min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-4 h-4" aria-hidden /> Delete series
        </button>
      </div>
      <ConfirmSheet
        open={askDelete}
        title="Delete this series?"
        message={<>Its events stay as they are. Its public page and its followers are removed.</>}
        confirmLabel="Delete series"
        onConfirm={remove}
        onClose={() => setAskDelete(false)}
      />
    </div>
  );
}
