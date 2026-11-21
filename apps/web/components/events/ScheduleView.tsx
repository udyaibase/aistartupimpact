'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, FileText, PlayCircle, Star } from 'lucide-react';
import { sessionTimes } from '@/lib/events/agenda';
import { buildIcs, downloadIcs } from '@/lib/events/ics';

export type ScheduleSession = {
  id: string; dayNumber: number; startTime: string; endTime: string; title: string; description?: string | null;
  speakerName?: string | null; track?: string | null; recordingUrl?: string | null; slidesUrl?: string | null;
};

/**
 * Public schedule: days as tabs, a track filter, and "My schedule" (starred sessions, kept on this device only)
 * with calendar downloads for one session or the whole personal schedule.
 */
export default function ScheduleView({ sessions, tracks, event }: {
  sessions: ScheduleSession[];
  tracks: string[];
  event: { slug: string; title: string; startAt: string; timezone: string; location?: string | null; ended: boolean };
}) {
  const days = useMemo(() => Array.from(new Set(sessions.map((s) => s.dayNumber))).sort((a, b) => a - b), [sessions]);
  const [day, setDay] = useState(days[0] ?? 1);
  const [track, setTrack] = useState<string>('');
  const [mine, setMine] = useState<string[]>([]);
  const [onlyMine, setOnlyMine] = useState(false);
  const key = `my-schedule:${event.slug}`;

  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(v)) setMine(v.filter((x) => typeof x === 'string')); } catch { /* storage unavailable */ }
  }, [key]);
  const toggle = (id: string) => {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    setMine(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const url = typeof window !== 'undefined' ? `${window.location.origin}/events/${event.slug}` : undefined;
  const ics = (list: ScheduleSession[]) => buildIcs(list.flatMap((s) => {
    const t = sessionTimes(s, event);
    return t.start && t.end ? [{ uid: `${s.id}`, title: `${s.title} · ${event.title}`, description: [s.speakerName, s.track, s.description].filter(Boolean).join(' · '), start: t.start, end: t.end, location: event.location ?? undefined, url }] : [];
  }), event.title);

  const shown = sessions
    .filter((s) => (onlyMine ? mine.includes(s.id) : s.dayNumber === day))
    .filter((s) => !track || !s.track || s.track === track)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.startTime.localeCompare(b.startTime));
  const mySessions = sessions.filter((s) => mine.includes(s.id));

  const chip = (active: boolean) => `h-11 md:h-8 px-3 rounded-[8px] text-[13px] font-semibold transition-colors ${active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Schedule</h2>
        {mySessions.length > 0 && (
          <button type="button" onClick={() => downloadIcs(ics(mySessions), `${event.slug}-my-schedule.ics`)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
            <CalendarPlus className="w-4 h-4" aria-hidden /> Add my schedule to calendar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2" role="tablist" aria-label="Days">
        {days.length > 1 && days.map((d) => (
          <button key={d} role="tab" type="button" aria-selected={!onlyMine && day === d} onClick={() => { setDay(d); setOnlyMine(false); }} className={chip(!onlyMine && day === d)}>Day {d}</button>
        ))}
        <button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)} className={`${chip(onlyMine)} inline-flex items-center gap-1`}>
          <Star className={`w-3.5 h-3.5 ${onlyMine ? 'fill-current' : ''}`} aria-hidden /> My schedule ({mine.length})
        </button>
      </div>
      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Tracks">
          <button type="button" aria-pressed={!track} onClick={() => setTrack('')} className={chip(!track)}>All tracks</button>
          {tracks.map((t) => <button key={t} type="button" aria-pressed={track === t} onClick={() => setTrack(t)} className={chip(track === t)}>{t}</button>)}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          {onlyMine ? 'Tap the star on sessions to build your schedule. It’s saved on this device.' : 'No sessions here.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => {
            const starred = mine.includes(s.id);
            return (
              <li key={s.id} className="flex gap-3 sm:gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4">
                <div className="w-16 sm:w-20 shrink-0 text-right">
                  <p className="text-xs font-mono text-gray-600 dark:text-gray-300">{s.startTime}</p>
                  {s.endTime && <p className="text-xs font-mono text-gray-400">{s.endTime}</p>}
                  {onlyMine && days.length > 1 && <p className="text-[11px] text-gray-400 mt-0.5">Day {s.dayNumber}</p>}
                </div>
                <div className="border-l-2 border-brand/20 pl-3 sm:pl-4 flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-white font-jakarta">{s.title}</p>
                  <p className="text-xs font-jakarta mt-0.5 flex flex-wrap gap-x-2">
                    {s.speakerName && <span className="text-brand">{s.speakerName}</span>}
                    {s.track && tracks.length > 0 && <span className="text-gray-500">{s.track}</span>}
                  </p>
                  {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">{s.description}</p>}
                  {event.ended && (s.recordingUrl || s.slidesUrl) && (
                    <p className="mt-1.5 flex gap-3 text-xs font-semibold">
                      {s.recordingUrl && <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand"><PlayCircle className="w-3.5 h-3.5" aria-hidden /> Watch</a>}
                      {s.slidesUrl && <a href={s.slidesUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand"><FileText className="w-3.5 h-3.5" aria-hidden /> Slides</a>}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button type="button" onClick={() => toggle(s.id)} aria-pressed={starred} aria-label={starred ? `Remove ${s.title} from my schedule` : `Add ${s.title} to my schedule`}
                    className="w-11 h-11 md:w-9 md:h-9 inline-flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Star className={`w-4 h-4 ${starred ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} aria-hidden />
                  </button>
                  {!event.ended && (
                    <button type="button" onClick={() => downloadIcs(ics([s]), `${event.slug}-${s.id.slice(0, 6)}.ics`)} aria-label={`Add ${s.title} to calendar`}
                      className="w-11 h-11 md:w-9 md:h-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                      <CalendarPlus className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
