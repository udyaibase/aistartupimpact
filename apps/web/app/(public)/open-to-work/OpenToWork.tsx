'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, EyeOff, Flag, Loader2, Pause, Play, RefreshCw, Search, X } from 'lucide-react';
import ConfirmSheet from '@/components/ui/ConfirmSheet';
import NetworkCardView from '@/components/network/NetworkCardView';
import { MAX_SKILLS, NETWORK_CONSENT_TEXT, WORK_MODES, type IntroStatus, type OpenProfileInput, type WorkMode } from '@/lib/network/rules';

const card = 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-[14px] shadow-sm dark:shadow-none';
const input = 'w-full min-h-[44px] px-3 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white mb-1';
const primary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-400 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

interface Profile extends OpenProfileInput { visibleUntil: string; paused: boolean }
interface Request {
  id: string; status: IntroStatus; message: string; createdAt: string; applied: boolean; employerId: string;
  company: string; jobTitle: string; jobSlug: string;
}

const STATUS_TEXT: Record<IntroStatus, string> = {
  PENDING: 'Waiting for your reply', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired', REPORTED: 'Reported',
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, ...d } as { ok: boolean; error?: string; field?: string; applyUrl?: string };
}

export default function OpenToWork({ email, visibleDays, profile, draft, blocked, requests }: {
  email: string;
  visibleDays: number;
  profile: Profile | null;
  draft: OpenProfileInput | null;
  blocked: { id: string; name: string }[];
  requests: Request[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!profile);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [reporting, setReporting] = useState<Request | null>(null);
  const [reason, setReason] = useState('');

  async function act(key: string, body: unknown, done: string) {
    setBusy(key);
    try {
      const r = await post('/api/network/profile', body);
      if (r.ok) { setToast(done); router.refresh(); } else setToast(r.error || 'Something went wrong.');
    } catch { setToast('You seem to be offline.'); }
    setBusy('');
  }

  async function respond(r: Request, action: 'accept' | 'decline' | 'report', why?: string) {
    setBusy(`${action}:${r.id}`);
    try {
      const d = await post(`/api/network/requests/${r.id}`, { action, reason: why });
      if (d.ok && action === 'accept' && d.applyUrl) { router.push(d.applyUrl); return; }
      if (d.ok) { setToast(action === 'decline' ? `Declined. ${r.company} sees “Not interested”.` : `Reported. ${r.company} can’t send requests until our team reviews it.`); router.refresh(); }
      else setToast(d.error || 'Something went wrong.');
    } catch { setToast('You seem to be offline.'); }
    setBusy('');
  }

  async function block(employerId: string, blockedNow: boolean, name: string) {
    setBusy(`block:${employerId}`);
    try {
      const d = await post('/api/network/block', { employerId, blocked: blockedNow });
      if (d.ok) { setToast(blockedNow ? `${name} can’t see your profile now.` : `${name} can see your profile again.`); router.refresh(); }
      else setToast(d.error || 'Something went wrong.');
    } catch { setToast('You seem to be offline.'); }
    setBusy('');
  }

  const ended = profile ? new Date(profile.visibleUntil).getTime() < Date.now() : false;
  const pending = requests.filter((r) => r.status === 'PENDING');

  return (
    <div className="mt-6 space-y-6">
      {profile && !editing && (
        <section className={`${card} p-4 sm:p-5`} aria-labelledby="otw-status">
          <h2 id="otw-status" className="sr-only">Status</h2>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${profile.paused || ended ? 'bg-gray-400' : 'bg-green-500'}`} aria-hidden />
                {ended ? 'Ended' : profile.paused ? 'Paused: companies can’t see you' : 'Visible to companies'}
              </p>
              <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">
                {ended ? `Ended on ${fmt(profile.visibleUntil)}.` : `Until ${fmt(profile.visibleUntil)}.`} Requests go to {email}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => act('renew', { action: 'renew' }, `Visible for another ${visibleDays} days.`)} disabled={!!busy} className={secondary}>
                {busy === 'renew' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />} {ended ? 'Turn on again' : `Extend ${visibleDays} days`}
              </button>
              {!ended && (
                <button type="button" onClick={() => act('pause', { action: profile.paused ? 'resume' : 'pause' }, profile.paused ? 'Visible again.' : 'Paused. Companies can’t see you.')} disabled={!!busy} className={secondary}>
                  {busy === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : profile.paused ? <Play className="w-4 h-4" aria-hidden /> : <Pause className="w-4 h-4" aria-hidden />}
                  {profile.paused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button type="button" onClick={() => setEditing(true)} className={secondary}>Edit profile</button>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">What companies see</p>
            <NetworkCardView card={{ ...profile, currentCompany: profile.showCompany ? profile.currentCompany : null }} />
          </div>
        </section>
      )}

      {editing && (
        <ProfileForm
          initial={profile ?? draft!}
          isNew={!profile}
          visibleDays={visibleDays}
          onCancel={profile ? () => setEditing(false) : undefined}
          onSaved={(msg) => { setEditing(false); setToast(msg); router.refresh(); }}
        />
      )}

      {profile && (
        <section aria-labelledby="otw-requests">
          <h2 id="otw-requests" className="font-sora font-bold text-lg text-gray-900 dark:text-white">Requests {pending.length > 0 && <span className="text-[#A50F15]">({pending.length} new)</span>}</h2>
          {requests.length === 0 ? (
            <p className={`${card} mt-3 px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400`}>No requests yet. When a company asks you to apply, it shows here and we email you.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {requests.map((r) => (
                <li key={r.id} id={`req-${r.id}`} className={`${card} p-4 scroll-mt-24`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{r.company} <span className="font-normal text-gray-600 dark:text-gray-400">· {r.jobTitle}</span></p>
                    <span className="text-xs text-gray-500">{fmt(r.createdAt)} · {r.applied ? 'Applied' : STATUS_TEXT[r.status]}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{r.message}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(r.status === 'PENDING' || (r.status === 'ACCEPTED' && !r.applied)) && (
                      <button type="button" onClick={() => respond(r, 'accept')} disabled={!!busy} className={primary}>
                        {busy === `accept:${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
                        {r.status === 'ACCEPTED' ? 'Continue your application' : 'Accept and apply'}
                      </button>
                    )}
                    {r.status === 'PENDING' && (
                      <button type="button" onClick={() => respond(r, 'decline')} disabled={!!busy} className={secondary}>
                        {busy === `decline:${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <X className="w-4 h-4" aria-hidden />} Decline
                      </button>
                    )}
                    <a href={`/jobs/${r.jobSlug}`} target="_blank" rel="noopener" className={secondary}>See the job</a>
                    {!blocked.some((b) => b.id === r.employerId) && (
                      <button type="button" onClick={() => block(r.employerId, true, r.company)} disabled={!!busy} className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:underline">
                        <EyeOff className="w-4 h-4" aria-hidden /> Hide from {r.company}
                      </button>
                    )}
                    {r.status !== 'REPORTED' && (
                      <button type="button" onClick={() => { setReporting(r); setReason(''); }} disabled={!!busy} className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:underline">
                        <Flag className="w-4 h-4" aria-hidden /> Report
                      </button>
                    )}
                  </div>
                  {r.status === 'PENDING' && <p className="mt-2 text-xs text-gray-500">Accepting opens the application form. {r.company} gets your details only when you send it.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {profile && <HiddenCompanies blocked={blocked} busy={busy} onChange={block} />}

      {profile && (
        <section className="pt-2 border-t border-gray-200 dark:border-gray-800">
          <button type="button" onClick={() => setLeaving(true)} className="min-h-[44px] text-sm font-semibold text-red-700 dark:text-red-400 hover:underline">
            Leave and delete my profile
          </button>
        </section>
      )}

      <ConfirmSheet
        open={leaving}
        title="Leave Open to opportunities?"
        message="Your profile and every request sent to it are deleted. Companies can’t find you any more. Applications you already sent aren’t affected."
        confirmLabel="Leave and delete"
        danger
        onConfirm={async () => {
          const r = await post('/api/network/profile', { action: 'leave' });
          if (!r.ok) return r.error || 'Couldn’t leave. Try again.';
          setLeaving(false); setEditing(true); setToast('Done. Your profile is deleted.'); router.refresh();
        }}
        onClose={() => setLeaving(false)}
      />

      <ConfirmSheet
        open={!!reporting}
        title={`Report ${reporting?.company ?? ''}?`}
        message={(
          <div className="space-y-2">
            <p>Use this for spam, a misleading job, or a message that made you uncomfortable. {reporting?.company} sees it as “Not interested”, and can’t send anyone requests until our team reviews it.</p>
            <label htmlFor="otw-reason" className="block text-sm font-semibold">What happened? (optional)</label>
            <textarea id="otw-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={`${input} py-2`} />
          </div>
        )}
        confirmLabel="Report"
        danger
        onConfirm={async () => { if (reporting) await respond(reporting, 'report', reason); setReporting(null); }}
        onClose={() => setReporting(null)}
      />

      {toast && (
        <div role="status" className="fixed z-toast left-1/2 -translate-x-1/2 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl max-w-[92vw]">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

function ProfileForm({ initial, isNew, visibleDays, onCancel, onSaved }: {
  initial: OpenProfileInput; isNew: boolean; visibleDays: number; onCancel?: () => void; onSaved: (msg: string) => void;
}) {
  const [p, setP] = useState<OpenProfileInput>(initial);
  const [skillDraft, setSkillDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);
  const set = <K extends keyof OpenProfileInput>(k: K, v: OpenProfileInput[K]) => setP((x) => ({ ...x, [k]: v }));
  const addSkill = () => {
    const s = skillDraft.trim();
    if (s && !p.skills.includes(s) && p.skills.length < MAX_SKILLS) set('skills', [...p.skills, s]);
    setSkillDraft('');
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await post('/api/network/profile', { action: 'save', profile: p, consent });
      if (r.ok) onSaved(isNew ? `You’re visible to companies for ${visibleDays} days.` : 'Saved.');
      else setError({ field: r.field, text: r.error || 'Couldn’t save.' });
    } catch { setError({ text: 'You seem to be offline.' }); }
    setBusy(false);
  }

  const numberOrNull = (v: string) => (v === '' ? null : Number(v));

  return (
    <form onSubmit={save} className={`${card} p-4 sm:p-5 space-y-4`} noValidate>
      <div>
        <h2 className="font-sora font-bold text-lg text-gray-900 dark:text-white">{isNew ? 'Your anonymous profile' : 'Edit your profile'}</h2>
        {isNew && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Filled in from your latest application. Change anything you like.</p>}
      </div>

      <div>
        <label htmlFor="otw-headline" className={label}>Role you do</label>
        <input id="otw-headline" value={p.headline} maxLength={80} onChange={(e) => set('headline', e.target.value)} placeholder="e.g. ML Engineer" className={input}
          aria-invalid={error?.field === 'headline'} aria-describedby={error?.field === 'headline' ? 'otw-error' : undefined} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="otw-exp" className={label}>Years of experience</label>
          <input id="otw-exp" type="number" inputMode="numeric" min={0} max={50} value={p.experienceYears ?? ''} onChange={(e) => set('experienceYears', numberOrNull(e.target.value))} className={input} />
        </div>
        <div>
          <label htmlFor="otw-city" className={label}>City</label>
          <input id="otw-city" value={p.city ?? ''} maxLength={80} onChange={(e) => set('city', e.target.value || null)} placeholder="e.g. Bengaluru" className={input} />
        </div>
        <div>
          <label htmlFor="otw-mode" className={label}>Work preference</label>
          <select id="otw-mode" value={p.workMode} onChange={(e) => set('workMode', e.target.value as WorkMode)} className={input}>
            {(Object.keys(WORK_MODES) as WorkMode[]).map((k) => <option key={k} value={k}>{WORK_MODES[k]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="otw-notice" className={label}>Notice period (days)</label>
          <input id="otw-notice" type="number" inputMode="numeric" min={0} max={365} value={p.noticePeriodDays ?? ''} onChange={(e) => set('noticePeriodDays', numberOrNull(e.target.value))} placeholder="0 if you can join now" className={input} />
        </div>
      </div>

      <div>
        <label htmlFor="otw-skill" className={label}>Skills <span className="font-normal text-gray-500">({p.skills.length}/{MAX_SKILLS})</span></label>
        {p.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {p.skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-xs font-medium pl-2 pr-1 py-0.5 rounded-full border border-gray-300 dark:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                {s}
                <button type="button" onClick={() => set('skills', p.skills.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-3 h-3" aria-hidden /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input id="otw-skill" value={skillDraft} maxLength={40} onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } }}
            placeholder="Type a skill and press Enter" className={input} disabled={p.skills.length >= MAX_SKILLS} />
          <button type="button" onClick={addSkill} disabled={!skillDraft.trim()} className={secondary}>Add</button>
        </div>
      </div>

      <div>
        <label htmlFor="otw-company" className={label}>Current company <span className="font-normal text-gray-500">(optional)</span></label>
        <input id="otw-company" value={p.currentCompany ?? ''} maxLength={100} onChange={(e) => set('currentCompany', e.target.value || null)} className={input} />
        <label className="mt-2 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={p.showCompany} disabled={!p.currentCompany} onChange={(e) => set('showCompany', e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#A50F15]" />
          <span>Show it to companies. Either way, your current company can’t see your profile.</span>
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Preview: what companies see</p>
        <NetworkCardView card={{ ...p, currentCompany: p.showCompany ? p.currentCompany : null }} />
      </div>

      {isNew && (
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[#A50F15]"
            aria-invalid={error?.field === 'consent'} />
          <span>{NETWORK_CONSENT_TEXT}</span>
        </label>
      )}

      {error && <p id="otw-error" role="alert" className="text-sm text-red-700 dark:text-red-400">{error.text}</p>}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className={secondary}>Cancel</button>}
        <button type="submit" disabled={busy || (isNew && !consent)} className={primary}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {isNew ? 'Make me visible' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function HiddenCompanies({ blocked, busy, onChange }: {
  blocked: { id: string; name: string }[]; busy: string; onChange: (id: string, blocked: boolean, name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/network/companies?${new URLSearchParams({ q: q.trim() })}`, { signal: ctl.signal })
        .then((r) => r.json()).then((d) => setFound(d.companies ?? [])).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  return (
    <section aria-labelledby="otw-hidden">
      <h2 id="otw-hidden" className="font-sora font-bold text-lg text-gray-900 dark:text-white">Hidden from</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Your current employer is hidden automatically when your email or current company matches it. Add any others here.</p>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
        <label htmlFor="otw-hide" className="sr-only">Find a company to hide from</label>
        <input id="otw-hide" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a company" className={`${input} pl-9`} />
      </div>
      {found.length > 0 && (
        <ul className={`${card} mt-2 divide-y divide-gray-100 dark:divide-gray-800`}>
          {found.map((c) => {
            const hidden = blocked.some((b) => b.id === c.id);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-gray-900 dark:text-white truncate">{c.name}</span>
                {hidden ? <span className="text-xs text-gray-500">Hidden</span> : (
                  <button type="button" disabled={!!busy} onClick={() => { onChange(c.id, true, c.name); setQ(''); }} className="min-h-[40px] px-3 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:underline">Hide</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {blocked.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {blocked.map((b) => (
            <li key={b.id} className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full border border-gray-400 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200">
              {b.name}
              <button type="button" disabled={!!busy} onClick={() => onChange(b.id, false, b.name)} aria-label={`Show to ${b.name} again`} className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-3.5 h-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
