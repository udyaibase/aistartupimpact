'use client';

import { yearsText } from '@/lib/jobs/format';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Download, ExternalLink, FileText, Globe, Loader2, Mail, Phone, Send, X, Minus, CircleHelp, Flag,
  PauseCircle, Briefcase, CalendarDays, Sparkles, Target, UserCheck,
} from 'lucide-react';
import { GitHubIcon, LinkedInIcon, WhatsAppIcon } from '@/components/ui/BrandIcons';
import { exitReasonLabel } from '@/lib/employer/exit-reasons';
import { whatsappLink } from '@/lib/employer/whatsapp';
import { InterviewsSection, RoundPicker, ScorecardsSection } from '@/components/employer/pipeline/HiringSections';
import { AssessmentSection, DecisionSection, OfferSection, SourcedSection, WithdrawDialog } from '@/components/employer/pipeline/StageSections';
import { CHANNEL_LABEL, OUTCOME_LABEL, STATUS_LABEL, outcomeOf } from '@/lib/employer/stages';
import type { Template } from '@/components/employer/pipeline/MoveDialog';
import type { ApplicationDetail } from '@/lib/employer/applications';
import AiReview, { type AiAccess } from '@/components/employer/pipeline/AiReview';
import ResumeViewer from '@/components/employer/pipeline/ResumeViewer';

const SOURCE: Record<string, string> = {
  JOBS_PAGE: 'Udyaibase AI Jobs', STARTUP_PROFILE: 'Startup profile', GOOGLE: 'Google', WIDGET: 'Your website',
  CAREERS_PAGE: 'Careers page', REFERRAL: 'Referral', DIRECT: 'Direct link', OTHER: 'Other', IMPORTED: 'Imported', SOURCED: 'Sourced', NETWORK: 'Open to opportunities',
};
const STATUS: Record<string, string> = STATUS_LABEL;
/** One look for every section of the panel: a bordered card that stands out in light and dark mode. */
const BOX = 'rounded-[12px] border border-gray-300 dark:border-gray-700/80 bg-white dark:bg-gray-900/60 p-3.5 shadow-sm dark:shadow-none';
const BOX_TITLE = 'text-sm font-semibold text-gray-900 dark:text-white mb-2.5';
/** Match tile colour by band. */
const BAND_TILE: Record<string, string> = {
  Strong: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  Good: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  Fair: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  Low: 'border-gray-300 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200',
};
const AI_REC_LABEL: Record<string, string> = { shortlist: 'Suggests shortlist', consider: 'Worth a look', weak: 'Weak fit' };
/** "today", "yesterday", "5 days ago", "3 weeks ago". */
function ago(iso: string) {
  const d = Math.floor((Date.now() - +new Date(iso)) / 864e5);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** Colour of an activity entry by where the candidate moved: hired green, rejected red, offer amber, the rest neutral. */
function activityTone(to: string) {
  if (to === 'HIRED') return { dot: 'bg-emerald-500', pill: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' };
  if (to === 'REJECTED' || to === 'WITHDRAWN') return { dot: 'bg-red-500', pill: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-300' };
  if (to === 'OFFER' || to === 'DECISION') return { dot: 'bg-amber-500', pill: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
  if (to === 'INTERVIEW' || to === 'ASSESSMENT' || to === 'SHORTLISTED') return { dot: 'bg-sky-500', pill: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300' };
  return { dot: 'bg-gray-400', pill: 'border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200' };
}
const REASON_STYLE: Record<string, string> = {
  pass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  fail: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const REASON_LABEL: Record<string, string> = { pass: 'Meets', partial: 'Partly meets', fail: 'Does not meet', unknown: 'Not given' };
export const ACTIONS = [
  { status: 'SHORTLISTED', label: 'Screening', key: 's' },
  { status: 'ASSESSMENT', label: 'Assessment', key: 'a' },
  { status: 'INTERVIEW', label: 'Interview', key: 'i' },
  { status: 'DECISION', label: 'Final decision', key: 'd' },
  { status: 'OFFER', label: 'Offer', key: 'o' },
  { status: 'HIRED', label: 'Hired', key: 'h' },
  { status: 'REJECTED', label: 'Not moving ahead', key: 'r' },
] as const;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function CandidatePanel({
  id, onClose, onPrev, onNext, onMove, onSeen, onNoteAdded, refreshKey, teammates = [], aiAccess, onAiChanged,
  onOpenOther, moveTargets = [], onMovedToJob, company = '', onStatus, rejectTemplate, onFilled, onBoardChanged, reviewBar,
}: {
  /** "Review new" mode: the decision bar pinned above the profile. */
  reviewBar?: React.ReactNode;
  /** The standard "not moving ahead" email, for decisions and assessment reviews. */
  rejectTemplate?: Template;
  /** Someone joined and that filled the job (it closed itself). */
  onFilled?: (jobs: { id: string; title: string; positions: number; hired: number; closed?: boolean }[]) => void;
  /** A sourced person was contacted, became interested or was removed. */
  /** Something on the card changed (stage step, next action, score): refresh the board behind the panel. */
  onBoardChanged?: () => void;
  /** The candidate's stage as loaded (it can change from here, e.g. scheduling). */
  onStatus?: (id: string, status: string, interviewRound: string | null, extra?: { outcome: string | null; joinedAt: string | null; joiningDate: string | null; sourcedState: string | null; holdFromStatus: string | null }) => void;
  /** Company name for the WhatsApp message. */
  company?: string;
  /** Open one of this person's other applications. */
  onOpenOther?: (id: string) => void;
  /** Roles a general application can be moved into; empty for people who can't move candidates. */
  moveTargets?: { id: string; title: string }[];
  onMovedToJob?: (id: string, job: { id: string; title: string }) => void;
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
  const changed = () => { setReload((n) => n + 1); onBoardChanged?.(); };
  const [data, setData] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Resume beside the panel. Stays open while moving to the next candidate; remembered on this device.
  const [resumeOpen, setResumeOpen] = useState(false);
  useEffect(() => {
    let pref: string | null = null;
    try { pref = localStorage.getItem('udy:resume-viewer'); } catch {}
    // Default: open on wide screens, where it sits beside the panel; closed on phones, where it would cover it.
    setResumeOpen(pref ? pref === 'open' : window.matchMedia('(min-width: 1024px)').matches);
  }, []);
  const toggleResume = (open: boolean) => {
    setResumeOpen(open);
    try { localStorage.setItem('udy:resume-viewer', open ? 'open' : 'closed'); } catch {}
  };
  const [targetJob, setTargetJob] = useState('');
  const [movingJob, setMovingJob] = useState(false);
  const [jobMsg, setJobMsg] = useState('');

  async function moveToJob() {
    if (!targetJob || !data) return;
    setMovingJob(true); setJobMsg('');
    try {
      const res = await fetch(`/api/employer/applications/${id}/job`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: targetJob }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setTargetJob('');
        onMovedToJob?.(id, d.job);
        setReload((r) => r + 1);
      } else setJobMsg(d.error || 'Couldn’t move this candidate.');
    } catch { setJobMsg('You seem to be offline.'); }
    setMovingJob(false);
  }

  useEffect(() => {
    let alive = true;
    setError('');
    fetch(`/api/employer/applications/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive) return;
        if (ok) { setData(d.application); onSeen(id); onStatus?.(id, d.application.status, d.application.interviewRound, { outcome: d.application.outcome, joinedAt: d.application.joinedAt, joiningDate: d.application.joiningDate, sourcedState: d.application.sourcedState, holdFromStatus: d.application.holdFromStatus }); if (reload) onAiChanged?.(id, d.application.ai); } else setError(d.error || 'Couldn’t load this candidate.');
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
      if (document.querySelector('[aria-labelledby="move-title"], [aria-labelledby="filled-title"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.key === 'ArrowRight' || e.key === 'j') && onNext) { e.preventDefault(); onNext(); return; }
      if ((e.key === 'ArrowLeft' || e.key === 'k') && onPrev) { e.preventDefault(); onPrev(); return; }
      const action = ACTIONS.find((a) => a.key === e.key.toLowerCase());
      if (action && action.status === 'ASSESSMENT' && !data?.job.hasAssessment) return;
      if (action && onMove && data && !data.withdrawnAt && !sourcedPending && data.status !== action.status) { e.preventDefault(); onMove(action.status, data.fullName); }
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
  const sourcedPending = data?.sourcedState === 'ADDED' || data?.sourcedState === 'CONTACTED';
  const outcome = data ? outcomeOf(data.status, data.outcome) : null;
  const statusText = data ? (data.withdrawnAt ? 'Withdrawn' : sourcedPending ? (data.sourcedState === 'ADDED' ? 'Sourced · not contacted' : 'Sourced · contacted') : outcome ? OUTCOME_LABEL[outcome] : data.status === 'HIRED' ? (data.joinedAt ? 'Joined' : 'Awaiting joining') : STATUS[data.status]) : '';
  const lastRound = !!data && data.status === 'INTERVIEW' && (data.interviewRound ?? data.job.rounds[0]) === data.job.rounds[data.job.rounds.length - 1];
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
          {reviewBar}
          {!data ? (
            <div className="p-6">{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading" />}</div>
          ) : (
            <div className="p-4 sm:p-5 pb-8 sm:pb-10 space-y-5">
              <header className={`${BOX} p-4`}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-[#A50F15] to-[#6E0A0E] text-white font-sora font-bold text-base inline-flex items-center justify-center shadow-sm" aria-hidden>
                    {data.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id="cand-title" className="font-sora font-bold text-xl leading-tight text-gray-900 dark:text-white break-words">{data.fullName}</h2>
                    <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                      {[data.currentTitle, data.currentCompany].filter(Boolean).join(' at ') || 'Applicant'}
                      {data.city && <span className="text-gray-600 dark:text-gray-400"> · {data.city}</span>}
                    </p>
                  </div>
                </div>

                <p className="mt-3 flex items-center gap-2 rounded-[10px] bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/70 px-3 py-2 text-sm">
                  <Briefcase className="w-4 h-4 shrink-0 text-gray-600 dark:text-gray-400" aria-hidden />
                  <span className="text-gray-600 dark:text-gray-400 shrink-0">{data.sourcedState ? 'Sourced for' : 'Applying for'}</span>
                  <span className="font-semibold text-gray-900 dark:text-white truncate">{data.job.title}</span>
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${data.withdrawnAt ? activityTone('WITHDRAWN').pill : activityTone(outcome ? 'REJECTED' : data.status).pill}`}>{statusText}</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs ${data.referredBy ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 font-semibold' : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
                    {data.referredBy ? <UserCheck className="w-3.5 h-3.5" aria-hidden /> : <Globe className="w-3.5 h-3.5" aria-hidden />}
                    {data.referredBy ? `Referred by ${data.referredBy}` : `via ${CHANNEL_LABEL[data.channel] ?? data.channel}`}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 text-xs" title={fmtDate(data.appliedAt)}>
                    <CalendarDays className="w-3.5 h-3.5" aria-hidden /> {data.sourcedState ? 'Added' : 'Applied'} {fmtDate(data.appliedAt)} · {ago(data.appliedAt)}
                  </span>
                </div>

                {(data.match.reasons.length > 0 || (data.ai?.status === 'DONE' && data.ai.fitScore != null)) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {data.match.reasons.length > 0 && (
                      <button type="button" onClick={() => document.getElementById('mt')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className={`text-left rounded-[10px] border px-3 py-2 hover:brightness-[0.98] ${BAND_TILE[data.match.band]}`}>
                        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-90"><Target className="w-3.5 h-3.5" aria-hidden /> Match</span>
                        <span className="block font-sora text-lg font-bold tabular-nums leading-tight">{data.match.score}%</span>
                        <span className="block text-xs">{data.match.band} · rules-based</span>
                      </button>
                    )}
                    {data.ai?.status === 'DONE' && data.ai.fitScore != null && (
                      <button type="button" onClick={() => document.getElementById('ai')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="text-left rounded-[10px] border border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/40 dark:text-violet-200 px-3 py-2 hover:brightness-[0.98]">
                        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-90"><Sparkles className="w-3.5 h-3.5" aria-hidden /> AI fit</span>
                        <span className="block font-sora text-lg font-bold tabular-nums leading-tight">{data.ai.fitScore}<span className="text-xs font-semibold opacity-80">/100</span></span>
                        <span className="block text-xs">{AI_REC_LABEL[data.ai.recommendation ?? 'weak'] ?? 'Weak fit'}{data.ai.stale ? ' · job changed' : ''}</span>
                      </button>
                    )}
                  </div>
                )}
              </header>

              {data.mismatches.length > 0 && (
                <section aria-label="Answers to check" className="rounded-[12px] border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3.5">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200"><Flag className="w-4 h-4" aria-hidden /> Answer doesn’t match the resume: check</p>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-amber-900 dark:text-amber-200">{data.mismatches.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Resumes often leave things out, so ask before deciding. This doesn’t change any score.</p>
                </section>
              )}

              {!data.withdrawnAt && (data.status === 'ON_HOLD' || (data.status === 'REJECTED' && (data.exitReason || data.exitNote || (outcome && outcome !== 'REJECTED')))) && (
                <p className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-[13px] ${data.status === 'ON_HOLD' ? 'bg-sky-50 text-sky-900 dark:bg-sky-900/20 dark:text-sky-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'}`}>
                  {data.status === 'ON_HOLD' && <PauseCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
                  <span>
                    {data.status === 'ON_HOLD'
                      ? <>On hold{data.onHoldUntil ? <> until <strong>{fmtDate(data.onHoldUntil)}</strong></> : null}</>
                      : <>{OUTCOME_LABEL[outcome ?? 'REJECTED']}{data.exitReason ? `: ${exitReasonLabel(data.exitReason)}` : ''}{data.outcomeReasonBy ? <span className="block text-xs opacity-80">Reason given by {data.outcomeReasonBy === 'CANDIDATE' ? 'the candidate' : 'your team'}</span> : null}</>}
                    {data.exitNote && <span className="block text-xs opacity-80">“{data.exitNote}”</span>}
                    <span className="block text-xs opacity-70">Only your team sees this.</span>
                  </span>
                </p>
              )}

              {data.sourcedState && (
                <SourcedSection id={data.id} state={data.sourcedState} channel={data.sourcedChannel} canMove={!!onMove} onOpenOther={onOpenOther}
                  onChanged={changed} />
              )}

              {!data.withdrawnAt && onMove && data.status === 'ON_HOLD' && data.holdFromStatus && (
                <button type="button" onClick={() => onMove(data.holdFromStatus!, data.fullName)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">
                  <PauseCircle className="w-4 h-4" aria-hidden /> Resume at {STATUS[data.holdFromStatus]}
                </button>
              )}

              {!data.withdrawnAt && onMove && !sourcedPending && (
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.filter((a) => a.status !== 'REJECTED' && a.status !== 'HIRED' && a.status !== 'OFFER' && (a.status !== 'ASSESSMENT' || data.job.hasAssessment)).map((a) => (
                    <button key={a.status} onClick={() => onMove(a.status, data.fullName)} disabled={data.status === a.status}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800">
                      {a.label} <kbd className="hidden sm:inline text-[11px] font-medium text-gray-400 border border-gray-200 dark:border-gray-700 rounded px-1">{a.key.toUpperCase()}</kbd>
                    </button>
                  ))}
                  <div className="relative">
                    <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                      More <ChevronDown className="w-4 h-4" aria-hidden />
                    </button>
                    {moreOpen && (
                      <div role="menu" className="absolute left-0 top-full mt-1 w-44 z-10 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[12px] shadow-lg">
                        <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('OFFER', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Skip to Offer</button>
                        <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('HIRED', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Mark as accepted</button>
                        {data.status !== 'REJECTED' && <button role="menuitem" onClick={() => { setMoreOpen(false); setWithdrawing(true); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Candidate withdrew</button>}
                        {data.status !== 'ON_HOLD' && <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('ON_HOLD', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Put on hold</button>}
                        <button role="menuitem" onClick={() => { setMoreOpen(false); onMove('REVIEWED', data.fullName); }} className="w-full text-left px-3.5 min-h-[40px] text-sm hover:bg-gray-50 dark:hover:bg-gray-800">Move back to New</button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => onMove('REJECTED', data.fullName)} disabled={data.status === 'REJECTED'}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    Not moving ahead <kbd className="hidden sm:inline text-[11px] font-medium text-red-400 border border-red-200 dark:border-red-900 rounded px-1">R</kbd>
                  </button>
                </div>
              )}

              {data.job.isGeneral && onMovedToJob && !data.withdrawnAt && (
                <section aria-label="Move to a role" className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 space-y-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Move to a role</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">They applied without picking a role. Move them into an opening to review them with that role’s candidates.</p>
                  {moveTargets.length === 0 ? (
                    <p className="text-xs text-gray-500">No open roles yet. Post a job first.</p>
                  ) : (
                    <div className="flex flex-col min-[420px]:flex-row gap-2">
                      <label htmlFor="move-job" className="sr-only">Role</label>
                      <select id="move-job" value={targetJob} onChange={(e) => setTargetJob(e.target.value)}
                        className="flex-1 min-w-0 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm">
                        <option value="">Choose a role</option>
                        {moveTargets.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                      </select>
                      <button type="button" onClick={moveToJob} disabled={!targetJob || movingJob}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                        {movingJob && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Move
                      </button>
                    </div>
                  )}
                  {jobMsg && <p role="alert" className="text-xs text-red-700 dark:text-red-400">{jobMsg}</p>}
                </section>
              )}

              {data.otherApplications.length > 0 && (
                <section aria-label="Also applied to" className="rounded-[12px] border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Also applied to {data.otherApplications.length} other role{data.otherApplications.length === 1 ? '' : 's'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Agree on one answer with your team so they don’t hear different things.</p>
                  <ul className="space-y-1">
                    {data.otherApplications.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => onOpenOther?.(o.id)} disabled={!onOpenOther}
                          className="w-full flex items-center justify-between gap-2 min-h-[40px] px-2.5 rounded-[8px] text-left hover:bg-white dark:hover:bg-gray-900">
                          <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-200">{o.jobTitle}</span>
                          <span className="shrink-0 text-xs text-gray-600 dark:text-gray-400">{o.withdrawn ? 'Withdrawn' : STATUS[o.status]} · {fmtDate(o.appliedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.outsideVotes.length > 0 && (
                <section aria-label="Votes from shared shortlist" className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">From the shared shortlist</p>
                  <ul className="space-y-1.5">
                    {data.outsideVotes.map((v, i) => (
                      <li key={i} className="text-[13px]">
                        <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded mr-1.5 ${v.vote === 'YES' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : v.vote === 'MAYBE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}`}>{v.vote === 'YES' ? 'Yes' : v.vote === 'MAYBE' ? 'Maybe' : 'No'}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{v.name}</span>
                        {v.comment && <span className="block text-gray-700 dark:text-gray-300 mt-0.5">“{v.comment}”</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.history.length > 0 && (
                <details className="rounded-[12px] border border-gray-200 dark:border-gray-800 p-3 group">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white list-none flex items-center justify-between gap-2 min-h-[32px]">
                    History from their other applications <span className="text-xs font-normal text-gray-500">{data.history.length} item{data.history.length === 1 ? '' : 's'}</span>
                  </summary>
                  <ol className="mt-2 space-y-2">
                    {data.history.map((h) => (
                      <li key={`${h.kind}-${h.id}`} className="text-[13px]">
                        <span className="text-xs text-gray-500">{h.jobTitle} · {fmtTime(h.at)}</span>
                        {h.kind === 'note' ? (
                          <span className="block text-gray-800 dark:text-gray-200"><span className="font-semibold">{h.who}:</span> <span className="whitespace-pre-line">{h.text}</span></span>
                        ) : (
                          <span className="block text-gray-700 dark:text-gray-300">
                            {STATUS[h.text.split('>')[0]] ?? 'New'} → {STATUS[h.text.split('>')[1]] ?? h.text.split('>')[1]}
                            {h.reasonCode && <span className="text-gray-500"> · {exitReasonLabel(h.reasonCode)}</span>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <section aria-label="Contact and resume" className="grid grid-cols-1 gap-2 text-sm">
                {data.resumeType && (
                  <div className="flex gap-2 mb-1">
                    <button type="button" onClick={() => toggleResume(!resumeOpen)} aria-pressed={resumeOpen}
                      className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold">
                      <FileText className="w-4 h-4" aria-hidden /> {resumeOpen ? 'Hide resume' : 'View resume'}
                    </button>
                    <a href={`/api/employer/applications/${data.id}/resume`} {...(data.resumeType === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}
                      aria-label="Download resume" title="Download resume"
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                      {data.resumeType === 'link' ? <ExternalLink className="w-4 h-4" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
                      <span className="hidden min-[420px]:inline">{data.resumeType === 'link' ? 'Open' : 'Download'}</span>
                    </a>
                  </div>
                )}
                {/* Contact: the standard actions in one row, then the details with copy (recruiters paste them elsewhere). */}
                {(() => {
                  const wa = data.phone ? whatsappLink(data.phone, { firstName: data.fullName.split(' ')[0], jobTitle: data.job.title, company }) : null;
                  return (
                    <div className="flex gap-2">
                      <ContactAction href={`mailto:${data.email}`} label="Email" icon={<Mail className="w-5 h-5" aria-hidden />} />
                      {data.phone && <ContactAction href={`tel:${data.phone}`} label="Call" icon={<Phone className="w-5 h-5" aria-hidden />} />}
                      {wa && <ContactAction href={wa} external label="WhatsApp" icon={<WhatsAppIcon className="w-5 h-5 text-[#25D366]" />} />}
                      {data.linkedinUrl && <ContactAction href={data.linkedinUrl} external label="LinkedIn" icon={<LinkedInIcon className="w-5 h-5 text-[#0A66C2] dark:text-[#5BA4E6]" />} />}
                    </div>
                  );
                })()}
                <div className="rounded-[10px] border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  <CopyRow icon={<Mail className="w-4 h-4" aria-hidden />} value={data.email} what="email" />
                  {data.phone && <CopyRow icon={<Phone className="w-4 h-4" aria-hidden />} value={data.phone} what="phone number" />}
                </div>
                {(data.githubUrl || data.portfolioUrl) && (
                  <div className="flex flex-wrap gap-2">
                    {data.githubUrl && <a href={data.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] border border-gray-200 dark:border-gray-800 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"><GitHubIcon className="w-4 h-4" /> GitHub <ExternalLink className="w-3 h-3 text-gray-400" aria-hidden /></a>}
                    {data.portfolioUrl && <a href={data.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] border border-gray-200 dark:border-gray-800 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"><Globe className="w-4 h-4" aria-hidden /> Portfolio <ExternalLink className="w-3 h-3 text-gray-400" aria-hidden /></a>}
                  </div>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-2">
                {[
                  ['Experience', data.experienceYears != null ? yearsText(data.experienceYears) : '—'],
                  ['Notice period', data.noticePeriodDays != null ? (data.noticePeriodDays === 0 ? 'Immediate' : `${data.noticePeriodDays} days`) : '—'],
                  ['Expected salary', data.expectedCtcLakh != null ? `₹${data.expectedCtcLakh} L` : '—'],
                  ['City', data.city || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[10px] border border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
                    <dt className="text-xs text-gray-500">{k}</dt>
                    <dd className="text-sm font-semibold text-gray-900 dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>

              {!data.withdrawnAt && !sourcedPending && (
                <>
                  <RoundPicker key={`r-${data.id}-${data.interviewRound}`} id={data.id} rounds={data.job.rounds} current={data.interviewRound} canMove={!!onMove} onChanged={changed} />
                  {!data.job.isGeneral && !['APPLIED', 'REVIEWED'].includes(data.status) && <InterviewsSection key={`i-${data.id}-${refreshKey}`} id={data.id} rounds={data.job.rounds} currentRound={data.interviewRound} canMove={!!onMove} onScheduled={() => setReload((n) => n + 1)} />}
                  {!data.job.isGeneral && ['INTERVIEW', 'DECISION', 'OFFER', 'HIRED'].includes(data.status) && <ScorecardsSection key={`s-${data.id}`} id={data.id} currentRound={data.interviewRound} />}
                  {!data.job.isGeneral && !sourcedPending && (data.job.hasAssessment || data.status === 'ASSESSMENT') && <AssessmentSection key={`a-${data.id}-${reload}`} id={data.id} status={data.status} canMove={!!onMove} rejectTemplate={rejectTemplate} onChanged={changed} />}
                  {!data.job.isGeneral && <DecisionSection key={`d-${data.id}-${data.status}`} id={data.id} status={data.status} canDecide={data.canDecide} lastRound={lastRound} decisionOwner={data.job.decisionOwnerEmail} rejectTemplate={rejectTemplate} onChanged={changed} />}
                  {!data.job.isGeneral && <OfferSection key={`o-${data.id}`} id={data.id} status={data.status} canMove={!!onMove} onFilled={onFilled} onChanged={changed} />}
                </>
              )}

              {aiAccess && <AiReview id={id} ai={data.ai} access={aiAccess} onChanged={() => setReload((n) => n + 1)}
                skipReason={data.match.knockedOut ? 'knockout' : data.resumeProfile && !data.resumeProfile.readable ? 'scanned' : null} />}

              {data.resumeProfile && <ResumeTimeline p={data.resumeProfile} />}

              {data.match.reasons.length > 0 && (
                <section aria-labelledby="mt" className={BOX}>
                  <h3 id="mt" className={BOX_TITLE}>
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
                  <p className="mt-1.5 text-xs text-gray-500">Rules-based, not AI: compares your requirements with {data.sourcedState ? 'what your team added and the skills found in their resume' : 'what the candidate entered'}. Use it to prioritise, not to decide.</p>
                </section>
              )}

              {skills.length > 0 && (
                <section aria-labelledby="sk" className={BOX}>
                  <h3 id="sk" className={BOX_TITLE}>Skills <span className="font-normal text-gray-500">· has {matched.size} of {skills.length}</span></h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <li key={s} className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-[8px] text-[13px] border ${matched.has(s) ? 'border-green-300 bg-green-50 text-green-900 dark:border-transparent dark:bg-green-900/30 dark:text-green-300' : 'border-gray-300 bg-gray-50 text-gray-600 dark:border-transparent dark:bg-gray-800 dark:text-gray-400'}`}>
                        {matched.has(s) ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Minus className="w-3.5 h-3.5" aria-hidden />} {s}
                        <span className="sr-only">{matched.has(s) ? ' (has)' : ' (not ticked)'}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-gray-500">{data.sourcedState ? 'Skills found in their resume (they were sourced, so they didn’t tick any). A plain match, not a score.' : 'Skills the candidate ticked as having. A plain match, not a score.'}</p>
                </section>
              )}

              {data.screeningAnswers.length > 0 && (
                <section aria-labelledby="qa" className={BOX}>
                  <h3 id="qa" className={BOX_TITLE}>Screening answers <span className="font-normal text-gray-500">· {data.screeningAnswers.length}</span></h3>
                  <dl className="divide-y divide-gray-200 dark:divide-gray-800">
                    {data.screeningAnswers.map((q) => (
                      <div key={q.id} className="py-2 first:pt-0 last:pb-0">
                        <dt className="text-[13px] text-gray-600 dark:text-gray-400">{q.question}</dt>
                        <dd className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white whitespace-pre-line">{q.type === 'yesno' ? (q.answer === 'yes' ? 'Yes' : q.answer === 'no' ? 'No' : '—') : q.answer || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {data.coverLetter && (
                <section aria-labelledby="cl" className={BOX}>
                  <h3 id="cl" className={BOX_TITLE}>Note from the candidate</h3>
                  <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{data.coverLetter}</p>
                </section>
              )}

              <section aria-labelledby="notes" className={BOX}>
                <h3 id="notes" className={BOX_TITLE}>Team notes <span className="font-normal text-gray-500">· private, never shared with the candidate</span></h3>
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
                <section aria-labelledby="act" className={BOX}>
                  <h3 id="act" className={BOX_TITLE}>
                    Activity <span className="font-normal text-gray-500">· {data.events.length} {data.events.length === 1 ? 'update' : 'updates'}</span>
                  </h3>
                  <ol>
                    {data.events.map((e, i) => {
                      const last = i === data.events.length - 1;
                      const tone = activityTone(e.toStatus);
                      return (
                        <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                          {/* Timeline rail */}
                          {!last && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-gray-300 dark:bg-gray-700" aria-hidden />}
                          <span className={`relative mt-1 shrink-0 w-[15px] h-[15px] rounded-full border-2 border-white dark:border-gray-900 ${tone.dot}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
                              <span className="text-gray-600 dark:text-gray-400">{e.fromStatus ? STATUS[e.fromStatus] : 'New'}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-500" aria-label="to" />
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${tone.pill}`}>{STATUS[e.toStatus] ?? e.toStatus}</span>
                            </p>
                            {e.reasonCode && <p className="mt-0.5 text-[13px] text-gray-700 dark:text-gray-300">Reason: {exitReasonLabel(e.reasonCode)}</p>}
                            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                              {fmtTime(e.createdAt)}{e.actorEmail ? <> · by <span className="font-medium">{e.actorEmail.split('@')[0]}</span></> : null}
                            </p>
                            {e.emailStatus && (
                              <p className={`mt-1.5 flex items-start gap-1.5 rounded-[8px] border px-2 py-1.5 text-xs ${e.emailStatus === 'FAILED' ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300' : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700/70 dark:bg-gray-800/60 dark:text-gray-300'}`}>
                                <Mail className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
                                <span className="min-w-0">
                                  {e.emailStatus === 'SCHEDULED' && e.scheduledFor ? `Email scheduled for ${fmtTime(e.scheduledFor)}` : e.emailStatus === 'SENT' ? `Emailed: “${e.emailSubject}”` : e.emailStatus === 'FAILED' ? `“${e.emailSubject ?? 'This email'}” didn’t reach them. Check the address, or contact them another way.` : 'Email queued'}
                                </span>
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            </div>
          )}
        </div>
      </aside>
      {resumeOpen && data?.resumeType && data.id === id && (
        <ResumeViewer applicationId={data.id} name={data.fullName} type={data.resumeType} onClose={() => toggleResume(false)} />
      )}
      {withdrawing && data && <WithdrawDialog id={data.id} name={data.fullName} onClose={() => setWithdrawing(false)} onDone={() => { setWithdrawing(false); setReload((n) => n + 1); }} />}
    </>
  );
}

/** One contact action: brand or standard icon over a short label, all the same size so the row reads as a set. */
function ContactAction({ href, label, icon, external }: { href: string; label: string; icon: React.ReactNode; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} aria-label={external ? `${label} (opens in a new tab)` : label}
      className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 min-h-[60px] px-2 rounded-[10px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </a>
  );
}

/** An email or number shown in full, with copy. */
function CopyRow({ icon, value, what }: { icon: React.ReactNode; value: string; what: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the text is selectable */ }
  }
  return (
    <div className="flex items-center gap-2 pl-3 pr-1 min-h-[44px]">
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100 select-all" title={value}>{value}</span>
      <button type="button" onClick={copy} aria-label={copied ? `Copied ${what}` : `Copy ${what}`}
        className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-[8px] text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
        {copied ? <Check className="w-3.5 h-3.5 text-green-600" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}

/** "From the resume": roles, dates and education read from the resume, with experience worked out from the dates. */
function ResumeTimeline({ p }: { p: NonNullable<import('@/lib/employer/applications').ApplicationDetail['resumeProfile']> }) {
  const dur = (m: number | null) => (m == null ? '' : m < 12 ? `${m} mo` : `${Math.floor(m / 12)} yr${m >= 24 ? 's' : ''}${m % 12 ? ` ${m % 12} mo` : ''}`);
  if (!p.readable) {
    return (
      <section aria-labelledby="rt" className={BOX}>
        <h3 id="rt" className={BOX_TITLE}>From the resume</h3>
        <p className="text-[13px] text-gray-700 dark:text-gray-300">This resume looks scanned (an image), so its text couldn’t be read. Open the resume to read it yourself.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="rt" className={BOX}>
      <h3 id="rt" className={BOX_TITLE}>
        From the resume{' '}
        <span className="font-normal text-gray-600 dark:text-gray-400">
          · {p.datedRoles ? `${p.years} yrs from role dates` : 'no dated roles'}{p.internMonths ? ` + ${p.internMonths} mo internships` : ''}
        </span>
      </h3>
      {p.roles.length > 0 ? (
        <ol>
          {p.roles.map((r, i) => (
            <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
              {i < p.roles.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-gray-300 dark:bg-gray-700" aria-hidden />}
              <span className={`relative mt-1.5 shrink-0 w-[11px] h-[11px] rounded-full ${r.current ? 'bg-emerald-500' : r.internship ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gray-500 dark:bg-gray-400'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {r.title || 'Role'}{r.company && <span className="font-normal text-gray-700 dark:text-gray-300"> · {r.company}</span>}
                  {r.internship && <span className="ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">Internship</span>}
                  {r.current && <span className="ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Current</span>}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{r.dateText || 'Dates not given'}{r.months != null ? ` · ${dur(r.months)}` : ''}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="text-[13px] text-gray-700 dark:text-gray-300">No jobs found on the resume.</p>}

      {p.gaps.length > 0 && (
        <p className="mt-2.5 text-xs text-gray-600 dark:text-gray-400">
          Time between roles: {p.gaps.map((g) => `${g.label} (${dur(g.months)})`).join(', ')}. Shown for context only; it never affects any score.
        </p>
      )}

      {(p.education.length > 0 || p.certifications.length > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
          {p.education.map((e, i) => (
            <p key={i} className="text-[13px] text-gray-800 dark:text-gray-200">
              {e.degree || 'Education'}{e.institution && <span className="text-gray-600 dark:text-gray-400"> · {e.institution}</span>}{e.endYear && <span className="text-gray-600 dark:text-gray-400"> · {e.endYear}</span>}
            </p>
          ))}
          {p.certifications.length > 0 && <p className="text-[13px] text-gray-700 dark:text-gray-300">Certifications: {p.certifications.join(', ')}</p>}
        </div>
      )}
      <p className="mt-2.5 text-xs text-gray-600 dark:text-gray-400">
        Read from the resume{p.pageCount > 1 ? ` (${p.pageCount} pages)` : ''}{p.scannedPages ? `; ${p.scannedPages} scanned page${p.scannedPages === 1 ? '' : 's'} couldn’t be read` : ''}. Names and dates are copied exactly; years are worked out from the dates, overlapping jobs counted once.
      </p>
    </section>
  );
}

