'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Check, Loader2, Video, X } from 'lucide-react';
import { dateInput } from './MoveDialog';

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const ghost = 'inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800';

async function call<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'You seem to be offline.' } as T & { error?: string } };
  }
}

// ── Round ──────────────────────────────────────────────────────────

/** Which interview round the candidate is in (only while in the Interview stage). */
export function RoundPicker({ id, rounds, current, canMove, onChanged }: { id: string; rounds: string[]; current: string | null; canMove: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!current) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-gray-900 dark:text-white">Round</span>
      {rounds.length > 1 && canMove ? (
        <select aria-label="Interview round" value={current} disabled={busy} className="min-h-[36px] px-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm"
          onChange={async (e) => {
            setBusy(true); setError('');
            const r = await call(`/api/employer/applications/${id}/round`, { method: 'PATCH', body: JSON.stringify({ round: e.target.value }) });
            if (r.ok) onChanged(); else setError(r.data.error || 'Couldn’t change the round.');
            setBusy(false);
          }}>
          {rounds.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ) : <span className="text-gray-700 dark:text-gray-300">{current}</span>}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

// ── Interviews ─────────────────────────────────────────────────────

interface Interview { id: string; round: string; startAt: string; endAt: string; timezone: string; panelEmails: string[]; meetingUrl: string | null; status: string }

export function InterviewsSection({ id, rounds, currentRound, canMove, onScheduled }: { id: string; rounds: string[]; currentRound: string | null; canMove: boolean; onScheduled: () => void }) {
  const [data, setData] = useState<{ interviews: Interview[]; team: { email: string; name: string }[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ round: currentRound ?? rounds[0], date: dateInput(1), time: '11:00', duration: '45', meetingUrl: '', panel: [] as string[] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await call(`/api/employer/applications/${id}/interviews`);
    if (r.ok) setData(r.data);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const r = await call(`/api/employer/applications/${id}/interviews`, { method: 'POST', body: JSON.stringify({ ...form, timezone: tz }) });
    if (r.ok) {
      setOpen(false);
      setMsg('Invite emailed with a calendar file.');
      void load(); onScheduled();
    } else setMsg(r.data.error || 'Couldn’t schedule.');
    setBusy(false);
  }

  async function cancel(iv: Interview) {
    if (!confirm('Cancel this interview? The candidate is told.')) return;
    const r = await call(`/api/employer/applications/${id}/interviews?interview=${iv.id}`, { method: 'DELETE' });
    setMsg(r.ok ? 'Interview cancelled.' : r.data.error || 'Couldn’t cancel.');
    void load();
  }

  if (!data) return null;
  const upcoming = data.interviews.filter((i) => i.status === 'SCHEDULED');
  if (!canMove && !upcoming.length) return null;
  const fmt = (iv: Interview) => new Date(iv.startAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <section aria-labelledby="iv-h" className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h3 id="iv-h" className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">Interviews</h3>
        {canMove && !open && <button type="button" onClick={() => setOpen(true)} className={ghost}><CalendarPlus className="w-4 h-4" aria-hidden /> Schedule</button>}
      </div>
      {upcoming.length === 0 && !open && <p className="text-[13px] text-gray-500">Nothing scheduled.</p>}
      <ul className="space-y-1.5">
        {upcoming.map((iv) => (
          <li key={iv.id} className="flex items-start gap-2 text-[13px]">
            <Video className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="font-semibold text-gray-900 dark:text-white">{iv.round}</span> · {fmt(iv)}
              <span className="block text-xs text-gray-500">Emailed invite{iv.panelEmails.length ? ` · panel: ${iv.panelEmails.join(', ')}` : ''}</span>
              {iv.meetingUrl && <a href={iv.meetingUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-[#A50F15] hover:underline truncate">{iv.meetingUrl}</a>}
            </span>
            {canMove && <button type="button" onClick={() => cancel(iv)} aria-label="Cancel interview" className="w-8 h-8 flex items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>}
          </li>
        ))}
      </ul>
      {open && (
        <form onSubmit={schedule} className="space-y-2.5 pt-1">
          <p className="text-xs text-gray-600 dark:text-gray-400 rounded-[8px] bg-gray-50 dark:bg-gray-800 px-2.5 py-2">The candidate and panel get an email with a calendar file that works in Google, Outlook and Apple Calendar.</p>
          <div className="grid grid-cols-2 gap-2">
            {rounds.length > 1 && (
              <div className="col-span-2"><label htmlFor="iv-round" className={label}>Round</label>
                <select id="iv-round" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} className={input}>{rounds.map((r) => <option key={r}>{r}</option>)}</select></div>
            )}
            <div><label htmlFor="iv-date" className={label}>Date</label><input id="iv-date" type="date" min={dateInput(0)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} /></div>
            <div><label htmlFor="iv-time" className={label}>Time</label><input id="iv-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={input} /></div>
            <div><label htmlFor="iv-dur" className={label}>Length</label>
              <select id="iv-dur" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={input}>{[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} minutes</option>)}</select></div>
            <div className="col-span-2"><label htmlFor="iv-url" className={label}>Video link <span className="font-normal text-gray-500">(optional)</span></label><input id="iv-url" type="url" placeholder="https://meet.google.com/…" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} className={input} /></div>
          </div>
          {data.team.length > 0 && (
            <fieldset>
              <legend className={label}>Panel</legend>
              <div className="flex flex-wrap gap-1.5">
                {data.team.map((t) => {
                  const on = form.panel.includes(t.email);
                  return (
                    <button key={t.email} type="button" aria-pressed={on} onClick={() => setForm({ ...form, panel: on ? form.panel.filter((p) => p !== t.email) : [...form.panel, t.email] })}
                      className={`min-h-[32px] px-2.5 rounded-full border text-xs font-semibold ${on ? 'border-[#A50F15] bg-[#A50F15]/10 text-[#A50F15]' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      {on && <Check className="inline w-3 h-3 mr-0.5" aria-hidden />}{t.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={btn}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Send invite</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] px-3 text-sm font-semibold text-gray-600">Cancel</button>
          </div>
        </form>
      )}
      {msg && <p role="status" className="text-xs text-gray-700 dark:text-gray-300">{msg}</p>}
    </section>
  );
}

// ── Scorecards ─────────────────────────────────────────────────────

interface Card { round: string; authorName: string; mine: boolean; ratings: Record<string, number>; recommendation: 'YES' | 'NO'; notes: string | null }
const RATING = ['', 'Poor', 'Mixed', 'Good', 'Strong'];

export function ScorecardsSection({ id, currentRound }: { id: string; currentRound: string | null }) {
  const [data, setData] = useState<{ rounds: string[]; skills: string[]; hidden: number; cards: Card[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [rec, setRec] = useState<'YES' | 'NO' | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await call(`/api/employer/applications/${id}/scorecards`);
    if (r.ok) setData(r.data);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function start() {
    const rd = currentRound && data?.rounds.includes(currentRound) ? currentRound : data?.rounds[0] ?? '';
    const mine = data?.cards.find((c) => c.mine && c.round === rd);
    setRound(rd); setRatings(mine?.ratings ?? {}); setRec(mine?.recommendation ?? ''); setNotes(mine?.notes ?? ''); setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await call(`/api/employer/applications/${id}/scorecards`, { method: 'POST', body: JSON.stringify({ round, ratings, recommendation: rec, notes }) });
    if (r.ok) { setData(r.data); setOpen(false); } else setError(r.data.error || 'Couldn’t save.');
    setBusy(false);
  }

  if (!data) return null;
  const complete = data.skills.every((s) => ratings[s]) && !!rec;
  return (
    <section aria-labelledby="sc-h" className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <h3 id="sc-h" className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">Scorecards</h3>
        {!open && <button type="button" onClick={start} className={ghost}>{data.cards.some((c) => c.mine) ? 'Edit mine' : 'Add my scorecard'}</button>}
      </div>
      {data.hidden > 0 && <p className="text-xs text-gray-500">{data.hidden} scorecard{data.hidden === 1 ? '' : 's'} from colleagues will show once you submit yours for that round.</p>}
      {data.cards.length === 0 && !open && data.hidden === 0 && <p className="text-[13px] text-gray-500">No scorecards yet.</p>}
      <ul className="space-y-2">
        {data.cards.map((c, i) => (
          <li key={i} className="rounded-[10px] bg-[#F7F7F9] dark:bg-gray-900 px-3 py-2 text-[13px]">
            <p className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-white">{c.authorName}{c.mine ? ' (you)' : ''}</span>
              <span className="text-gray-500">· {c.round}</span>
              <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded ${c.recommendation === 'YES' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{c.recommendation === 'YES' ? 'Yes' : 'No'}</span>
            </p>
            <p className="mt-1 text-gray-700 dark:text-gray-300">{Object.entries(c.ratings).map(([s, v]) => `${s}: ${v}/4`).join(' · ')}</p>
            {c.notes && <p className="mt-1 text-gray-800 dark:text-gray-200 whitespace-pre-line">{c.notes}</p>}
          </li>
        ))}
      </ul>
      {open && (
        <form onSubmit={submit} className="space-y-2.5">
          {data.rounds.length > 1 && (
            <div><label htmlFor="sc-round" className={label}>Round</label>
              <select id="sc-round" value={round} onChange={(e) => setRound(e.target.value)} className={input}>{data.rounds.map((r) => <option key={r}>{r}</option>)}</select></div>
          )}
          {data.skills.map((s) => (
            <fieldset key={s}>
              <legend className="text-[13px] text-gray-800 dark:text-gray-200 mb-1">{s}</legend>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((v) => (
                  <button key={v} type="button" aria-pressed={ratings[s] === v} onClick={() => setRatings({ ...ratings, [s]: v })} title={RATING[v]}
                    className={`flex-1 min-h-[36px] rounded-[8px] border text-xs font-semibold ${ratings[s] === v ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                    {v} <span className="hidden min-[420px]:inline font-normal">{RATING[v]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className={label}>Hire?</legend>
            <div className="flex gap-2">
              {(['YES', 'NO'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={rec === v} onClick={() => setRec(v)}
                  className={`flex-1 min-h-[40px] rounded-[10px] border text-sm font-semibold ${rec === v ? (v === 'YES' ? 'border-green-700 bg-green-700 text-white' : 'border-red-700 bg-red-700 text-white') : 'border-gray-300 dark:border-gray-700'}`}>{v === 'YES' ? 'Yes' : 'No'}</button>
              ))}
            </div>
          </fieldset>
          <div><label htmlFor="sc-notes" className={label}>Notes <span className="font-normal text-gray-500">(optional)</span></label>
            <textarea id="sc-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} py-2`} /></div>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !complete} className={btn}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Submit</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] px-3 text-sm font-semibold text-gray-600">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
