'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Timer } from 'lucide-react';
import { getOnboardingFunnelAction } from '../actions';

const STEPS: { step: string; label: string }[] = [
  { step: 'WORKSPACE_CREATED', label: 'Workspace created' },
  { step: 'FIRST_DRAFT', label: 'First job drafted' },
  { step: 'PUBLISH_BLOCKED', label: 'Publish had to wait (company not cleared)' },
  { step: 'FOUNDER_ASKED', label: 'Founder emailed to verify' },
  { step: 'REVIEW_REQUESTED', label: 'Company check requested' },
  { step: 'REVIEW_DECIDED', label: 'Company check decided' },
  { step: 'FIRST_JOB_LIVE', label: 'First job live' },
  { step: 'FIRST_APPLICATION', label: 'First application' },
];
const PATHS = [{ key: 'founder', label: 'Founders (verified in the founder portal)' }, { key: 'signup', label: 'Sign-ups (recruiters, HR, founders not yet verified)' }];
type Row = { path: string; step: string; reached: number; medianMinutes: number; within5: number };

const fmt = (m: number | null | undefined) => m == null ? '—' : m < 1 ? '<1 min' : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`;

/** Sign-up to first live job: how many get through each step, and how long it takes (target: under 5 minutes for founders). */
export default function OnboardingFunnelPage() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    getOnboardingFunnelAction(days).then((r) => { if (r.success) setRows(r.data as Row[]); else setError(r.error || 'Failed'); });
  }, [days]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/employers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:underline font-jakarta"><ArrowLeft className="w-4 h-4" /> Employers</Link>
        <h1 className="portal-title flex items-center gap-2 mt-2"><Timer className="w-6 h-6 text-brand" /> Employer onboarding</h1>
        <p className="portal-subtitle">Workspaces created in the last {days} days. Times are medians from workspace creation. Target: first job live in under 5 minutes for founders, under 1 day for everyone else.</p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Period">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${days === d ? 'bg-navy text-white dark:bg-white dark:text-navy' : 'border border-gray-200 dark:border-gray-700 text-gray-600'}`}>{d} days</button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows ? <p className="text-sm text-gray-400">Loading…</p> : PATHS.map((p) => {
        const by = new Map(rows.filter((r) => r.path === p.key).map((r) => [r.step, r]));
        const total = by.get('WORKSPACE_CREATED')?.reached ?? 0;
        const live = by.get('FIRST_JOB_LIVE');
        return (
          <section key={p.key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-x-auto">
            <h2 className="px-5 pt-4 font-sora font-bold text-sm text-navy dark:text-white">{p.label}</h2>
            <p className="px-5 text-xs text-gray-500 font-jakarta">{total} workspaces · first job live within 5 minutes: {live ? `${live.within5} (${total ? Math.round((live.within5 / total) * 100) : 0}%)` : '0'}</p>
            <table className="w-full mt-3 text-sm font-jakarta">
              <thead><tr className="bg-gray-50 dark:bg-gray-800/50 text-left text-xs text-gray-500 uppercase">
                <th className="px-5 py-2">Step</th><th className="px-5 py-2">Reached</th><th className="px-5 py-2">Of all</th><th className="px-5 py-2">Median time</th>
              </tr></thead>
              <tbody>
                {STEPS.map((s) => {
                  const r = by.get(s.step);
                  return (
                    <tr key={s.step} className="border-t border-gray-50 dark:border-gray-800">
                      <td className="px-5 py-2 text-gray-800 dark:text-gray-200">{s.label}</td>
                      <td className="px-5 py-2 tabular-nums">{r?.reached ?? 0}</td>
                      <td className="px-5 py-2 tabular-nums">{total ? `${Math.round(((r?.reached ?? 0) / total) * 100)}%` : '—'}</td>
                      <td className="px-5 py-2 tabular-nums">{s.step === 'WORKSPACE_CREATED' ? '—' : fmt(r?.medianMinutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
