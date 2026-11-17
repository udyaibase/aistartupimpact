'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Video } from 'lucide-react';

type Status = { provider: 'zoom' | 'google'; configured: boolean; connected: boolean; needsReconnect: boolean };
const NAME = { zoom: 'Zoom', google: 'Google Meet' } as const;

/**
 * Under the meeting link field: one click to create a Zoom meeting or Google Meet link at the event's time.
 * Shows nothing when neither app is available on Udyaibase yet.
 */
export default function MeetingLinkButtons({ title, startAt, endAt, timezone, eventId, onCreated }: {
  title: string;
  /** UTC ISO strings, or empty when the date isn't set yet. */
  startAt: string;
  endAt: string;
  timezone: string;
  eventId?: string;
  onCreated: (m: { joinUrl: string; provider: 'zoom' | 'google'; externalId: string; meetingProof?: string }) => void;
}) {
  const [rows, setRows] = useState<Status[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/organizer/integrations').then((r) => r.json()).then((d) => setRows(d.success ? d.integrations : [])).catch(() => setRows([]));
  }, []);

  const available = rows?.filter((r) => r.configured) ?? [];
  if (!available.length) return null;
  const connected = available.filter((r) => r.connected);

  async function create(provider: 'zoom' | 'google') {
    setError('');
    if (!title.trim()) { setError('Add the event title first.'); return; }
    if (!startAt || !endAt) { setError('Set the date and time first.'); return; }
    setBusy(provider);
    try {
      const r = await fetch('/api/organizer/integrations/meeting', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, title, startAt, endAt, timezone, eventId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.joinUrl) { setError(d.error || 'Couldn’t create the meeting.'); return; }
      onCreated({ joinUrl: d.joinUrl, provider, externalId: d.externalId, meetingProof: d.meetingProof });
    } catch { setError('You seem to be offline.'); }
    finally { setBusy(''); }
  }

  return (
    <div className="mt-2">
      {connected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {connected.map((r) => (
            <button key={r.provider} type="button" onClick={() => create(r.provider)} disabled={!!busy}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              {busy === r.provider ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Video className="w-4 h-4" aria-hidden />}
              Create {NAME[r.provider]} {r.provider === 'zoom' ? 'meeting' : 'link'}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Use Zoom or Google Meet? <Link href="/organizer/settings" target="_blank" className="font-semibold text-gray-700 dark:text-gray-300 underline underline-offset-2">Connect it in Settings</Link> to create the link here in one click.
        </p>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
