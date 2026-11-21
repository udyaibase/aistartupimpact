'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2, Plus, Trash2, X } from 'lucide-react';

type Session = {
  key: string; id?: string; dayNumber: number; startTime: string; endTime: string; title: string; description: string | null;
  speakerId: string | null; track: string | null; recordingUrl: string | null; slidesUrl: string | null;
};
type Speaker = { id: string; name: string; company: string | null };

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';
const newKey = () => Math.random().toString(36).slice(2, 10);

export default function AgendaEditor({ eventId }: { eventId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [event, setEvent] = useState<{ slug: string; title: string } | null>(null);
  const [days, setDays] = useState(1);
  const [day, setDay] = useState(1);
  const [tracks, setTracks] = useState<string[]>([]);
  const [newTrack, setNewTrack] = useState('');
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/organizer/events/${eventId}/agenda`);
        const d = await r.json();
        if (!r.ok || !d.success) { setError(d.error || 'Couldn’t load the agenda.'); return; }
        setEvent(d.event);
        const maxDay = Math.max(1, ...d.sessions.map((s: Session) => s.dayNumber));
        setDays(Math.max(d.days, maxDay));
        setTracks(d.tracks);
        setSpeakers(d.speakers);
        setSessions(d.sessions.map((s: Session) => ({ ...s, key: s.id ?? newKey() })));
        setLoaded(true);
      } catch { setError('You seem to be offline.'); }
    })();
  }, [eventId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (key: string, patch: Partial<Session>) => { setDirty(true); setSessions((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s))); };
  const dayList = useMemo(() => sessions.filter((s) => s.dayNumber === day).sort((a, b) => a.startTime.localeCompare(b.startTime)), [sessions, day]);

  function addSession() {
    const last = dayList[dayList.length - 1];
    setDirty(true);
    setSessions((list) => [...list, {
      key: newKey(), dayNumber: day, startTime: last?.endTime || last?.startTime || '10:00', endTime: '', title: '', description: null,
      speakerId: null, track: tracks[0] ?? null, recordingUrl: null, slidesUrl: null,
    }]);
  }

  function addTrack() {
    const t = newTrack.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!t || tracks.some((x) => x.toLowerCase() === t.toLowerCase()) || tracks.length >= 8) return;
    setTracks([...tracks, t]);
    setNewTrack('');
    setDirty(true);
  }

  function removeTrack(t: string) {
    setTracks(tracks.filter((x) => x !== t));
    setSessions((list) => list.map((s) => (s.track === t ? { ...s, track: null } : s)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setNote(null);
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/agenda`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, sessions: sessions.map(({ key: _key, ...s }) => s) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) { setNote({ ok: false, text: d.error || 'Couldn’t save.' }); return; }
      setDirty(false);
      setNote({ ok: true, text: 'Agenda saved. It’s live on your event page.' });
      // Reload so new sessions get their ids (keeps later saves in place).
      const g = await fetch(`/api/organizer/events/${eventId}/agenda`).then((x) => x.json());
      if (g.success) setSessions(g.sessions.map((s: Session) => ({ ...s, key: s.id ?? newKey() })));
    } catch { setNote({ ok: false, text: 'You seem to be offline.' }); }
    finally { setSaving(false); }
  }

  if (error) return <div className="p-6 text-sm text-red-700">{error}</div>;
  if (!loaded || !event) return <div className="p-6 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</div>;

  return (
    <div className="font-jakarta max-w-4xl pb-24">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/organizer/events" aria-label="Back to events" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="portal-title">Agenda</h1>
          <p className="portal-subtitle truncate">{event.title}</p>
        </div>
        <Link href={`/events/${event.slug}`} target="_blank" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-brand">View page <ExternalLink className="w-3.5 h-3.5" aria-hidden /></Link>
      </div>

      {/* Tracks */}
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 mb-4">
        <h2 className="portal-section-title">Tracks</h2>
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">For sessions running in parallel, like “Main stage” and “Workshop room”. Leave empty for a single track.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tracks.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-[8px] border border-gray-300 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200">
              {t}
              <button type="button" onClick={() => removeTrack(t)} aria-label={`Remove track ${t}`} className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-3.5 h-3.5" aria-hidden /></button>
            </span>
          ))}
          {tracks.length < 8 && (
            <span className="inline-flex gap-1.5">
              <label htmlFor="new-track" className="sr-only">New track</label>
              <input id="new-track" value={newTrack} onChange={(e) => setNewTrack(e.target.value)} maxLength={40} placeholder="Add a track"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTrack(); } }} className={`${input} w-40`} />
              <button type="button" onClick={addTrack} disabled={!newTrack.trim()} className="min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold disabled:opacity-40">Add</button>
            </span>
          )}
        </div>
      </section>

      {/* Days */}
      <div role="tablist" aria-label="Days" className="flex flex-wrap items-center gap-1.5 mb-3">
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <button key={d} role="tab" aria-selected={day === d} type="button" onClick={() => setDay(d)}
            className={`h-9 px-3.5 rounded-[8px] text-sm font-semibold ${day === d ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
            Day {d} <span className="font-normal opacity-70">({sessions.filter((s) => s.dayNumber === d).length})</span>
          </button>
        ))}
        {days < 14 && <button type="button" onClick={() => { setDays(days + 1); setDay(days + 1); }} className="h-9 px-3 rounded-[8px] text-sm font-semibold text-brand inline-flex items-center gap-1"><Plus className="w-4 h-4" aria-hidden /> Add day</button>}
      </div>

      {/* Sessions */}
      <div className="space-y-3">
        {dayList.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 p-4 rounded-[12px] border border-dashed border-gray-300 dark:border-gray-700">No sessions on day {day} yet.</p>}
        {dayList.map((s, i) => (
          <div key={s.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-3 sm:p-4 space-y-2.5">
            <div className="grid grid-cols-[1fr_1fr_44px] sm:grid-cols-[110px_110px_1fr_44px] gap-2 items-start">
              <input aria-label={`Session ${i + 1} start`} type="time" value={s.startTime} onChange={(e) => edit(s.key, { startTime: e.target.value })} className={input} />
              <input aria-label={`Session ${i + 1} end`} type="time" value={s.endTime} onChange={(e) => edit(s.key, { endTime: e.target.value })} className={input} />
              <input aria-label={`Session ${i + 1} title`} value={s.title} maxLength={200} placeholder="Session title" onChange={(e) => edit(s.key, { title: e.target.value })} className={`${input} col-span-2 sm:col-span-1 order-last sm:order-none`} />
              <button type="button" onClick={() => { setDirty(true); setSessions((l) => l.filter((x) => x.key !== s.key)); }} aria-label={`Remove session ${i + 1}`}
                className="w-11 h-10 inline-flex items-center justify-center rounded-[10px] text-gray-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <select aria-label="Speaker" value={s.speakerId ?? ''} onChange={(e) => edit(s.key, { speakerId: e.target.value || null })} className={input}>
                <option value="">No speaker</option>
                {speakers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}{sp.company ? ` · ${sp.company}` : ''}</option>)}
              </select>
              {tracks.length > 0 ? (
                <select aria-label="Track" value={s.track ?? ''} onChange={(e) => edit(s.key, { track: e.target.value || null })} className={input}>
                  <option value="">All tracks</option>
                  {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : <span className="hidden sm:block" />}
            </div>
            <textarea aria-label="Description" value={s.description ?? ''} rows={2} maxLength={1000} placeholder="Short description (optional)" onChange={(e) => edit(s.key, { description: e.target.value || null })} className={`${input} py-2 resize-y`} />
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-gray-600 dark:text-gray-400">Recording and slides</summary>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                <input aria-label="Recording link" type="url" placeholder="Recording link (YouTube, Drive)" value={s.recordingUrl ?? ''} onChange={(e) => edit(s.key, { recordingUrl: e.target.value || null })} className={input} />
                <input aria-label="Slides link" type="url" placeholder="Slides link" value={s.slidesUrl ?? ''} onChange={(e) => edit(s.key, { slidesUrl: e.target.value || null })} className={input} />
              </div>
            </details>
          </div>
        ))}
        <button type="button" onClick={addSession} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          <Plus className="w-4 h-4" aria-hidden /> Add session to day {day}
        </button>
        {speakers.length === 0 && <p className="text-[13px] text-gray-500">Add speakers in the event form to assign them to sessions.</p>}
      </div>

      {/* Phones: an ordinary row at the end (nothing floating over the sessions); bigger screens keep it in view. */}
      <div className="mt-6 md:sticky md:z-10 md:bottom-0 py-3 md:bg-white/95 md:dark:bg-gray-950/95 md:backdrop-blur border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-3">
        <p role="status" className={`flex-1 text-[13px] ${note ? (note.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400') : 'text-gray-500'}`}>
          {note?.text ?? (dirty ? 'Unsaved changes' : `${sessions.length} session${sessions.length === 1 ? '' : 's'}`)}
        </p>
        <button type="button" onClick={save} disabled={saving} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save agenda
        </button>
      </div>
    </div>
  );
}
