'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, FileText, Github, Globe, Linkedin, Loader2, Mail, Phone, Send, X, Minus, CircleHelp, Flag,
} from 'lucide-react';
import type { ApplicationDetail } from '@/lib/employer/applications';
import AiReview, { type AiAccess } from '@/components/employer/pipeline/AiReview';

const SOURCE: Record<string, string> = {
  JOBS_PAGE: 'Udyaibase AI Jobs', STARTUP_PROFILE: 'Startup profile', GOOGLE: 'Google', WIDGET: 'Your website',
  CAREERS_PAGE: 'Careers page', REFERRAL: 'Referral', DIRECT: 'Direct link', OTHER: 'Other',
};
const STATUS: Record<string, string> = {
  APPLIED: 'New', REVIEWED: 'New', SHORTLISTED: 'Shortlisted', INTERVIEW: 'Interview', OFFER: 'Offer', HIRED: 'Hired', REJECTED: 'Rejected',
};
const REASON_STYLE: Record<string, string> = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  fail: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const REASON_LABEL: Record<string, string> = { pass: 'Meets', partial: 'Partly meets', fail: 'Does not meet', unknown: 'Not given' };
export const ACTIONS = [
  { status: 'SHORTLISTED', label: 'Shortlist', key: 's' },
  { status: 'INTERVIEW', label: 'Interview', key: 'i' },
  { status: 'OFFER', label: 'Offer', key: 'o' },
  { status: 'HIRED', label: 'Hired', key: 'h' },
  { status: 'REJECTED', label: 'Reject', key: 'r' },
] as const;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function CandidatePanel({
  id, onClose, onPrev, onNext, onMove, onSeen, onNoteAdded, refreshKey, teammates = [], aiAccess, onAiChanged,
}: {
  id: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Absent for roles that can't move candidates (e.g. interviewers). */
  onMove?: (status: string, name: string) => void;
  teammates?: { email: string; name: string }[];
  onSeen: (id: string) => void;
  onNoteAdded: (id: string) => void;
  refreshKey: number;
  aiAccess?: AiAccess;
  onAiChanged?: (id: string, ai: ApplicationDetail['ai']) => void;
}) {
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    setError('');
    fetch(`/api/employer/applications/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (ok) { setData(d.application); onSeen(id); if (reload) onAiChanged?.(id, d.application.ai); } else setError(d.error || 'Couldn’t load this candidate.');
      })
      .catch(() => alive && setError('You seem to be offline.'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey, reload]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  // Keyboard: S/I/O/H/R move, ←/→ (or K/J) navigate, Esc closes. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[aria-labelledby="move-title"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.key === 'ArrowRight' || e.key === 'j') && onNext) { e.preventDefault(); onNext(); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'k') && onPrev) { e.preventDefault(); onPrev(); return; }
      const action = ACTIONS.find((a) => a.key === e.key.toLowerCase());
      if (action && onMove && data && !data.withdrawnAt && data.status !== action.status) { e.preventDefault(); onMove(action.status, data.fullName); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, onClose, onNext, onPrev, onMove]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employer/applications/${id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: note, mentions }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && data) { setData({ ...data, notes: [...data.notes, d.note] }); setNote(''); setMentions([]); onNoteAdded(id); }
      else setError(d.error || 'Couldn’t save the note.');
    } catch { setError('You seem to be offline.'); }
    setSaving(false);
  }

  const skills = data?.job.skills ?? [];
  const matched = new Set(data?.matchedSkills ?? []);

  return (
    <>
      <div className="fixed inset-0 z-overlay bg-black/30 lg:bg-black/10" onClick={onClose} aria-hidden />
      <aside role="dialog" aria-modal="true" aria-labelledby="cand-title"
        className="fixed inset-y-0 right-0 z-modal w-full sm:w-[520px] bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-gray-800 flex flex-col font-jakarta shadow-xl">
        <header className="flex items-center gap-1 px-3 sm:px-4 min-h-[3.5rem] border-b border-gray-100 dark:border-gray-800 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" aria-hidden /></button>
          <span className="flex-1" />
          <button onClick={onPrev} disabled={!onPrev} aria-label="Previous candidate (←)" className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"><ArrowLeft className="w-5 h-5" aria-hidden /></button>
          <button onClick={onNext} disabled={!onNext} aria-label="Next candidate (→)" className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"><ArrowRight className="w-5 h-5" aria-hidden /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {!data ? (
            <div className="p-6">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" />}</div>
          ) : (
            <div className="p-4 sm:p-5 space-y-5">
              <div>
                <h2 id="cand-title" className="font-sora font-bold text-xl text-gray-900 dark:text-white">{data.fullName}</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {[data.currentTitle, data.currentCompany].filter(Boolean).join(' at ') || 'Applicant'} · for <span className="font-medium text-gray-800 dark:text-gray-200">{data.job.title}</span>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{data.withdrawnAt ? 'Withdrawn' : STATUS[data.status]}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">via {SOURCE[data.source] ?? data.source}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">Applied {fmtDate(data.appliedAt)}</span>
                </div>
              </div>

              {!data.withdrawnAt && onMove && (
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.filter((a) => a.status !== 'REJECTED' && a.status !== 'HIRED').map((a) => (
                    <button key={a.status} onClick={() => onMove(a.status, data.fullName)} disabled={data.status === a.status}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800">
                      {a.label} <kbd className="hidden sm:inline text-[10px] font-medium text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1">{a.key.toUpperCase()}</kbd>
                    </button>
                  ))}
                  <div className="relative">
                    <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                      More <ChevronDown className="w-4 h-4" aria-hidden />
                    </button>
                    {moreOpen && (
                      <div role="menu" className="absolute left-0 top-full mt-1 w-44 z-10 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg">
                        <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('HIRED', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Mark as hired</button>
                        <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('REVIEWED', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Move back to New</button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => onMove('REJECTED', data.fullName)} disabled={data.status === 'REJECTED'}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    Reject <kbd className="hidden sm:inline text-[10px] font-medium text-red-400 border border-red-200 dark:border-red-900 rounded px-1">R</kbd>
                  </button>
                </div>
              )}

              <section aria-label="Contact and resume" className="grid grid-cols-1 gap-1.5 text-sm">
                {data.hasResume && (
                  <a href={`/api/employer/applications/${data.id}/resume`} target="_blank" rel="noopener"
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold mb-1">
                    <FileText className="w-4 h-4" aria-hidden /> Open resume <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  </a>
                )}
                <a href={`mailto:${data.email}`} className="inline-flex items-center gap-2 min-h-[36px] text-gray-800 dark:text-gray-200 hover:text-[#A50F15] break-all"><Mail className="w-4 h-4 text-gray-400 shrink-0" aria-hidden /> {data.email}</a>
                {data.phone && <a href={`tel:${data.phone}`} className="inline-flex items-center gap-2 min-h-[36px] text-gray-800 dark:text-gray-200 hover:text-[#A50F15]"><Phone className="w-4 h-4 text-gray-400 shrink-0" aria-hidden /> {data.phone}</a>}
                <div className="flex flex-wrap gap-x-4">
                  {data.linkedinUrl && <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[36px] text-gray-800 dark:text-gray-200 hover:text-[#A50F15]"><Linkedin className="w-4 h-4 text-gray-400" aria-hidden /> LinkedIn</a>}
                  {data.githubUrl && <a href={data.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[36px] text-gray-800 dark:text-gray-200 hover:text-[#A50F15]"><Github className="w-4 h-4 text-gray-400" aria-hidden /> GitHub</a>}
                  {data.portfolioUrl && <a href={data.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[36px] text-gray-800 dark:text-gray-200 hover:text-[#A50F15]"><Globe className="w-4 h-4 text-gray-400" aria-hidden /> Portfolio</a>}
                </div>
              </section>

              <dl className="grid grid-cols-2 gap-2">
                {[
                  ['Experience', data.experienceYears != null ? `${data.experienceYears} yrs` : '—'],
                  ['Notice period', data.noticePeriodDays != null ? (data.noticePeriodDays === 0 ? 'Immediate' : `${data.noticePeriodDays} days`) : '—'],
                  ['Expected salary', data.expectedCtcLakh != null ? `₹${data.expectedCtcLakh} L` : '—'],
                  ['City', data.city || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[10px] bg-[#F7F7F9] dark:bg-gray-900 px-3 py-2">
                    <dt className="text-xs text-gray-500">{k}</dt>
                    <dd className="text-sm font-semibold text-gray-900 dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>

              {aiAccess && <AiReview id={id} ai={data.ai} access={aiAccess} onChanged={() => setReload((n) => n + 1)} />}

              {data.match.reasons.length > 0 && (
                <section aria-labelledby="mt">
                  <h3 id="mt" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Match <span className="font-normal text-gray-500">· {data.match.score}% · {data.match.band}</span>
                  </h3>
                  {data.match.knockedOut && (
                    <p className="mb-2 flex items-start gap-1.5 text-[13px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-[8px] px-2.5 py-2">
                      <Flag className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden /> Didn&apos;t meet a must-answer question. Worth a quick check before deciding.
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {data.match.reasons.map((r, i) => (
                      <li key={`${r.key}-${i}`} className="flex items-start gap-2 text-[13px]">
                        <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 ${REASON_STYLE[r.status]}`}>
                          {r.status === 'pass' ? <Check className="w-3 h-3" aria-hidden /> : r.status === 'unknown' ? <CircleHelp className="w-3 h-3" aria-hidden /> : r.status === 'fail' ? <X className="w-3 h-3" aria-hidden /> : <Minus className="w-3 h-3" aria-hidden />}
                          <span className="sr-only">{REASON_LABEL[r.status]}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="font-medium text-gray-900 dark:text-white">{r.label}</span>
                          <span className="block text-gray-600 dark:text-gray-400">{r.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-gray-500">Rules-based, not AI: compares your requirements with what the candidate entered. Use it to prioritise, not to decide.</p>
                </section>
              )}

              {skills.length > 0 && (
                <section aria-labelledby="sk">
                  <h3 id="sk" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Skills <span className="font-normal text-gray-500">· has {matched.size} of {skills.length}</span></h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <li key={s} className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-[8px] text-[13px] ${matched.has(s) ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'}`}>
                        {matched.has(s) ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Minus className="w-3.5 h-3.5" aria-hidden />} {s}
                        <span className="sr-only">{matched.has(s) ? ' (has)' : ' (not ticked)'}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-gray-500">Skills the candidate ticked as having. A plain match, not a score.</p>
                </section>
              )}

              {data.screeningAnswers.length > 0 && (
                <section aria-labelledby="qa">
                  <h3 id="qa" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Screening answers</h3>
                  <dl className="space-y-2.5">
                    {data.screeningAnswers.map((q) => (
                      <div key={q.id}>
                        <dt className="text-[13px] text-gray-600 dark:text-gray-400">{q.question}</dt>
                        <dd className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{q.type === 'yesno' ? (q.answer === 'yes' ? 'Yes' : q.answer === 'no' ? 'No' : '—') : q.answer || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {data.coverLetter && (
                <section aria-labelledby="cl">
                  <h3 id="cl" className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Note from the candidate</h3>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{data.coverLetter}</p>
                </section>
              )}

              <section aria-labelledby="notes">
                <h3 id="notes" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Team notes <span className="font-normal text-gray-500">· private, never shared with the candidate</span></h3>
                {data.notes.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {data.notes.map((n) => (
                      <li key={n.id} className="rounded-[10px] bg-[#F7F7F9] dark:bg-gray-900 px-3 py-2">
                        <p className="text-xs text-gray-500"><span className="font-semibold text-gray-700 dark:text-gray-300">{n.authorName}</span> · {fmtTime(n.createdAt)}</p>
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-line mt-0.5">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {teammates.length > 0 && (
                  <div className="mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {mentions.map((m) => {
                        const t = teammates.find((x) => x.email === m);
                        return (
                          <span key={m} className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full bg-[#A50F15]/10 text-[#A50F15] text-xs font-semibold">
                            @{t?.name ?? m}
                            <button type="button" onClick={() => setMentions((x) => x.filter((y) => y !== m))} aria-label={`Remove mention of ${t?.name ?? m}`} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#A50F15]/15"><X className="w-3 h-3" aria-hidden /></button>
                          </span>
                        );
                      })}
                      <div className="relative">
                        <button type="button" onClick={() => setMentionOpen((o) => !o)} aria-expanded={mentionOpen}
                          className="inline-flex items-center h-7 px-2.5 rounded-full border border-dashed border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:border-[#A50F15] hover:text-[#A50F15]">
                          @ Mention a teammate
                        </button>
                        {mentionOpen && (
                          <ul role="listbox" aria-label="Teammates" className="absolute left-0 bottom-full mb-1 w-64 max-h-56 overflow-y-auto z-10 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg">
                            {teammates.filter((t) => !mentions.includes(t.email)).map((t) => (
                              <li key={t.email} role="option" aria-selected={false}>
                                <button type="button" onClick={() => { setMentions((x) => [...x, t.email]); setMentionOpen(false); }}
                                  className="w-full text-left px-3 min-h-[40px] hover:bg-gray-50 dark:hover:bg-gray-800">
                                  <span className="block text-sm font-medium text-gray-900 dark:text-white">{t.name}</span>
                                  <span className="block text-xs text-gray-500 truncate">{t.email}</span>
                                </button>
                              </li>
                            ))}
                            {teammates.every((t) => mentions.includes(t.email)) && <li className="px-3 py-2 text-xs text-gray-500">Everyone is already mentioned.</li>}
                          </ul>
                        )}
                      </div>
                    </div>
                    {mentions.length > 0 && <p className="mt-1 text-xs text-gray-500">They’ll get an email with a link to this candidate.</p>}
                  </div>
                )}
                <form onSubmit={addNote} className="flex gap-2 items-end">
                  <label htmlFor="note" className="sr-only">Add a note</label>
                  <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} placeholder="Add a note for your team…"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(e); }}
                    className="flex-1 min-h-[44px] px-3 py-2.5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]" />
                  <button type="submit" disabled={saving || !note.trim()} aria-label="Save note" className="w-11 h-11 flex items-center justify-center rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-40">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                  </button>
                </form>
              </section>

              {data.events.length > 0 && (
                <section aria-labelledby="act">
                  <h3 id="act" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Activity</h3>
                  <ol className="space-y-2">
                    {data.events.map((e) => (
                      <li key={e.id} className="text-[13px] text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{e.fromStatus ? STATUS[e.fromStatus] : 'New'} → {STATUS[e.toStatus]}</span>
                        <span className="text-gray-500"> · {fmtTime(e.createdAt)}</span>
                        {e.emailStatus && (
                          <span className={`block text-xs ${e.emailStatus === 'FAILED' ? 'text-red-700' : 'text-gray-500'}`}>
                            {e.emailStatus === 'SCHEDULED' && e.scheduledFor ? `Email scheduled for ${fmtTime(e.scheduledFor)}` : e.emailStatus === 'SENT' ? `Emailed: “${e.emailSubject}”` : e.emailStatus === 'FAILED' ? 'Email failed to send' : 'Email queued'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
