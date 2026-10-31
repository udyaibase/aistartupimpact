'use client';

import { useState } from 'react';
import { Briefcase, Check, Loader2, Mail, RotateCw, Trash2, UserPlus } from 'lucide-react';
import type { TeamRow } from '@/lib/employer/team';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/employer/roles';
import type { EmployerRole } from '@/lib/employer-auth';

const ROLES: EmployerRole[] = ['RECRUITER', 'INTERVIEWER', 'OWNER'];
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const input = 'min-h-[44px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';

type JobOption = { id: string; title: string; status: string };

const accessLabel = (ids: string[]) => (ids.length === 0 ? 'All jobs' : ids.length === 1 ? '1 job' : `${ids.length} jobs`);

/** Interviewers see every job by default, or only the jobs picked here. */
function JobAccessDialog({ jobs, initial, onSave, onClose, saving }: {
  jobs: JobOption[]; initial: string[]; saving: boolean; onSave: (ids: string[]) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<'all' | 'some'>(initial.length ? 'some' : 'all');
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const invalid = mode === 'some' && picked.size === 0;
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ja-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-[14px] p-5 shadow-xl">
        <p id="ja-title" className="text-[15px] font-semibold text-gray-900 dark:text-white">Which jobs can they see?</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Interviewers only see candidates, resumes and notes for these jobs.</p>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Job access</legend>
          <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-white cursor-pointer">
            <input type="radio" name="ja-mode" checked={mode === 'all'} onChange={() => setMode('all')} className="w-4 h-4 accent-[#A50F15]" />
            All jobs, including ones you post later
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-900 dark:text-white cursor-pointer">
            <input type="radio" name="ja-mode" checked={mode === 'some'} onChange={() => setMode('some')} className="w-4 h-4 accent-[#A50F15]" />
            Only specific jobs
          </label>
        </fieldset>
        {mode === 'some' && (
          jobs.length === 0 ? <p className="mt-3 text-sm text-gray-500">You don’t have any jobs yet.</p> : (
            <ul className="mt-3 max-h-64 overflow-y-auto rounded-[10px] border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {jobs.map((j) => (
                <li key={j.id}>
                  <label className="flex items-center gap-3 px-3 min-h-[44px] text-sm text-gray-900 dark:text-white cursor-pointer">
                    <input type="checkbox" checked={picked.has(j.id)} onChange={() => toggle(j.id)} className="w-4 h-4 accent-[#A50F15]" />
                    <span className="flex-1 truncate">{j.title || 'Untitled draft'}</span>
                    {j.status !== 'OPEN' && <span className="text-xs text-gray-500">{j.status.charAt(0) + j.status.slice(1).toLowerCase()}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          <button type="button" disabled={invalid || saving} onClick={() => onSave(mode === 'all' ? [] : [...picked])} className="btn-brand gap-2 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamManager({ initialTeam, jobs, initialRequireApproval, canManage, me }: {
  initialTeam: TeamRow[];
  jobs: JobOption[];
  initialRequireApproval: boolean;
  canManage: boolean;
  me: { memberId: string | null; email: string };
}) {
  const [team, setTeam] = useState(initialTeam);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<EmployerRole>('RECRUITER');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<TeamRow | null>(null);
  const [outside, setOutside] = useState<string | null>(null);
  const [inviteJobs, setInviteJobs] = useState<string[]>([]);
  const [accessFor, setAccessFor] = useState<TeamRow | 'invite' | null>(null);
  const [requireApproval, setRequireApproval] = useState(initialRequireApproval);

  async function call(url: string, init: RequestInit, key: string, ok: string) {
    setBusy(key);
    setError('');
    setMessage('');
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
      const d = await res.json().catch(() => ({}));
      if (d.team) setTeam(d.team);
      if (res.ok) {
        setMessage(d.founderAccessRemains ? `${ok} They can still edit your startup in the founder portal; the founder can remove that on the founder Team page.` : ok);
        setBusy(null);
        return true;
      }
      setError(d.error || 'Something went wrong. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(null);
    return false;
  }

  async function invite(e?: React.FormEvent, confirmOutsideDomain = false) {
    e?.preventDefault();
    setBusy('invite');
    setError('');
    setMessage('');
    setOutside(null);
    try {
      const res = await fetch('/api/employer/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role, confirmOutsideDomain, jobIds: role === 'INTERVIEWER' ? inviteJobs : [] }) });
      const d = await res.json().catch(() => ({}));
      if (d.team) setTeam(d.team);
      if (res.ok) { setMessage(`Invite sent to ${email}.`); setEmail(''); setInviteJobs([]); }
      else if (d.code === 'outside_domain') setOutside(d.error);
      else setError(d.error || 'Something went wrong. Try again.');
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(null);
  }

  const active = team.filter((t) => t.status !== 'PENDING');
  const pending = team.filter((t) => t.status === 'PENDING');
  const isMe = (t: TeamRow) => (t.id ? t.id === me.memberId : !me.memberId && t.email.toLowerCase() === me.email.toLowerCase());

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Team</h1>
        <p className="portal-subtitle">Invite recruiters and interviewers to review candidates with you. Each person signs in with their own email.</p>
      </div>

      {canManage ? (
        <section aria-labelledby="invite-title" className={`${card} p-4 sm:p-5`}>
          <h2 id="invite-title" className="portal-section-title">Invite a teammate</h2>
          <form onSubmit={invite} className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end" noValidate>
            <div>
              <label htmlFor="inv-email" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Work email</label>
              <input id="inv-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@yourcompany.com" className={`${input} w-full`} />
            </div>
            <div>
              <label htmlFor="inv-role" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Role</label>
              <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as EmployerRole)} className={`${input} w-full`}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <button type="submit" disabled={busy === 'invite' || !email.trim()} className="btn-brand gap-2 disabled:opacity-50">
              {busy === 'invite' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />} Send invite
            </button>
          </form>
          <p className="mt-2 text-[13px] text-gray-600 dark:text-gray-400"><span className="font-semibold">{ROLE_LABEL[role]}:</span> {ROLE_DESCRIPTION[role]}</p>
          {role === 'INTERVIEWER' && (
            <button type="button" onClick={() => setAccessFor('invite')} className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-800 dark:text-gray-200 hover:underline">
              <Briefcase className="w-4 h-4 text-gray-500" aria-hidden /> Can see: {accessLabel(inviteJobs)} · Change
            </button>
          )}
          {outside && (
            <div role="alert" className="mt-3 rounded-[12px] border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-sm text-amber-900 dark:text-amber-200">{outside}</p>
              <p className="mt-1 text-[13px] text-amber-800/90 dark:text-amber-300/90">Agencies and freelancers are fine as Interviewers. Only invite an outside Recruiter you trust, since you’ll be notified but their jobs go live straight away.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => invite(undefined, true)} disabled={busy === 'invite'} className="min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">Invite anyway</button>
                <button type="button" onClick={() => { setRole('INTERVIEWER'); setOutside(null); }} className="min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">Make them an Interviewer</button>
                <button type="button" onClick={() => setOutside(null)} className="min-h-[40px] px-3 text-sm font-semibold text-gray-600 hover:underline">Change email</button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-gray-600 dark:text-gray-400 rounded-[12px] bg-gray-100 dark:bg-gray-900 px-4 py-3">Only owners can invite or remove teammates.</p>
      )}

      <div aria-live="polite">
        {message && <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400"><Check className="w-4 h-4" aria-hidden /> {message}</p>}
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>

      <section aria-labelledby="members-title" className={card}>
        <h2 id="members-title" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">Members · {active.length}</h2>
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {active.map((t) => (
            <li key={t.id ?? t.email} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0" aria-hidden>
                  {(t.name || t.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.name || t.email.split('@')[0]}{isMe(t) && <span className="font-normal text-gray-500"> (you)</span>}</p>
                  <p className="text-[13px] text-gray-500 truncate">{t.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                {t.id && canManage && !isMe(t) ? (
                  <>
                    <label htmlFor={`role-${t.id}`} className="sr-only">Role for {t.email}</label>
                    <select id={`role-${t.id}`} value={t.role} disabled={busy === t.id}
                      onChange={(e) => call(`/api/employer/team/${t.id}`, { method: 'PATCH', body: JSON.stringify({ role: e.target.value }) }, t.id!, `${t.email} is now ${ROLE_LABEL[e.target.value as EmployerRole]}.`)}
                      className={`${input} min-h-[40px]`}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    {t.role === 'INTERVIEWER' && (
                      <button type="button" onClick={() => setAccessFor(t)} disabled={busy === t.id} aria-label={`Jobs ${t.email} can see: ${accessLabel(t.jobIds)}`}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap">
                        <Briefcase className="w-4 h-4 text-gray-500" aria-hidden /> {accessLabel(t.jobIds)}
                      </button>
                    )}
                    <button type="button" onClick={() => setConfirmRemove(t)} aria-label={`Remove ${t.email}`}
                      className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {ROLE_LABEL[t.role]}{t.status === 'OWNER_ACCOUNT' ? ' · account' : ''}{t.role === 'INTERVIEWER' && t.jobIds.length > 0 ? ` · ${accessLabel(t.jobIds)}` : ''}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className={card}>
          <h2 id="pending-title" className="portal-section-title px-4 sm:px-5 pt-4 pb-2">Pending invites · {pending.length}</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {pending.map((t) => (
              <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Mail className="w-5 h-5 text-gray-400 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.email}</p>
                    <p className={`text-[13px] ${t.inviteExpired ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500'}`}>
                      {ROLE_LABEL[t.role]}{t.role === 'INTERVIEWER' && t.jobIds.length > 0 ? ` (${accessLabel(t.jobIds)})` : ''} · {t.inviteExpired ? 'Invite expired' : `Invited ${new Date(t.invitedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={busy === t.id}
                      onClick={() => call(`/api/employer/team/${t.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'resend' }) }, t.id!, `Invite re-sent to ${t.email}.`)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                      {busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RotateCw className="w-4 h-4" aria-hidden />} Resend
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(t)}
                      className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                      Cancel invite
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {canManage && (
        <section aria-labelledby="approval-title" className={`${card} p-4 sm:p-5`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={requireApproval} disabled={busy === 'approval'}
              onChange={async (e) => {
                const next = e.target.checked;
                setRequireApproval(next);
                const ok = await call('/api/employer/team', { method: 'PATCH', body: JSON.stringify({ requireJobApproval: next }) }, 'approval',
                  next ? 'Recruiters’ new jobs now wait for an owner to publish them.' : 'Recruiters can publish jobs directly again.');
                if (!ok) setRequireApproval(!next);
              }}
              className="mt-0.5 w-5 h-5 accent-[#A50F15]" />
            <span>
              <span id="approval-title" className="block text-sm font-semibold text-gray-900 dark:text-white">Owners approve new jobs from recruiters</span>
              <span className="block text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">When a recruiter publishes a new job, owners get an email and the job stays a draft until an owner publishes it. Jobs already live can still be paused, reopened and renewed.</span>
            </span>
          </label>
        </section>
      )}

      <section aria-labelledby="roles-title" className={`${card} p-4 sm:p-5`}>
        <h2 id="roles-title" className="portal-section-title">What each role can do</h2>
        <dl className="mt-3 space-y-2.5">
          {(['OWNER', 'RECRUITER', 'INTERVIEWER'] as EmployerRole[]).map((r) => (
            <div key={r}>
              <dt className="text-sm font-semibold text-gray-900 dark:text-white">{ROLE_LABEL[r]}</dt>
              <dd className="text-[13px] text-gray-600 dark:text-gray-400">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {accessFor && (
        <JobAccessDialog
          jobs={jobs}
          initial={accessFor === 'invite' ? inviteJobs : accessFor.jobIds}
          saving={accessFor !== 'invite' && busy === accessFor.id}
          onClose={() => setAccessFor(null)}
          onSave={async (ids) => {
            if (accessFor === 'invite') { setInviteJobs(ids); setAccessFor(null); return; }
            const t = accessFor;
            if (await call(`/api/employer/team/${t.id}`, { method: 'PATCH', body: JSON.stringify({ jobIds: ids }) }, t.id!, `${t.email} can now see ${accessLabel(ids).toLowerCase()}.`)) setAccessFor(null);
          }}
        />
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="rm-title">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRemove(null)} aria-hidden />
          <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[14px] p-5 shadow-xl">
            <p id="rm-title" className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {confirmRemove.status === 'PENDING' ? `Cancel the invite to ${confirmRemove.email}?` : `Remove ${confirmRemove.name || confirmRemove.email}?`}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {confirmRemove.status === 'PENDING' ? 'The invite link will stop working.' : 'They lose access right away. Their notes stay on candidates.'}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" autoFocus onClick={() => setConfirmRemove(null)} className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Keep</button>
              <button type="button" onClick={async () => { const t = confirmRemove; setConfirmRemove(null); await call(`/api/employer/team/${t.id}`, { method: 'DELETE' }, t.id!, t.status === 'PENDING' ? 'Invite cancelled.' : `${t.email} was removed.`); }}
                className="min-h-[44px] px-4 rounded-[10px] text-sm font-bold text-white bg-red-700 hover:bg-red-800">
                {confirmRemove.status === 'PENDING' ? 'Cancel invite' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
