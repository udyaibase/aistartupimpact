'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ClipboardCheck, Download, Gavel, Handshake, Loader2, Mail, Send, UserCheck, Users } from 'lucide-react';
import { EXIT_REASONS } from '@/lib/employer/exit-reasons';
import { OUTCOME_REASONS } from '@/lib/employer/stages';
import type { Template } from './MoveDialog';
import { dateInput } from './MoveDialog';

/**
 * Candidate panel sections for the pipeline steps: sourcing (contact, interested, duplicates), assessment, the final
 * decision, offer to joining, and recording a withdrawal.
 */

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const ghost = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';
const box = 'rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 space-y-2.5';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

async function call<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: 'You seem to be offline.' } as T & { error?: string } };
  }
}

function Msg({ text, ok }: { text: string; ok?: boolean }) {
  if (!text) return null;
  return <p role={ok ? 'status' : 'alert'} className={`text-[13px] ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{text}</p>;
}

/** Internal reject reason picker, plus "email them" with the standard template. */
function RejectFields({ reason, setReason, email, setEmail, idp }: { reason: string; setReason: (v: string) => void; email: boolean; setEmail: (v: boolean) => void; idp: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${idp}-rr`} className={label}>Why <span className="font-normal text-gray-500">(only your team sees this)</span></label>
        <select id={`${idp}-rr`} value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
          <option value="">Choose a reason</option>
          {EXIT_REASONS.filter((r) => r.code !== 'OTHER').map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-gray-800 dark:text-gray-200"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> Send them the polite “not moving ahead” email</label>
    </>
  );
}

// ── Sourcing ───────────────────────────────────────────────────────

interface Duplicate { id: string; fullName: string; jobTitle: string; reason: string; linked: boolean }

export function SourcedSection({ id, state, channel, canMove, onChanged, onOpenOther }: {
  id: string; state: string; channel: string | null; canMove: boolean; onChanged: () => void; onOpenOther?: (id: string) => void;
}) {
  const [data, setData] = useState<{ preview: { to: string; subject: string; body: string; howAdded: string } | null; duplicates: Duplicate[] } | null>(null);
  const [writing, setWriting] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });

  const load = useCallback(async () => {
    const r = await call(`/api/employer/applications/${id}/sourced`);
    if (r.ok) { setData(r.data); if (r.data.preview) { setSubject(r.data.preview.subject); setBody(r.data.preview.body); } }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg({ text: '', ok: false });
    const r = await call(`/api/employer/applications/${id}/sourced`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.data.error || 'Couldn’t do that.', ok: false }); return; }
    setMsg({ text: action === 'contact' ? 'Sent. Stage emails start once they say they’re interested.' : action === 'interested' ? 'They’re in your pipeline as New.' : action === 'same-person' ? 'Linked as the same person.' : 'Removed.', ok: true });
    setWriting(false);
    void load(); onChanged();
  }

  const pending = state === 'ADDED' || state === 'CONTACTED';
  return (
    <section aria-labelledby="src-h" className={`${box} border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/10`}>
      <h3 id="src-h" className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><Users className="w-4 h-4" aria-hidden /> Sourced{channel ? ` via ${channel}` : ''}</h3>
      <p className="text-[13px] text-gray-700 dark:text-gray-300">
        {state === 'ADDED' && 'Added by your team; not contacted yet. They don’t count as an applicant until they’re interested.'}
        {state === 'CONTACTED' && 'Contacted. When they reply that they’re interested (or press the button in your email), they join the pipeline as New.'}
        {state === 'INTERESTED' && 'Interested: they’re in your pipeline like any applicant.'}
      </p>
      {canMove && pending && !writing && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setWriting(true)} disabled={!data?.preview}><Mail className="w-4 h-4" aria-hidden /> {state === 'ADDED' ? 'Contact' : 'Follow up'}</button>
          <button type="button" className={ghost} disabled={busy} onClick={() => act('interested')}><UserCheck className="w-4 h-4" aria-hidden /> They’re interested</button>
          <button type="button" className={`${ghost} text-red-700`} disabled={busy} onClick={() => { if (confirm('Remove this person and their details from the job?')) void act('remove'); }}>Remove</button>
        </div>
      )}
      {writing && data?.preview && (
        <form onSubmit={(e) => { e.preventDefault(); void act('contact', { subject, body }); }} className="space-y-2">
          <p className="text-[13px] text-gray-700 dark:text-gray-300">To <strong>{data.preview.to}</strong>, replies come to you.</p>
          <div><label htmlFor="src-subj" className={label}>Subject</label><input id="src-subj" value={subject} onChange={(e) => setSubject(e.target.value)} className={input} maxLength={150} /></div>
          <div><label htmlFor="src-body" className={label}>Message</label><textarea id="src-body" rows={7} value={body} onChange={(e) => setBody(e.target.value)} className={`${input} py-2`} maxLength={4000} /></div>
          <p className="text-xs text-gray-600 dark:text-gray-400 rounded-[8px] bg-white dark:bg-gray-900 px-2.5 py-2">Added at the end: “{data.preview.howAdded}”, an <strong>I’m interested</strong> button and a <strong>Remove my details</strong> link.</p>
          <div className="flex gap-2"><button type="submit" className={btn} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send</button><button type="button" className={ghost} onClick={() => setWriting(false)}>Cancel</button></div>
        </form>
      )}
      {!!data?.duplicates.length && (
        <div className="pt-1">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">Possibly the same person</p>
          <ul className="mt-1 space-y-1">
            {data.duplicates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <button type="button" onClick={() => onOpenOther?.(d.id)} className="font-medium underline">{d.fullName}</button>
                <span className="text-gray-600 dark:text-gray-400">{d.jobTitle} · {d.reason}</span>
                {d.linked ? <span className="text-green-700 text-xs font-semibold">Linked</span>
                  : canMove && <button type="button" className="text-xs font-semibold underline" disabled={busy} onClick={() => act('same-person', { otherId: d.id })}>Same person</button>}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-1">A shared phone number or agency contact can match two different people, so confirm first. Linked records keep their own applications and histories.</p>
        </div>
      )}
      <Msg {...msg} />
    </section>
  );
}

// ── Assessment ─────────────────────────────────────────────────────

interface AssessmentRow {
  id: string; kind: string; kindLabel: string; title: string | null; status: string; brief: string | null; url: string | null; dueAt: string | null; overdue: boolean;
  submittedAt: string | null; links: string[]; hasFile: boolean; submissionNote: string | null; questions: string[]; answers: string[];
  rubric: { name: string; weight: number }[]; rubricScores: Record<string, number> | null;
  score: number | null; maxScore: number | null; passMark: number | null; meetsPassMark: boolean | null; reviewNotes: string | null; reviewerEmail: string | null;
}
const SCALE = ['', 'Poor', 'Weak', 'Meets the bar', 'Strong', 'Exceptional'];
const HANDS_IN = ['TAKE_HOME', 'QUESTIONS', 'WORK_SAMPLE'];

export function AssessmentSection({ id, status, canMove, rejectTemplate, onChanged }: { id: string; status: string; canMove: boolean; rejectTemplate?: Template; onChanged: () => void }) {
  const [data, setData] = useState<{ config: { kind: string; title: string; deadlineDays: number } | null; assessments: AssessmentRow[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [sending, setSending] = useState(false);
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [score, setScore] = useState('');
  const [crit, setCrit] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState<'' | 'MOVE_ON' | 'NOT_MOVING_AHEAD'>('');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState(true);

  const load = useCallback(async () => { const r = await call(`/api/employer/applications/${id}/assessment`); if (r.ok) setData(r.data); }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg({ text: '', ok: false });
    const r = await call(`/api/employer/applications/${id}/assessment`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.data.error || 'Couldn’t do that.', ok: false }); return false; }
    setMsg({ text: ok, ok: true }); void load(); onChanged();
    return true;
  }

  if (!data || (!data.config && !data.assessments.length)) return null;
  const open = data.assessments.find((a) => a.status === 'SENT' || a.status === 'SUBMITTED') ?? null;
  const latest = data.assessments[0] ?? null;
  const canSend = canMove && data.config && !open && !['REJECTED', 'HIRED', 'OFFER'].includes(status);
  const reviewable = latest && latest.status !== 'CANCELLED' && (latest.status !== 'SENT' || !HANDS_IN.includes(latest.kind));
  const rubricDone = !!latest?.rubric.length && latest.rubric.every((c) => crit[c.name] >= 1);
  const rubricPreview = latest?.rubric.length && rubricDone
    ? Math.round((latest.rubric.reduce((n, c) => n + crit[c.name] * c.weight, 0) / latest.rubric.reduce((n, c) => n + 5 * c.weight, 0)) * (latest.maxScore ?? 10) * 10) / 10
    : null;

  return (
    <section aria-labelledby="as-h" className={box}>
      <div className="flex items-center gap-2">
        <h3 id="as-h" className="flex-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><ClipboardCheck className="w-4 h-4" aria-hidden /> {latest?.title ?? data.config?.title ?? 'Assessment'}</h3>
        {canSend && !sending && <button type="button" className={ghost} onClick={() => { setSending(true); setDays(String(data.config!.deadlineDays)); }}><Send className="w-4 h-4" aria-hidden /> {latest ? 'Send again' : 'Send'}</button>}
      </div>

      {sending && (
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await post({ action: 'send', ...(data.config!.kind === 'LIVE' ? {} : { deadlineDays: days, note }) }, data.config!.kind === 'LIVE' ? 'Added. Score it after the session.' : 'Sent. They have a private page and a deadline.')) { setSending(false); setNote(''); }
        }}>
          {data.config!.kind !== 'LIVE' && <div><label htmlFor="as-sd" className={label}>Days to finish</label><input id="as-sd" type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} className={`${input} w-28`} /></div>}
          {data.config!.kind === 'LIVE'
            ? <p className="text-[13px] text-gray-600 dark:text-gray-400">A live session has no page or email. Book it under Interviews, then score it here.</p>
            : <div><label htmlFor="as-sn" className={label}>Personal note <span className="font-normal text-gray-500">(optional, added to the email)</span></label><textarea id="as-sn" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={`${input} py-2`} /></div>}
          <div className="flex gap-2"><button type="submit" className={btn} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} {data.config!.kind === 'LIVE' ? 'Add' : 'Send'}</button><button type="button" className={ghost} onClick={() => setSending(false)}>Cancel</button></div>
        </form>
      )}

      {!latest && !sending && <p className="text-[13px] text-gray-500">Not sent yet.</p>}
      {latest && (
        <div className="text-[13px] space-y-1.5">
          <p className="text-gray-900 dark:text-white"><span className="font-semibold">{latest.kindLabel}</span> · {
            latest.status === 'SENT' ? (latest.overdue ? <span className="text-red-700 font-semibold">deadline passed {fmtTime(latest.dueAt)}</span> : latest.dueAt ? `due ${fmtTime(latest.dueAt)}` : 'score it after the session')
              : latest.status === 'SUBMITTED' ? `${latest.kind === 'EXTERNAL' ? 'finished' : 'handed in'} ${fmtTime(latest.submittedAt)}` : latest.status === 'REVIEWED' ? 'scored' : 'cancelled'}</p>
          {latest.links.map((l) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="block underline break-all">{l}</a>)}
          {latest.hasFile && <a href={`/api/employer/assessments/${latest.id}/file`} className="inline-flex items-center gap-1 underline"><Download className="w-3.5 h-3.5" aria-hidden /> Their file</a>}
          {latest.questions.length > 0 && latest.answers.length > 0 && (
            <details className="rounded-[8px] bg-gray-50 dark:bg-gray-900 p-2" open>
              <summary className="cursor-pointer font-semibold">Their answers</summary>
              <ol className="mt-1.5 space-y-2 list-decimal pl-5">
                {latest.questions.map((q, i) => <li key={i}><span className="text-gray-600 dark:text-gray-400">{q}</span><span className="block whitespace-pre-line text-gray-900 dark:text-white">{latest.answers[i] || '—'}</span></li>)}
              </ol>
            </details>
          )}
          {latest.submissionNote && <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">“{latest.submissionNote}”</p>}
          {latest.score != null && (
            <p>Score <strong>{latest.score}/{latest.maxScore}</strong>
              {latest.meetsPassMark != null && <span className={`ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded ${latest.meetsPassMark ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{latest.meetsPassMark ? 'Meets the pass mark' : 'Below the pass mark'}</span>}
              {latest.rubricScores && <span className="block text-xs text-gray-600 dark:text-gray-400">{latest.rubric.map((c) => `${c.name} ${latest.rubricScores![c.name]}/5`).join(' · ')}</span>}
              {latest.reviewNotes && <span className="block text-gray-700 dark:text-gray-300">{latest.reviewNotes}</span>}
            </p>
          )}
        </div>
      )}

      {canMove && latest && latest.status === 'SENT' && latest.kind !== 'LIVE' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ghost} disabled={busy} onClick={() => post({ action: 'extend', assessmentId: latest.id, days: 2 }, 'Deadline extended by 2 days.')}>Extend 2 days</button>
          <button type="button" className={ghost} disabled={busy} onClick={() => { if (confirm('Cancel this assessment? The candidate is told.')) void post({ action: 'cancel', assessmentId: latest.id, notify: true }, 'Cancelled.'); }}>Cancel</button>
        </div>
      )}
      {canMove && latest && (latest.status === 'SUBMITTED' || latest.status === 'REVIEWED') && latest.kind !== 'LIVE' && (
        <button type="button" className="text-xs font-semibold underline" disabled={busy} onClick={() => post({ action: 'resubmit', assessmentId: latest.id, days: 2 }, 'They can submit again within 2 days.')}>Allow a resubmission</button>
      )}

      {canMove && reviewable && status === 'ASSESSMENT' && (
        <form className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await post({
            action: 'review', assessmentId: latest!.id, ...(latest!.rubric.length ? { rubricScores: crit } : { score }), notes, decision: decision || undefined, rejectReason: reason || undefined,
            email: decision === 'NOT_MOVING_AHEAD' && email && rejectTemplate ? { subject: rejectTemplate.subject, body: rejectTemplate.body } : null,
          }, decision === 'MOVE_ON' ? 'Scored and moved to Interview.' : decision ? 'Scored. They’re not moving ahead.' : 'Score saved.');
          if (ok) { setScore(''); setCrit({}); setNotes(''); setDecision(''); }
        }}>
          {latest!.rubric.length ? (
            <fieldset className="space-y-1.5">
              <legend className={label}>Score each criterion</legend>
              {latest!.rubric.map((c) => (
                <div key={c.name} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="w-40 font-medium text-gray-900 dark:text-white">{c.name}{c.weight > 1 ? <span className="text-xs text-gray-500"> ×{c.weight}</span> : null}</span>
                  <span role="radiogroup" aria-label={c.name} className="inline-flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={crit[c.name] === n} title={SCALE[n]} onClick={() => setCrit((prev) => ({ ...prev, [c.name]: n }))}
                        className={`w-8 h-8 rounded-[8px] border text-xs font-semibold ${crit[c.name] === n ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700'}`}>{n}</button>
                    ))}
                  </span>
                </div>
              ))}
              <p className="text-xs text-gray-600">1 Poor · 3 Meets the bar · 5 Exceptional.{rubricPreview != null ? ` Total ${rubricPreview}/${latest!.maxScore}${latest!.passMark != null ? ` (pass mark ${latest!.passMark}: ${rubricPreview >= latest!.passMark ? 'meets it' : 'below it'})` : ''}.` : ` Score all ${latest!.rubric.length} to see the total.`}</p>
            </fieldset>
          ) : (
            <div><label htmlFor="as-score" className={label}>Score{latest!.maxScore ? ` out of ${latest!.maxScore}` : ''}</label><input id="as-score" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} className={`${input} w-32`} required />
              {latest!.passMark != null && score !== '' && <span className="ml-2 text-xs text-gray-600">Pass mark {latest!.passMark}: {Number(score) >= latest!.passMark ? 'meets it' : 'below it'}. It’s advice; you decide.</span>}</div>
          )}
          <div><label htmlFor="as-notes" className={label}>Notes</label><input id="as-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} maxLength={2000} /></div>
          <fieldset className="flex flex-wrap gap-3 text-[13px]">
            <legend className="sr-only">Decision</legend>
            {[['', 'Just save the score'], ['MOVE_ON', 'Move on to Interview'], ['NOT_MOVING_AHEAD', 'Not moving ahead']].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5"><input type="radio" name="as-dec" checked={decision === v} onChange={() => setDecision(v as typeof decision)} className="accent-[#A50F15]" /> {l}</label>
            ))}
          </fieldset>
          {decision === 'NOT_MOVING_AHEAD' && <RejectFields reason={reason} setReason={setReason} email={email} setEmail={setEmail} idp="as" />}
          <button type="submit" className={btn} disabled={busy || (latest!.rubric.length ? !rubricDone : score === '') || (decision === 'NOT_MOVING_AHEAD' && !reason)}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save</button>
        </form>
      )}
      <Msg {...msg} />
    </section>
  );
}

// ── Final decision ─────────────────────────────────────────────────

export function DecisionSection({ id, status, canDecide, lastRound, decisionOwner, rejectTemplate, onChanged }: {
  id: string; status: string; canDecide: boolean; lastRound: boolean; decisionOwner: string | null; rejectTemplate?: Template; onChanged: () => void;
}) {
  const [choice, setChoice] = useState<'' | 'PROCEED' | 'REJECT' | 'BACKUP'>('');
  const [reason, setReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [email, setEmail] = useState(true);
  const [holdDate, setHoldDate] = useState(dateInput(30));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });
  if (status !== 'DECISION' && !(status === 'INTERVIEW' && lastRound)) return null;
  if (!canDecide) {
    return status === 'DECISION'
      ? <p className={`${box} text-[13px] text-gray-700 dark:text-gray-300`}><Gavel className="inline w-4 h-4 mr-1" aria-hidden />Waiting for the final decision from <strong>{decisionOwner ?? 'a workspace owner'}</strong>.</p>
      : null;
  }
  async function decide(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg({ text: '', ok: false });
    const r = await call(`/api/employer/applications/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decision: choice, reason, rejectReason: rejectReason || undefined,
        email: choice === 'REJECT' && email && rejectTemplate ? { subject: rejectTemplate.subject, body: rejectTemplate.body } : null,
        holdUntil: choice === 'BACKUP' ? new Date(`${holdDate}T10:00:00+05:30`).toISOString() : undefined,
      }),
    });
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.data.error || 'Couldn’t record the decision.', ok: false }); return; }
    setMsg({ text: choice === 'PROCEED' ? 'Recorded. An offer draft is open below.' : choice === 'BACKUP' ? 'Kept as a backup (On hold).' : 'Recorded.', ok: true });
    setChoice(''); setReason('');
    onChanged();
  }
  return (
    <section aria-labelledby="dec-h" className={`${box} border-indigo-200 dark:border-indigo-900/50`}>
      <h3 id="dec-h" className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><Gavel className="w-4 h-4" aria-hidden /> {status === 'DECISION' ? 'Final decision' : 'Last round done? Decide now'}</h3>
      <form onSubmit={decide} className="space-y-2">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
          {([['PROCEED', 'Proceed to offer'], ['BACKUP', 'Keep as backup'], ['REJECT', 'Not moving ahead']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={choice === v} onClick={() => setChoice(v)}
              className={`min-h-[40px] px-3 rounded-[10px] border text-sm font-semibold ${choice === v ? 'border-gray-900 bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200'}`}>{l}</button>
          ))}
        </div>
        {choice && (
          <>
            <div><label htmlFor="dec-why" className={label}>Why, in one line <span className="font-normal text-gray-500">(kept with the decision)</span></label>
              <input id="dec-why" value={reason} onChange={(e) => setReason(e.target.value)} className={input} maxLength={300} placeholder={choice === 'PROCEED' ? 'Strongest system design; both rounds yes' : ''} /></div>
            {choice === 'REJECT' && <RejectFields reason={rejectReason} setReason={setRejectReason} email={email} setEmail={setEmail} idp="dec" />}
            {choice === 'BACKUP' && <div><label htmlFor="dec-hold" className={label}>Come back on</label><input id="dec-hold" type="date" min={dateInput(1)} max={dateInput(180)} value={holdDate} onChange={(e) => setHoldDate(e.target.value)} className={input} /></div>}
            <button type="submit" className={btn} disabled={busy || reason.trim().length < 3 || (choice === 'REJECT' && !rejectReason)}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Record decision</button>
          </>
        )}
      </form>
      <Msg {...msg} />
    </section>
  );
}

// ── Offer and joining ──────────────────────────────────────────────

interface OfferRow {
  id: string; status: string; state: string; currency: string; fixedAnnual: number | null; variableAnnual: number | null;
  revisions: { at: string; by: string; fixedAnnual: number | null; variableAnnual: number | null }[];
  joiningDate: string | null; answerBy: string | null; firmExpiry: boolean; notes: string | null; sentAt: string | null; declineReason: string | null;
}
interface OfferData {
  canSeeAmounts: boolean; canDecide: boolean;
  openings: { positions: number; joined: number; awaiting: number; available: number; outstanding: number };
  band: { min: number | null; max: number | null; currency: string } | null;
  hire: { joiningDate: string | null; joinedAt: string | null } | null;
  offers: OfferRow[];
}
const lakh = (n: number | null) => (n == null ? '—' : `${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`);
const STATE_LABEL: Record<string, string> = { DRAFT: 'Draft', SENT: 'Sent', OVERDUE: 'Response overdue', EXPIRED: 'Expired', ACCEPTED: 'Accepted', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn' };

export function OfferSection({ id, status, canMove, onChanged, onFilled }: { id: string; status: string; canMove: boolean; onChanged: () => void; onFilled?: (jobs: { id: string; title: string; positions: number; hired: number; closed?: boolean }[]) => void }) {
  const [d, setD] = useState<OfferData | null>(null);
  const [form, setForm] = useState({ fixed: '', variable: '', joiningDate: '', answerBy: '', firmExpiry: false, notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [declining, setDeclining] = useState(false);
  const [notJoining, setNotJoining] = useState(false);
  const [why, setWhy] = useState('');
  const [backups, setBackups] = useState<{ id: string; fullName: string; status: string }[] | null>(null);
  const [overcommit, setOvercommit] = useState('');

  const load = useCallback(async () => {
    const r = await call<OfferData>(`/api/employer/applications/${id}/offer`);
    if (!r.ok) return;
    setD(r.data);
    const o = r.data.offers.find((x) => ['DRAFT', 'SENT'].includes(x.status));
    if (o) setForm({ fixed: o.fixedAnnual ? String(o.fixedAnnual / 100000) : '', variable: o.variableAnnual ? String(o.variableAnnual / 100000) : '', joiningDate: o.joiningDate?.slice(0, 10) ?? '', answerBy: o.answerBy?.slice(0, 10) ?? '', firmExpiry: o.firmExpiry, notes: o.notes ?? '' });
  }, [id]);
  useEffect(() => { void load(); }, [load, status]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg({ text: '', ok: false });
    const r = await call(`/api/employer/applications/${id}/offer`, { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 409 && r.data.warning) setOvercommit(r.data.error || 'This would promise more people than there are openings.');
      else setMsg({ text: r.data.error || 'Couldn’t do that.', ok: false });
      return null;
    }
    setMsg({ text: ok, ok: true }); setOvercommit('');
    void load(); onChanged();
    return r.data;
  }
  const toRupees = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100000));

  if (!d || !['OFFER', 'HIRED'].includes(status)) return null;
  const open = d.offers.find((o) => ['DRAFT', 'SENT'].includes(o.status)) ?? null;
  const last = d.offers[0] ?? null;
  const o = d.openings;

  return (
    <section aria-labelledby="of-h" className={`${box} border-emerald-200 dark:border-emerald-900/50`}>
      <h3 id="of-h" className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><Handshake className="w-4 h-4" aria-hidden /> {status === 'HIRED' ? 'Joining' : 'Offer'}</h3>
      <p className="text-xs text-gray-600 dark:text-gray-400">{o.positions} opening{o.positions === 1 ? '' : 's'} · {o.joined} joined · {o.awaiting} awaiting joining · {o.available} available{o.outstanding ? ` · ${o.outstanding} offer${o.outstanding === 1 ? '' : 's'} out` : ''}</p>

      {status === 'HIRED' && d.hire && (
        d.hire.joinedAt
          ? <p className="text-[13px] text-green-800 dark:text-green-300 font-semibold"><Check className="inline w-4 h-4" aria-hidden /> Joined {fmt(d.hire.joinedAt)}</p>
          : (
            <div className="space-y-2">
              <p className="text-[13px] text-gray-900 dark:text-white">Accepted · <strong>awaiting joining</strong>{d.hire.joiningDate ? ` on ${fmt(d.hire.joiningDate)}` : ''}. This reserves an opening.</p>
              {canMove && !notJoining && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btn} disabled={busy} onClick={async () => { const r = await post({ action: 'joined' }, 'Marked as joined.'); if (r?.filledJobs?.length) onFilled?.(r.filledJobs); }}><Check className="w-4 h-4" aria-hidden /> They joined</button>
                  <button type="button" className={ghost} disabled={busy} onClick={() => setNotJoining(true)}>Did not join</button>
                </div>
              )}
              {notJoining && (
                <form onSubmit={async (e) => { e.preventDefault(); const r = await post({ action: 'not-joined', reason: why || 'Reason unknown' }, 'Recorded. The opening is free again.'); if (r) { setBackups(r.backups ?? []); setNotJoining(false); } }} className="space-y-2">
                  <label htmlFor="nj-why" className={label}>What happened <span className="font-normal text-gray-500">(optional)</span></label>
                  <select id="nj-why" value={why} onChange={(e) => setWhy(e.target.value)} className={input}>
                    {OUTCOME_REASONS.NOT_JOINED.map((r) => <option key={r} value={r === 'Reason unknown' ? '' : r}>{r}</option>)}
                  </select>
                  <div className="flex gap-2"><button type="submit" className={btn} disabled={busy}>Record</button><button type="button" className={ghost} onClick={() => setNotJoining(false)}>Cancel</button></div>
                </form>
              )}
            </div>
          )
      )}
      {backups && (
        <div className="rounded-[10px] bg-amber-50 dark:bg-amber-900/20 p-2.5 text-[13px]">
          <p className="font-semibold text-amber-900 dark:text-amber-200">{backups.length ? 'Backups for this job (you decide who to contact):' : 'No backups on this job yet.'}</p>
          <ul className="mt-1 list-disc pl-5">{backups.map((b) => <li key={b.id}>{b.fullName} · {b.status === 'ON_HOLD' ? 'On hold' : 'Final decision'}</li>)}</ul>
        </div>
      )}

      {status === 'OFFER' && (
        <>
          {last && <p className="text-[13px]">Status: <strong className={last.state === 'OVERDUE' || last.state === 'EXPIRED' ? 'text-red-700' : ''}>{STATE_LABEL[last.state] ?? last.state}</strong>{last.sentAt ? ` · sent ${fmt(last.sentAt)}` : ''}{last.answerBy ? ` · answer by ${fmt(last.answerBy)}${last.firmExpiry ? ' (firm)' : ''}` : ''}</p>}
          {!d.canSeeAmounts && <p className="text-[13px] text-gray-600 dark:text-gray-400">Offer amounts are visible to owners and the decision owner.</p>}
          {d.canSeeAmounts && open && canMove && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void post({ action: 'save', fixedAnnual: toRupees(form.fixed), variableAnnual: toRupees(form.variable), joiningDate: form.joiningDate || null, answerBy: form.answerBy || null, firmExpiry: form.firmExpiry, notes: form.notes }, 'Offer saved.'); }}>
              {d.band && <p className="text-xs text-gray-600">Band for this job: {lakh(d.band.min)} – {lakh(d.band.max)} a year</p>}
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="of-fx" className={label}>Fixed (₹ lakh / year)</label><input id="of-fx" inputMode="decimal" value={form.fixed} onChange={(e) => setForm({ ...form, fixed: e.target.value })} className={input} /></div>
                <div><label htmlFor="of-vr" className={label}>Variable (₹ lakh)</label><input id="of-vr" inputMode="decimal" value={form.variable} onChange={(e) => setForm({ ...form, variable: e.target.value })} className={input} /></div>
                <div><label htmlFor="of-jd" className={label}>Joining date</label><input id="of-jd" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className={input} /></div>
                <div><label htmlFor="of-ab" className={label}>Answer by</label><input id="of-ab" type="date" value={form.answerBy} onChange={(e) => setForm({ ...form, answerBy: e.target.value })} className={input} /></div>
              </div>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.firmExpiry} disabled={!form.answerBy} onChange={(e) => setForm({ ...form, firmExpiry: e.target.checked })} className="w-4 h-4 accent-[#A50F15]" /> The offer lapses on that date (we told the candidate)</label>
              <div><label htmlFor="of-nt" className={label}>Notes <span className="font-normal text-gray-500">(internal)</span></label><input id="of-nt" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} maxLength={2000} /></div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={ghost} disabled={busy}>Save</button>
                {open.status === 'DRAFT' && <button type="button" className={btn} disabled={busy || !form.fixed} onClick={async () => { await post({ action: 'save', fixedAnnual: toRupees(form.fixed), variableAnnual: toRupees(form.variable), joiningDate: form.joiningDate || null, answerBy: form.answerBy || null, firmExpiry: form.firmExpiry, notes: form.notes }, ''); await post({ action: 'send' }, 'Recorded as sent. Send it in your own words if you haven’t.'); }}><Send className="w-4 h-4" aria-hidden /> Mark as sent</button>}
              </div>
              {overcommit && (
                <div role="alert" className="rounded-[10px] bg-amber-50 dark:bg-amber-900/20 p-2.5 text-[13px] text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="inline w-4 h-4 mr-1" aria-hidden />{overcommit}
                  <div className="mt-2 flex gap-2"><button type="button" className={btn} onClick={() => post({ action: 'send', confirmOvercommit: true }, 'Recorded as sent.')}>Send anyway</button><button type="button" className={ghost} onClick={() => setOvercommit('')}>Not now</button></div>
                </div>
              )}
              {!!open.revisions.length && <p className="text-xs text-gray-500">Earlier: {open.revisions.map((r) => `${lakh(r.fixedAnnual)} (${fmt(r.at)})`).join(', ')}</p>}
            </form>
          )}
          {canMove && last && ['SENT', 'DRAFT', 'EXPIRED'].includes(last.status) && !declining && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={btn} disabled={busy} onClick={() => post({ action: 'answer', answer: 'ACCEPTED', joiningDate: form.joiningDate || undefined }, 'Accepted: awaiting joining. One opening is reserved.')}><Check className="w-4 h-4" aria-hidden /> They accepted</button>
              <button type="button" className={ghost} disabled={busy} onClick={() => setDeclining(true)}>They declined</button>
              {d.canSeeAmounts && open && <button type="button" className={ghost} disabled={busy} onClick={() => { if (confirm('Withdraw this offer?')) void post({ action: 'withdraw' }, 'Offer withdrawn.'); }}>Withdraw offer</button>}
            </div>
          )}
          {declining && (
            <form onSubmit={async (e) => { e.preventDefault(); if (await post({ action: 'answer', answer: 'DECLINED', reason: why || undefined }, 'Recorded as declined.')) setDeclining(false); }} className="space-y-2">
              <label htmlFor="of-why" className={label}>Their reason <span className="font-normal text-gray-500">(optional)</span></label>
              <select id="of-why" value={why} onChange={(e) => setWhy(e.target.value)} className={input}>
                <option value="">Not given</option>
                {OUTCOME_REASONS.OFFER_DECLINED.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <div className="flex gap-2"><button type="submit" className={btn} disabled={busy}>Record</button><button type="button" className={ghost} onClick={() => setDeclining(false)}>Cancel</button></div>
            </form>
          )}
        </>
      )}
      <Msg {...msg} />
    </section>
  );
}

// ── Withdrawn ──────────────────────────────────────────────────────

/** The team records that the candidate withdrew (no email goes out). */
export function WithdrawDialog({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [by, setBy] = useState<'CANDIDATE' | 'TEAM'>('CANDIDATE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <form role="dialog" aria-modal="true" aria-labelledby="wd-title" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        const r = await call(`/api/employer/applications/${id}/withdrawn`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined, reasonBy: by }) });
        setBusy(false);
        if (r.ok) onDone(); else setError(r.data.error || 'Couldn’t record it.');
      }} className="w-full max-w-md rounded-[16px] bg-white dark:bg-gray-900 p-5 shadow-xl font-jakarta space-y-3">
        <h2 id="wd-title" className="portal-dialog-title">{name} withdrew</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Their application ends as Withdrawn. No email is sent.</p>
        <div><label htmlFor="wd-r" className={label}>Reason <span className="font-normal text-gray-500">(optional)</span></label>
          <select id="wd-r" value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
            <option value="">Not given</option>{OUTCOME_REASONS.WITHDRAWN.map((r) => <option key={r} value={r}>{r}</option>)}
          </select></div>
        {reason && (
          <fieldset className="flex gap-4 text-[13px]"><legend className="sr-only">Who gave the reason</legend>
            <label className="flex items-center gap-1.5"><input type="radio" checked={by === 'CANDIDATE'} onChange={() => setBy('CANDIDATE')} className="accent-[#A50F15]" /> They told us</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={by === 'TEAM'} onChange={() => setBy('TEAM')} className="accent-[#A50F15]" /> Our guess</label>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={ghost}>Cancel</button><button type="submit" disabled={busy} className={btn}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Record</button></div>
      </form>
    </div>
  );
}
