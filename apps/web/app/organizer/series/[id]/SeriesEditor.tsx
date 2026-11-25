'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarX2, Check, Copy, ExternalLink, ImagePlus, Linkedin, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import ConfirmSheet from '@/components/ui/ConfirmSheet';
import { addDays, describeEnd, MAX_END_AFTER, plannedDates, todayIn, type Recurrence } from '@/lib/events/recurrence';
import { utcToZoned } from '@/lib/events/zoned-time';

type Rule = Recurrence;
type Ev = { id: string; title: string; startAt: string; endAt: string | null; timezone: string; status: string; visibility: string; inSeries: boolean; inOtherSeries: boolean };
type Series = { id: string; slug: string; name: string; description: string | null; coverImageUrl: string | null; recurrence: Rule | null };
type Data = { series: Series; followers: number; events: Ev[] };
type Form = { name: string; description: string; cover: string; picked: string[]; repeat: boolean; rule: Rule };

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1.5';
const ghostBtn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_RULE: Rule = { freq: 'MONTHLY', interval: 1, monthWeek: 1, createAheadDays: 21, templateEventId: '', ends: 'never', endAfter: null, endOn: null, paused: false, skipDates: [] };
const dateText = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz });
const weekdayIn = (iso: string, tz: string) => DAYS.indexOf(new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }));
const niceDay = (d: string, weekday = true) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...(weekday && { weekday: 'short' }), day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const STATUS: Record<string, string> = { PUBLISHED: 'Published', DRAFT: 'Draft', PENDING_REVIEW: 'Waiting for review', CANCELLED: 'Cancelled', POSTPONED: 'Postponed', COMPLETED: 'Completed', ARCHIVED: 'Archived' };

const formFrom = (s: Series, events: Ev[]): Form => ({
  name: s.name,
  description: s.description ?? '',
  cover: s.coverImageUrl ?? '',
  picked: events.filter((e) => e.inSeries).map((e) => e.id).sort(),
  repeat: !!s.recurrence,
  rule: s.recurrence ?? DEFAULT_RULE,
});
const same = (a: Form, b: Form) => JSON.stringify({ ...a, rule: a.repeat ? a.rule : null }) === JSON.stringify({ ...b, rule: b.repeat ? b.rule : null });

/** Which group an event in the series belongs to: what the public page shows, what isn't live yet, and history. */
function groupOf(e: Ev, now: number): 'upcoming' | 'notLive' | 'past' {
  if (e.status !== 'PUBLISHED' && e.status !== 'COMPLETED') return 'notLive';
  return new Date(e.endAt ?? e.startAt).getTime() >= now ? 'upcoming' : 'past';
}

export default function SeriesEditor({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [coverError, setCoverError] = useState('');
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/organizer/series/${id}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!d.success) { setNote({ text: d.error || 'Couldn’t load this series.', error: true }); return; }
    setData(d);
    const f = formFrom(d.series, d.events);
    setSaved(f);
    setForm(f);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!form && !!saved && !same(form, saved);
  // Leaving the page with unsaved edits asks first (browser's own prompt; in-app links are rare on this page).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (patch: Partial<Form>) => { setForm((f) => (f ? { ...f, ...patch } : f)); setNote(null); };

  const byId = useMemo(() => new Map((data?.events ?? []).map((e) => [e.id, e])), [data]);
  const groups = useMemo(() => {
    const now = Date.now();
    const g = { upcoming: [] as Ev[], notLive: [] as Ev[], past: [] as Ev[] };
    for (const eid of form?.picked ?? []) { const e = byId.get(eid); if (e) g[groupOf(e, now)].push(e); }
    const asc = (a: Ev, b: Ev) => a.startAt.localeCompare(b.startAt);
    g.upcoming.sort(asc); g.notLive.sort(asc); g.past.sort((a, b) => -asc(a, b));
    return g;
  }, [form?.picked, byId]);

  if (!data || !form || !saved) {
    return <div className="p-6 flex items-center gap-2 text-sm text-gray-500">{note ? <span role="alert">{note.text}</span> : <><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</>}</div>;
  }

  const rule = form.rule;
  const inSeries = form.picked.map((eid) => byId.get(eid)).filter((e): e is Ev => !!e);
  const template = form.repeat ? byId.get(rule.templateEventId) ?? null : null;
  const weekday = template ? weekdayIn(template.startAt, template.timezone) : -1;
  // The same dates the daily job will use, in the template's own time zone.
  const tz = template?.timezone ?? 'Asia/Kolkata';
  const templateDate = template ? utcToZoned(template.startAt, tz).date : '';
  const today = todayIn(tz);
  const upcomingDates = template ? plannedDates(rule, templateDate, today > templateDate ? today : templateDate, addDays(today, 3 * 366), 6) : [];
  const madeOn = new Set(inSeries.map((e) => utcToZoned(e.startAt, e.timezone).date));
  const setRule = (patch: Partial<Rule>) => set({ rule: { ...rule, ...patch } });
  const toggleSkip = (d: string) => setRule({ skipDates: rule.skipDates.includes(d) ? rule.skipDates.filter((x) => x !== d) : [...rule.skipDates, d].sort() });
    const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/series/${data.series.slug}` : `/series/${data.series.slug}`;
  const shareText = encodeURIComponent(`${saved.name}: every event in this series on Udyaibase`);

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setCoverError('Use a JPG, PNG or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setCoverError('That image is over 5 MB. Try a smaller one.'); return; }
    setCoverError(''); setBusy('cover');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/organizer/upload', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (d.success && d.url) set({ cover: d.url });
      else setCoverError(d.error || 'Couldn’t upload that image. Try again.');
    } catch {
      setCoverError('Couldn’t upload. Check your connection and try again.');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 3) { setNote({ text: 'Give the series a name (at least 3 characters).', error: true }); return; }
    if (form.repeat && !form.rule.templateEventId) { setNote({ text: 'Choose which event to copy for each repeat, or turn repeating off.', error: true }); return; }
    if (form.repeat && form.rule.ends === 'after' && !form.rule.endAfter) { setNote({ text: 'Enter how many events the repeat should make, or set Ends to Never.', error: true }); return; }
    if (form.repeat && form.rule.ends === 'on' && !form.rule.endOn) { setNote({ text: 'Choose the last date, or set Ends to Never.', error: true }); return; }
    setBusy('save'); setNote(null);
    try {
      const r = await fetch(`/api/organizer/series/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, coverImageUrl: form.cover || null, eventIds: form.picked, recurrence: form.repeat ? form.rule : null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) { setNote({ text: d.error || 'Couldn’t save. Try again.', error: true }); return; }
      await load();
      setNote({ text: 'Changes saved.' });
    } catch {
      setNote({ text: 'You seem to be offline. Your changes are still here; try again.', error: true });
    } finally {
      setBusy('');
    }
  }

  async function remove(): Promise<string | void> {
    setBusy('delete');
    try {
      const r = await fetch(`/api/organizer/series/${id}`, { method: 'DELETE' });
      if (!r.ok) { setBusy(''); return 'Couldn’t delete the series. Try again.'; }
      router.push('/organizer/series');
    } catch { setBusy(''); return 'You seem to be offline. Try again.'; }
  }

  const removeEvent = (eid: string) => set({ picked: form.picked.filter((x) => x !== eid) });
  const copyLink = () => navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  const eventRow = (e: Ev) => {
    const isTemplate = form.repeat && e.id === rule.templateEventId;
    const hidden = e.status === 'PUBLISHED' && e.visibility !== 'PUBLIC';
    const isNew = !saved.picked.includes(e.id);
    return (
      <li key={e.id} className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <Link href={`/organizer/events/${e.id}`} className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:underline">{e.title}</Link>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {dateText(e.startAt, e.timezone)} · {STATUS[e.status] ?? e.status.toLowerCase()}
            {hidden && ' · Not on the series page (not public)'}
            {isTemplate && ' · Copied for repeats'}
            {isNew && (e.inOtherSeries ? ' · Moves here from another series when you save' : ' · Added, not saved yet')}
          </p>
        </div>
        <button type="button" onClick={() => removeEvent(e.id)} disabled={isTemplate}
          title={isTemplate ? 'This event is copied for repeats. Choose another event to copy first.' : undefined}
          aria-label={`Remove “${e.title}” from the series`}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-[10px] text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-white disabled:opacity-30 disabled:hover:bg-transparent">
          <X className="w-4 h-4" aria-hidden />
        </button>
      </li>
    );
  };
  const group = (title: string, items: Ev[], hint?: string) => items.length ? (
    <div className="pt-3 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title} <span className="font-normal normal-case tracking-normal">· {items.length}</span></p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">{items.map(eventRow)}</ul>
    </div>
  ) : null;

  return (
    <div className="font-jakarta max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/organizer/series" aria-label="Back to series" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="portal-title truncate">{saved.name}</h1>
          <p className="portal-subtitle">{inSeries.length} {inSeries.length === 1 ? 'event' : 'events'} · {data.followers} {data.followers === 1 ? 'follower' : 'followers'}</p>
        </div>
        <a href={`/series/${data.series.slug}`} target="_blank" rel="noreferrer" className={ghostBtn}><ExternalLink className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">View page</span><span className="sm:hidden">View</span></a>
      </div>

      {note && (
        <p role={note.error ? 'alert' : 'status'} className={`p-3 rounded-[12px] border text-sm ${note.error ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300' : 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'}`}>{note.text}</p>
      )}

      <SeriesStats id={id} reloadKey={saved.picked.join(',')} />

      {/* Details */}
      <section className={`${card} space-y-4`} aria-labelledby="s-details">
        <h2 id="s-details" className="text-sm font-semibold text-gray-900 dark:text-white">Series details</h2>
        <div>
          <p className={label}>Cover image <span className="font-normal text-gray-500">(optional)</span></p>
          {form.cover ? (
            <div className="relative rounded-[12px] overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.cover} alt="Series cover" className="w-full aspect-[3/1] object-cover" />
              {busy === 'cover' && <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" aria-label="Uploading" /></span>}
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'cover'}
              className="w-full aspect-[3/1] max-h-44 flex flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60">
              {busy === 'cover' ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <ImagePlus className="w-5 h-5" aria-hidden />}
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{busy === 'cover' ? 'Uploading…' : 'Upload a cover image'}</span>
            </button>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-[180px]">Wide image, 1200 × 400 works best. JPG, PNG or WebP, up to 5 MB.</p>
            {form.cover && (
              <>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'cover'} className={`${ghostBtn} min-h-[36px] text-[13px]`}>Change</button>
                <button type="button" onClick={() => set({ cover: '' })} disabled={busy === 'cover'} className={`${ghostBtn} min-h-[36px] text-[13px]`}>Remove</button>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} className="sr-only" tabIndex={-1} aria-label="Choose a cover image" />
          {coverError && <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{coverError}</p>}
        </div>
        <div>
          <label htmlFor="s-name" className={label}>Name</label>
          <input id="s-name" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className={input} />
          {form.name.trim() !== saved.name && <p className="mt-1 text-xs text-gray-500">Changing the name also changes the page link. The old link stops working.</p>}
        </div>
        <div>
          <label htmlFor="s-desc" className={label}>About this series <span className="font-normal text-gray-500">(optional)</span></label>
          <textarea id="s-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} rows={3} className={`${input} py-2`} placeholder="What happens at these events and who they’re for." />
          <p className="mt-1 text-xs text-gray-500 text-right">{form.description.length}/1000</p>
        </div>
      </section>

      {/* Share */}
      <section className={`${card} space-y-3`} aria-labelledby="s-share">
        <div>
          <h2 id="s-share" className="text-sm font-semibold text-gray-900 dark:text-white">Share the series page</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">People can see every event and follow to hear when the next one opens.</p>
        </div>
        <div className="flex gap-2">
          <input readOnly value={publicUrl} aria-label="Series page link" onFocus={(e) => e.currentTarget.select()} className={`${input} text-gray-600 dark:text-gray-400`} />
          <button type="button" onClick={copyLink} className={`${ghostBtn} shrink-0`}>{copied ? <Check className="w-4 h-4 text-green-600" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}<span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span><span className="sr-only sm:hidden">{copied ? 'Copied' : 'Copy link'}</span></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/?text=${shareText}%20${encodeURIComponent(publicUrl)}`} target="_blank" rel="noreferrer" className={`${ghostBtn} min-h-[36px] text-[13px]`}>WhatsApp</a>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`} target="_blank" rel="noreferrer" className={`${ghostBtn} min-h-[36px] text-[13px]`}><Linkedin className="w-3.5 h-3.5" aria-hidden /> LinkedIn</a>
          <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(publicUrl)}`} target="_blank" rel="noreferrer" className={`${ghostBtn} min-h-[36px] text-[13px]`}>X</a>
        </div>
      </section>

      {/* Events */}
      <section className={card} aria-labelledby="s-events">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 id="s-events" className="text-sm font-semibold text-gray-900 dark:text-white">Events in this series</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Published public events show on the series page, in date order. Followers are emailed when a new one is published.</p>
          </div>
          <button type="button" onClick={() => setAdding(true)} className={`${ghostBtn} shrink-0`}><Plus className="w-4 h-4" aria-hidden /> Add events</button>
        </div>
        {inSeries.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-700 dark:text-gray-300">No events in this series yet.</p>
            <button type="button" onClick={() => setAdding(true)} className="mt-2 text-sm font-semibold text-gray-900 dark:text-white underline underline-offset-2">Add your events</button>
          </div>
        ) : (
          <div>
            {group('Upcoming', groups.upcoming)}
            {group('Not live yet', groups.notLive, 'Drafts and events waiting for review. They show on the page once published.')}
            {group('Past', groups.past)}
          </div>
        )}
      </section>

      {/* Repeat */}
      <section className={`${card} space-y-4`} aria-labelledby="s-repeat">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={form.repeat} onChange={(e) => set({ repeat: e.target.checked })} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
          <span>
            <span id="s-repeat" className="block text-sm font-semibold text-gray-900 dark:text-white">Repeat automatically</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">We copy an event as a <strong className="font-semibold">draft</strong> ahead of each date and email you. Nothing is published until you publish it.</span>
          </span>
        </label>
        {form.repeat && (
          <>
            <div>
              <label htmlFor="s-template" className={label}>Event to copy</label>
              <select id="s-template" value={rule.templateEventId}
                onChange={(e) => { const v = e.target.value; set({ rule: { ...rule, templateEventId: v }, picked: v && !form.picked.includes(v) ? [...form.picked, v].sort() : form.picked }); }}
                className={input}>
                <option value="">Choose an event…</option>
                {data.events.map((e) => <option key={e.id} value={e.id}>{e.title} ({dateText(e.startAt, e.timezone)})</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-1">Details, speakers, agenda, tickets and questions are copied. Attendees never are.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-freq" className={label}>How often</label>
                <select id="s-freq" value={`${rule.freq}:${rule.interval}`} onChange={(e) => { const [f, n] = e.target.value.split(':'); set({ rule: { ...rule, freq: f as Rule['freq'], interval: Number(n), monthWeek: f === 'MONTHLY' ? rule.monthWeek ?? 1 : null } }); }} className={input}>
                  <option value="WEEKLY:1">Every week</option>
                  <option value="WEEKLY:2">Every 2 weeks</option>
                  <option value="MONTHLY:1">Every month</option>
                  <option value="MONTHLY:2">Every 2 months</option>
                  <option value="MONTHLY:3">Every 3 months</option>
                </select>
              </div>
              {rule.freq === 'MONTHLY' && (
                <div>
                  <label htmlFor="s-week" className={label}>Which {weekday >= 0 ? DAYS[weekday] : 'day'}</label>
                  <select id="s-week" value={rule.monthWeek ?? 1} onChange={(e) => set({ rule: { ...rule, monthWeek: Number(e.target.value) } })} className={input}>
                    <option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option><option value={4}>Fourth</option><option value={-1}>Last</option>
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="s-ahead" className={label}>Create the draft</label>
                <select id="s-ahead" value={rule.createAheadDays} onChange={(e) => set({ rule: { ...rule, createAheadDays: Number(e.target.value) } })} className={input}>
                  {[7, 14, 21, 30, 45, 60].map((n) => <option key={n} value={n}>{n} days before</option>)}
                </select>
              </div>
            </div>
            {template && weekday >= 0 && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Repeats {rule.freq === 'WEEKLY' ? (rule.interval === 1 ? `every ${DAYS[weekday]}` : `every ${rule.interval} weeks on ${DAYS[weekday]}`)
                  : `on the ${rule.monthWeek === -1 ? 'last' : ['first', 'second', 'third', 'fourth'][(rule.monthWeek ?? 1) - 1]} ${DAYS[weekday]} of every ${rule.interval === 1 ? 'month' : `${rule.interval} months`}`}, at the same time as the event you copy. {describeEnd(rule, templateDate)}.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="s-ends" className={label}>Ends</label>
                <select id="s-ends" value={rule.ends}
                  onChange={(e) => {
                    const ends = e.target.value as Rule['ends'];
                    setRule({ ends, endAfter: ends === 'after' ? rule.endAfter ?? 6 : null, endOn: ends === 'on' ? rule.endOn ?? (templateDate ? addDays(templateDate > today ? templateDate : today, 182) : null) : null });
                  }}
                  className={input}>
                  <option value="never">Never</option>
                  <option value="after">After a number of events</option>
                  <option value="on">On a date</option>
                </select>
              </div>
              {rule.ends === 'after' && (
                <div>
                  <label htmlFor="s-count" className={label}>Number of events</label>
                  <input id="s-count" type="number" inputMode="numeric" min={1} max={MAX_END_AFTER} value={rule.endAfter ?? ''}
                    onChange={(e) => setRule({ endAfter: e.target.value === '' ? null : Math.min(MAX_END_AFTER, Math.max(1, Math.round(Number(e.target.value)))) })} className={input} />
                  <p className="text-xs text-gray-500 mt-1">Counted after the event you copy.</p>
                </div>
              )}
              {rule.ends === 'on' && (
                <div>
                  <label htmlFor="s-until" className={label}>Last date</label>
                  <input id="s-until" type="date" min={templateDate ? addDays(templateDate, 1) : undefined} value={rule.endOn ?? ''} onChange={(e) => setRule({ endOn: e.target.value || null })} className={input} />
                </div>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-[12px] border border-gray-200 dark:border-gray-800">
              <input type="checkbox" checked={rule.paused} onChange={(e) => setRule({ paused: e.target.checked })} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
              <span>
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">Pause repeating</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">No drafts are made while paused. Dates that pass in the meantime are not created later. Your settings are kept.</span>
              </span>
            </label>

            {template && (
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Next dates</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">Skip a date to leave it out, for example a holiday week. The rest of the schedule stays the same.</p>
                {rule.paused ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300">Paused. Turn off “Pause repeating” to see and create the next dates.</p>
                ) : upcomingDates.length === 0 ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300">No more dates. This repeat has ended; change “Ends” to continue it.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-[12px]">
                    {upcomingDates.map(({ date, skipped }) => {
                      const made = madeOn.has(date);
                      const draftOn = addDays(date, -rule.createAheadDays);
                      return (
                        <li key={date} className="flex items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${skipped ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{niceDay(date)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {skipped ? 'Skipped' : made ? 'Already has an event in this series' : draftOn <= today ? 'Draft is made on the next daily run' : `Draft made on ${niceDay(draftOn, false)}`}
                            </p>
                          </div>
                          {!made && (
                            <button type="button" onClick={() => toggleSkip(date)} className={`${ghostBtn} min-h-[34px] text-[13px]`}>
                              {skipped ? 'Undo' : <><CalendarX2 className="w-3.5 h-3.5" aria-hidden /> Skip</>}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Danger zone */}
      <section className={`${card} flex flex-wrap items-center gap-3`} aria-labelledby="s-delete">
        <div className="flex-1 min-w-[200px]">
          <h2 id="s-delete" className="text-sm font-semibold text-gray-900 dark:text-white">Delete series</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Its events stay as they are. The series page and its followers are removed.</p>
        </div>
        <button type="button" onClick={() => setAskDelete(true)} disabled={busy === 'delete'} className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] border border-red-200 dark:border-red-900/50 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-4 h-4" aria-hidden /> Delete series
        </button>
      </section>

      {/* Appears only while there are unsaved changes, above the mobile tab bar. */}
      {dirty && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 z-sticky">
          <div role="region" aria-label="Unsaved changes" className="flex items-center gap-2 p-2 pl-4 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-lg">
            <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">Unsaved changes</p>
            <button type="button" onClick={() => { setForm(saved); setNote(null); setCoverError(''); }} disabled={busy === 'save'} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Discard</button>
            <button type="button" onClick={save} disabled={busy === 'save' || busy === 'cover'} className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save changes
            </button>
          </div>
        </div>
      )}

      {adding && (
        <AddEventsSheet
          events={data.events.filter((e) => !form.picked.includes(e.id))}
          onClose={() => setAdding(false)}
          onAdd={(ids) => { set({ picked: [...form.picked, ...ids].sort() }); setAdding(false); }}
        />
      )}
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

/** Pick events to add: search, newest first, events in another series say they'll move. */
function AddEventsSheet({ events, onClose, onAdd }: { events: Ev[]; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const term = q.trim().toLowerCase();
  const shown = term ? events.filter((e) => e.title.toLowerCase().includes(term)) : events;
  const toggle = (eid: string) => setChosen((c) => { const n = new Set(c); if (n.has(eid)) n.delete(eid); else n.add(eid); return n; });

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85dvh] flex flex-col bg-white dark:bg-gray-900 rounded-t-[20px] sm:rounded-[16px] shadow-2xl font-jakarta">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h2 id="add-title" className="text-base font-semibold text-gray-900 dark:text-white">Add events</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
            <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your events" aria-label="Search your events" className={`${input} pl-9`} />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto overscroll-contain px-2 border-t border-gray-100 dark:border-gray-800">
          {shown.length === 0 ? (
            <li className="px-2 py-8 text-center text-sm text-gray-500">{events.length === 0 ? 'All your events are already in this series.' : 'No events match that search.'}</li>
          ) : shown.map((e) => (
            <li key={e.id}>
              <label className="flex items-center gap-3 px-2 py-2.5 rounded-[10px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <input type="checkbox" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 rounded border-gray-300" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-900 dark:text-white truncate">{e.title}</span>
                  <span className="block text-xs text-gray-500">{dateText(e.startAt, e.timezone)} · {STATUS[e.status] ?? e.status.toLowerCase()}{e.inOtherSeries ? ' · In another series (moves here)' : ''}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-4 border-t border-gray-100 dark:border-gray-800">
          <p className="flex-1 text-xs text-gray-500">Saved when you press Save changes.</p>
          <button type="button" onClick={onClose} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" onClick={() => onAdd(Array.from(chosen))} disabled={chosen.size === 0}
            className="min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-40">
            {chosen.size ? `Add ${chosen.size} ${chosen.size === 1 ? 'event' : 'events'}` : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

type Stats = {
  views: { last30: number; previous30: number; visitors30: number };
  followers: { total: number; new30: number; stopped30: number };
  totals: { events: number; registrations: number; attended: number; attendanceRate: number | null; cameBack: number };
  events: { id: string; title: string; startAt: string; timezone: string; past: boolean; registrations: number; attended: number | null }[];
};

/** Counts only: page views, followers, registrations and check-ins per event, and people who came back. */
function SeriesStats({ id, reloadKey }: { id: string; reloadKey: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/organizer/series/${id}/stats`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) { if (d.success) { setStats(d); setFailed(false); } else setFailed(true); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [id, reloadKey]);

  if (failed) return null;
  const tile = 'p-3 sm:p-4 rounded-[12px] border border-gray-200 dark:border-gray-800';
  const big = 'text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white tabular-nums';
  const small = 'text-xs text-gray-500 dark:text-gray-400 mt-0.5';
  const change = stats ? stats.views.last30 - stats.views.previous30 : 0;
  const rows = stats ? (showAll ? stats.events : stats.events.slice(0, 5)) : [];

  return (
    <section className={card} aria-labelledby="s-stats">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 id="s-stats" className="text-sm font-semibold text-gray-900 dark:text-white">How the series is doing</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Page and followers: last 30 days</p>
      </div>
      {!stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`${tile} h-[76px] animate-pulse bg-gray-50 dark:bg-gray-800/40`} />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className={tile}>
              <p className={big}>{stats.views.last30.toLocaleString('en-IN')}</p>
              <p className={small}>Page views{stats.views.previous30 || stats.views.last30 ? ` · ${change >= 0 ? '+' : ''}${change.toLocaleString('en-IN')} vs before` : ''}</p>
            </div>
            <div className={tile}>
              <p className={big}>{stats.followers.total.toLocaleString('en-IN')}</p>
              <p className={small}>Followers · +{stats.followers.new30} new{stats.followers.stopped30 ? `, ${stats.followers.stopped30} stopped` : ''}</p>
            </div>
            <div className={tile}>
              <p className={big}>{stats.totals.registrations.toLocaleString('en-IN')}</p>
              <p className={small}>Registrations, all events</p>
            </div>
            <div className={tile}>
              <p className={big}>{stats.totals.attendanceRate === null ? '–' : `${stats.totals.attendanceRate}%`}</p>
              <p className={small}>Showed up (past events){stats.totals.cameBack ? ` · ${stats.totals.cameBack} came back` : ''}</p>
            </div>
          </div>
          {stats.events.length > 0 && (
            <div className="mt-4 overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th scope="col" className="font-medium px-1 pb-2">Event</th>
                    <th scope="col" className="font-medium px-1 pb-2 text-right">Registered</th>
                    <th scope="col" className="font-medium px-1 pb-2 text-right">Checked in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="px-1 py-2 min-w-0">
                        <Link href={`/organizer/events/${e.id}`} className="block max-w-[52vw] sm:max-w-none truncate text-gray-900 dark:text-white hover:underline">{e.title}</Link>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{dateText(e.startAt, e.timezone)}{e.past ? '' : ' · Upcoming'}</span>
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums text-gray-900 dark:text-white">{e.registrations}</td>
                      <td className="px-1 py-2 text-right tabular-nums text-gray-900 dark:text-white">{e.attended === null ? '–' : e.attended}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.events.length > 5 && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm font-semibold text-gray-900 dark:text-white underline underline-offset-2">
                  {showAll ? 'Show fewer' : `Show all ${stats.events.length} events`}
                </button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">You see counts only. Followers’ email addresses stay private; they hear from you through new-event emails.</p>
        </>
      )}
    </section>
  );
}
