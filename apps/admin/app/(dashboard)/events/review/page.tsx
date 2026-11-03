'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Check, ExternalLink, Loader2, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { approveEventAction, declineEventAction, listReviewQueueAction, suspendOrganizerAction, type ReviewItem } from './actions';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl';

/**
 * Event trust & safety: first events from new independent organizers, and events hidden after reports.
 * Approve (publishes; a first event makes the organizer verified), decline with a note, or suspend the organizer.
 */
export default function EventReviewPage() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    const r = await listReviewQueueAction();
    if (r.success) setItems(r.items); else { setError(r.error ?? 'Failed to load.'); setItems([]); }
  };
  useEffect(() => { load(); }, []);

  async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusy(key);
    setError('');
    setNotice('');
    const r = await fn();
    setBusy(null);
    if (r.success) { setNotice(ok); load(); } else setError(r.error ?? 'Something went wrong.');
  }

  const decline = (e: ReviewItem) => {
    const note = prompt(`Why can't "${e.title}" be published? The organizer sees this note.`);
    if (note) run(e.id, () => declineEventAction(e.id, note), `Sent "${e.title}" back to the organizer.`);
  };
  const suspend = (e: ReviewItem) => {
    const reason = prompt(`Suspend ${e.organizer.name}? Their upcoming events are cancelled, attendees are told and paid tickets refunded. Reason (kept in the audit log):`);
    if (reason) run(`s:${e.organizer.id}`, () => suspendOrganizerAction(e.organizer.id, reason), `${e.organizer.name} is suspended.`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-brand" /> Event review</h1>
        <p className="text-sm text-gray-500 mt-0.5">First events from new organizers, and events hidden after 3 reports. Nothing here is public until you approve it.</p>
      </div>

      {notice && <p role="status" className="text-sm rounded-lg px-3 py-2 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300">{notice}</p>}
      {error && <p role="alert" className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {items === null ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className={`${card} p-10 text-center text-sm text-gray-500`}>Nothing to review. 🎉</div>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/events/${e.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline inline-flex items-center gap-1">
                      {e.title} <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                    {e.held
                      ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Hidden after reports</span>
                      : <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">First event</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Starts {fmt(e.startAt)} · submitted {fmt(e.createdAt)}{e.reviewNote ? ` · ${e.reviewNote}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => run(e.id, () => approveEventAction(e.id), `"${e.title}" is live.`)} disabled={!!busy}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
                    {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                  </button>
                  <button onClick={() => decline(e)} disabled={!!busy}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-50">
                    <X className="w-4 h-4" /> Decline
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-sm">
                  <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    {e.organizer.name}
                    {e.organizer.verified && <span className="inline-flex items-center gap-0.5 text-[11px] text-green-700"><BadgeCheck className="w-3.5 h-3.5" /> Verified organizer</span>}
                    {e.organizer.status === 'SUSPENDED' && <span className="text-[11px] font-bold text-red-700">Suspended</span>}
                  </p>
                  <p className="text-xs text-gray-500">{e.organizer.email} · {e.organizer.events} event{e.organizer.events === 1 ? '' : 's'}</p>
                  {e.organizer.bio && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 line-clamp-3">{e.organizer.bio}</p>}
                  <p className="mt-1 text-xs space-x-3">
                    {e.organizer.website && <a href={e.organizer.website} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">Website</a>}
                    {e.organizer.linkedin && <a href={e.organizer.linkedin} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">LinkedIn</a>}
                    {!e.organizer.website && !e.organizer.linkedin && <span className="text-amber-700">No website or LinkedIn on their profile</span>}
                  </p>
                  {e.organizer.status !== 'SUSPENDED' && (
                    <button onClick={() => suspend(e)} disabled={!!busy} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50">
                      <ShieldOff className="w-3.5 h-3.5" /> Suspend organizer
                    </button>
                  )}
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-sm">
                  <p className="font-semibold text-gray-900 dark:text-white">Reports · {e.reports.length}</p>
                  {e.reports.length === 0 ? <p className="text-xs text-gray-500">None</p> : (
                    <ul className="mt-1 space-y-1.5">
                      {e.reports.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-300"><span className="font-semibold">{r.reason}</span> · {fmt(r.at)}<br /><span className="text-gray-500">{r.details}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
