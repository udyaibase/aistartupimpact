'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Video } from 'lucide-react';

type Status = { provider: 'zoom' | 'google'; configured: boolean; connected: boolean; needsReconnect: boolean; accountEmail: string | null };

const INFO = {
  zoom: { name: 'Zoom', hint: 'Create Zoom meetings for online events' },
  google: { name: 'Google Meet', hint: 'Create Meet links through your Google Calendar' },
} as const;

const ERRORS: Record<string, string> = {
  denied: 'You didn’t allow access, so nothing was connected.',
  expired: 'That took too long or was started in another tab. Please try again.',
  failed: 'Connecting didn’t work. Please try again.',
  permission: 'Only the workspace owner or an admin can connect apps.',
  not_configured: 'This app isn’t available yet.',
  unknown: 'Unknown app.',
};

function Logo({ provider }: { provider: 'zoom' | 'google' }) {
  return (
    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${provider === 'zoom' ? 'bg-[#0B5CFF]' : 'bg-[#00832D]'}`} aria-hidden>
      <Video className="w-4.5 h-4.5 text-white" />
    </span>
  );
}

/** Settings: connect Zoom / Google Meet so meeting links can be created from the event form. */
export default function MeetingIntegrations() {
  const [rows, setRows] = useState<Status[] | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/organizer/integrations');
    const d = await r.json().catch(() => ({}));
    setRows(d.success ? d.integrations : []);
  }, []);

  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    const ok = q.get('connected');
    const err = q.get('integration_error');
    if (ok === 'zoom' || ok === 'google') setNote({ kind: 'ok', text: `${INFO[ok].name} is connected.` });
    else if (err) setNote({ kind: 'error', text: ERRORS[err] ?? ERRORS.failed });
    if (ok || err) {
      q.delete('connected'); q.delete('integration_error');
      window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`);
    }
  }, [load]);

  async function disconnect(p: 'zoom' | 'google') {
    if (!confirm(`Disconnect ${INFO[p].name}? Meeting links you already shared keep working, but time changes won’t update them.`)) return;
    setBusy(p);
    const r = await fetch(`/api/organizer/integrations/${p}`, { method: 'DELETE' });
    setBusy('');
    setNote(r.ok ? { kind: 'ok', text: `${INFO[p].name} is disconnected.` } : { kind: 'error', text: 'Couldn’t disconnect. Please try again.' });
    load();
  }

  const visible = rows?.filter((r) => r.configured || r.connected) ?? [];

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <h2 className="portal-eyebrow">Meeting apps</h2>
      </div>
      <div className="p-4 bg-white dark:bg-gray-950">
        {note && <p role="status" className={`mb-3 text-sm ${note.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-600'}`}>{note.text}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">Zoom and Google Meet connections are coming soon. Until then, paste any meeting link into your event.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {visible.map((r) => (
              <li key={r.provider} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Logo provider={r.provider} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{INFO[r.provider].name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {r.needsReconnect ? <span className="text-amber-700 dark:text-amber-400">Access expired. Connect again to keep creating meetings.</span>
                      : r.connected ? `Connected${r.accountEmail ? ` as ${r.accountEmail}` : ''}` : INFO[r.provider].hint}
                  </p>
                </div>
                {r.connected ? (
                  <button onClick={() => disconnect(r.provider)} disabled={busy === r.provider} className="min-h-[40px] px-3 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                    {busy === r.provider ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : 'Disconnect'}
                  </button>
                ) : r.configured ? (
                  <a href={`/api/organizer/integrations/${r.provider}/connect`} className="inline-flex items-center min-h-[40px] px-4 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
                    {r.needsReconnect ? 'Reconnect' : 'Connect'}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
