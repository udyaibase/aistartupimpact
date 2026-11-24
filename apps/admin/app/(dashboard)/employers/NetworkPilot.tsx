'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flag, Loader2, Play, Plus, Users, X } from 'lucide-react';
import { getNetworkPilotAction, resumeNetworkAction, setNetworkPilotAction } from './network-actions';

interface Stats {
  visible: number; profiles: number; sent30: number; accepted30: number; answeredNo30: number; reported30: number; applied30: number;
  medianReplyHours: number | null;
}
interface Pilot { id: string; companyName: string; plan: string; networkPausedAt: string | null; sent30: number; accepted30: number }
interface Report {
  id: string; createdAt: string; respondedAt: string | null; message: string; reportReason: string | null; sentByEmail: string;
  employerId: string; companyName: string; networkPausedAt: string | null; jobTitle: string;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

/**
 * "Open to opportunities" pilot: pick the companies that can search the network, watch acceptance and reports,
 * and handle reports (a report pauses that company's requests until it's resumed here).
 * Open it to everyone when acceptance stays above ~25% and reports stay near zero.
 */
export default function NetworkPilot() {
  const [data, setData] = useState<{ stats: Stats; pilots: Pilot[]; others: { id: string; companyName: string }[]; reports: Report[] } | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await getNetworkPilotAction();
    if (r.success) setData({ stats: r.stats as Stats, pilots: r.pilots as Pilot[], others: r.others as { id: string; companyName: string }[], reports: r.reports as Report[] });
    else setMsg(r.error || 'Couldn’t load the pilot');
  };
  useEffect(() => { void load(); }, []);

  const matches = useMemo(() => (data && q.trim().length >= 2 ? data.others.filter((o) => o.companyName.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []), [data, q]);

  async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>, done: string) {
    setBusy(key); setMsg('');
    const r = await fn();
    setBusy(null);
    setMsg(r.success ? done : r.error || 'Failed');
    if (r.success) void load();
  }

  if (!data) return msg ? <p className="text-sm text-red-600">{msg}</p> : null;
  const { stats: s } = data;
  const answered = s.accepted30 + s.answeredNo30;

  return (
    <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 space-y-4" aria-labelledby="np-h">
      <div>
        <h2 id="np-h" className="font-sora font-bold text-base text-navy dark:text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-brand" /> Open to opportunities (pilot)
          {data.reports.some((r) => r.networkPausedAt) && <span className="text-xs font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">Report to review</span>}
        </h2>
        <p className="text-xs text-gray-500 font-jakarta mt-1">Job seekers opt in from their account; only the companies below can search them. Open it to everyone when acceptance stays above about 25% and reports stay near zero.</p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-jakarta">
        {[
          ['Visible profiles', `${s.visible} of ${s.profiles}`],
          ['Requests (30 days)', String(s.sent30)],
          ['Accepted', `${pct(s.accepted30, answered)} (${s.accepted30})`],
          ['Applied', String(s.applied30)],
          ['Reports', String(s.reported30)],
          ['Median reply', s.medianReplyHours == null ? '–' : `${s.medianReplyHours} h`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="text-sm font-semibold text-navy dark:text-white tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {msg && <p role="status" className="text-sm font-jakarta text-gray-700 dark:text-gray-300">{msg}</p>}

      {data.reports.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-1.5"><Flag className="w-4 h-4 text-red-600" /> Reports (90 days)</h3>
          <ul className="space-y-2">
            {data.reports.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1.5 font-jakarta">
                <p className="text-sm text-navy dark:text-white"><strong>{r.companyName}</strong> · {r.jobTitle} · sent by {r.sentByEmail} · reported {fmt(r.respondedAt)}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Reason: {r.reportReason || '(none given)'}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line border-l-2 border-gray-200 dark:border-gray-700 pl-2">{r.message}</p>
                {r.networkPausedAt ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={!!busy} onClick={() => run(`resume:${r.employerId}`, () => resumeNetworkAction(r.employerId), `${r.companyName} can send requests again.`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
                      {busy === `resume:${r.employerId}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Resume requests
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => run(`off:${r.employerId}`, () => setNetworkPilotAction(r.employerId, false), `${r.companyName} removed from the pilot.`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-semibold disabled:opacity-50">
                      <X className="w-3.5 h-3.5" /> Remove from pilot
                    </button>
                  </div>
                ) : <p className="text-xs text-green-700">Reviewed: requests resumed.</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-navy dark:text-white">Pilot companies ({data.pilots.length})</h3>
        {data.pilots.length === 0 ? <p className="text-sm text-gray-400 font-jakarta">None yet. Add 5–10 companies you trust.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {data.pilots.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-jakarta">
                <span className="text-sm text-navy dark:text-white flex-1 min-w-0">{p.companyName} <span className="text-xs text-gray-500">· {p.plan} · {p.sent30} sent, {p.accepted30} accepted (30 days){p.networkPausedAt ? ' · paused' : ''}</span></span>
                <button type="button" disabled={!!busy} onClick={() => run(`off:${p.id}`, () => setNetworkPilotAction(p.id, false), `${p.companyName} removed from the pilot.`)}
                  className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50">Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <label htmlFor="np-add" className="sr-only">Add a company to the pilot</label>
          <input id="np-add" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a company: type its name" className="input-field w-full text-sm" />
          {matches.length > 0 && (
            <ul className="mt-1 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
              {matches.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-3 py-1.5 font-jakarta">
                  <span className="text-sm text-navy dark:text-white">{o.companyName}</span>
                  <button type="button" disabled={!!busy} onClick={() => { setQ(''); void run(`on:${o.id}`, () => setNetworkPilotAction(o.id, true), `${o.companyName} added to the pilot.`); }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Add</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
