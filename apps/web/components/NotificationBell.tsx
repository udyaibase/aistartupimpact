'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, X, Trash2, CheckCircle2, AlertTriangle, CalendarDays, CreditCard, Mic, Sparkles, ShieldCheck, BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Note { id: string; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }

/** One small icon per kind of update; the type names are whatever the sender used (e.g. listing_approved). */
function iconFor(type: string) {
  const t = type.toLowerCase();
  if (/approved|live|verified|summary_ready|widget_live/.test(t)) return CheckCircle2;
  if (/declined|rejected|suspend|limit|grace|ending|failed/.test(t)) return AlertTriangle;
  if (/security|two_factor|password/.test(t)) return ShieldCheck;
  if (/plan|boost|billing|payout|refund/.test(t)) return CreditCard;
  if (/cfp|speaker|talk/.test(t)) return Mic;
  if (/event|series|registration/.test(t)) return CalendarDays;
  if (/summary|analytics|views/.test(t)) return BarChart3;
  return Sparkles;
}

/**
 * Header bell for a portal: unread count, the latest notes, mark read, remove. Polls every minute while the tab is
 * visible. `api` is the portal's notifications route (GET list, PATCH read, DELETE ?id=).
 */
export default function NotificationBell({ api }: { api: string }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setNotes(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const send = (init: RequestInit, query = '') => fetch(`${api}${query}`, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null);
  const markRead = (id: string) => {
    const n = notes.find((x) => x.id === id);
    if (!n || n.read) return;
    setNotes((l) => l.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    void send({ method: 'PATCH', body: JSON.stringify({ notificationId: id }) });
  };
  const markAll = () => {
    setNotes((l) => l.map((x) => ({ ...x, read: true })));
    setUnread(0);
    void send({ method: 'PATCH', body: JSON.stringify({ markAllRead: true }) });
  };
  const remove = (id: string) => {
    const n = notes.find((x) => x.id === id);
    setNotes((l) => l.filter((x) => x.id !== id));
    if (n && !n.read) setUnread((u) => Math.max(0, u - 1));
    void send({ method: 'DELETE' }, `?id=${encodeURIComponent(id)}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) void load(); }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
      >
        <Bell className="w-5 h-5" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+60px)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800 shadow-xl z-dropdown overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-semibold text-[15px] text-gray-900 dark:text-white">Notifications</h3>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAll} className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-[12px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden /> Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="max-h-[60dvh] sm:max-h-[420px] overflow-y-auto overscroll-contain">
            {!loaded ? (
              <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            ) : failed && notes.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-600 dark:text-gray-400">Couldn’t load notifications. <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button></p>
            ) : notes.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Bell className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" aria-hidden />
                <p className="text-sm font-medium text-gray-900 dark:text-white">You’re all caught up</p>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">Updates about your account will show here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {notes.map((n) => {
                  const Icon = iconFor(n.type);
                  const body = (
                    <>
                      <span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"><Icon className="w-4 h-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[14px] leading-snug ${n.read ? 'font-medium text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>{n.title}</span>
                        <span className="block mt-0.5 text-[13px] text-gray-600 dark:text-gray-400 line-clamp-2">{n.message}</span>
                        <span className="block mt-1 text-[12px] text-gray-500 dark:text-gray-500">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={n.id} className={`group relative flex ${n.read ? '' : 'bg-gray-50 dark:bg-gray-800/40'}`}>
                      {!n.read && <span aria-label="Unread" className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand" />}
                      {n.link ? (
                        <Link href={n.link} onClick={() => { markRead(n.id); setOpen(false); }} className="flex-1 flex gap-3 pl-5 pr-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60">{body}</Link>
                      ) : (
                        <button type="button" onClick={() => markRead(n.id)} className="flex-1 flex gap-3 pl-5 pr-2 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60">{body}</button>
                      )}
                      <button type="button" onClick={() => remove(n.id)} aria-label={`Remove “${n.title}”`}
                        className="shrink-0 self-start mt-2 mr-2 w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
