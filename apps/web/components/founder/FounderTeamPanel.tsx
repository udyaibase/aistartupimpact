'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, UserPlus, X } from 'lucide-react';
import type { TeamRow } from '@/lib/employer/team';

const ROLE: Record<string, string> = { OWNER: 'Owner', RECRUITER: 'Recruiter', INTERVIEWER: 'Interviewer' };
const ROLE_HINT: Record<string, string> = {
  RECRUITER: 'Posts and edits jobs, moves candidates, emails them.',
  INTERVIEWER: 'Sees candidates for jobs and adds notes. Can’t post jobs.',
};
const inputCls = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand';

/** Invite HR from the founder portal. Same team as the employer portal's Team page. */
export default function FounderTeamPanel({ startupId, startupName }: { startupId: string; startupName: string }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<TeamRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'RECRUITER' | 'INTERVIEWER'>('RECRUITER');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [outside, setOutside] = useState<string | null>(null);

  useEffect(() => {
    if (!open || team) return;
    fetch(`/api/founder/hiring/team?startupId=${encodeURIComponent(startupId)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => (ok ? setTeam(d.team) : setError(d.error || 'Couldn’t load your team.')))
      .catch(() => setError('You seem to be offline.'));
  }, [open, team, startupId]);

  async function send(method: 'POST' | 'DELETE', body: Record<string, unknown>, key: string, ok: string) {
    setBusy(key);
    setError('');
    setNotice('');
    setOutside(null);
    try {
      const res = await fetch('/api/founder/hiring/team', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startupId, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (d.team) setTeam(d.team);
      if (res.ok) { setNotice(ok); if (method === 'POST') setEmail(''); }
      else if (d.code === 'outside_domain') setOutside(d.error);
      else setError(d.error || 'Something went wrong. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(null);
  }

  const invite = (confirmOutsideDomain = false) => send('POST', { email, role, confirmOutsideDomain }, 'invite', `Invite sent to ${email}. They’ll join ${startupName}’s hiring team.`);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between min-h-[40px] text-sm font-semibold text-gray-900 dark:text-white">
        <span className="inline-flex items-center gap-2"><UserPlus className="w-4 h-4" aria-hidden /> Hiring team</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-[13px] text-gray-600 dark:text-gray-400">Invite your HR or hiring managers. They sign in with an email code and work in your hiring workspace. You get an email whenever a teammate publishes a job.</p>

          <form onSubmit={(e) => { e.preventDefault(); invite(); }} className="grid gap-2 sm:grid-cols-[1fr_170px_auto]" noValidate>
            <label htmlFor={`ft-email-${startupId}`} className="sr-only">Work email</label>
            <input id={`ft-email-${startupId}`} type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hr@yourstartup.com" className={inputCls} />
            <label htmlFor={`ft-role-${startupId}`} className="sr-only">Role</label>
            <select id={`ft-role-${startupId}`} value={role} onChange={(e) => setRole(e.target.value as 'RECRUITER' | 'INTERVIEWER')} className={inputCls}>
              <option value="RECRUITER">Recruiter</option>
              <option value="INTERVIEWER">Interviewer</option>
            </select>
            <button type="submit" disabled={busy === 'invite' || !email.trim()} className="btn-brand gap-2 disabled:opacity-50">
              {busy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />} Invite
            </button>
          </form>
          <p className="text-[12.5px] text-gray-500">{ROLE_HINT[role]}</p>

          {outside && (
            <div role="alert" className="rounded-[12px] border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-sm text-amber-900 dark:text-amber-200">{outside}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => invite(true)} disabled={busy === 'invite'} className="min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">Invite anyway</button>
                <button type="button" onClick={() => { setRole('INTERVIEWER'); setOutside(null); }} className="min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">Make them an Interviewer</button>
              </div>
            </div>
          )}
          <div aria-live="polite">
            {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          </div>

          {team === null && !error ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Loading team" /> : team && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-[12px] border border-gray-200 dark:border-gray-800">
              {team.map((t) => (
                <li key={t.id ?? 'owner'} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name || t.email}</p>
                    <p className="text-[12.5px] text-gray-500 truncate">{t.name ? `${t.email} · ` : ''}{ROLE[t.role]}{t.status === 'PENDING' ? (t.inviteExpired ? ' · invite expired' : ' · invited') : ''}</p>
                  </div>
                  {t.id && (
                    <button type="button" onClick={() => send('DELETE', { memberId: t.id }, t.id!, `${t.email} was removed.`)} disabled={busy === t.id}
                      aria-label={`Remove ${t.email}`} className="w-10 h-10 grid place-items-center rounded-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-700 disabled:opacity-50">
                      {busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <X className="w-4 h-4" aria-hidden />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
