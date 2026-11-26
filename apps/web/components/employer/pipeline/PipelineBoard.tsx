'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock, Download, Flag, Inbox, Loader2, PauseCircle, Sparkles, Trophy, LayoutGrid, List, MessageSquare, Search, SlidersHorizontal, Users, X, Plus, Upload, UserPlus, Settings2, Scale, ArrowRight } from 'lucide-react';
import { waitLevel } from '@/lib/employer/stages';
import { yearsText } from '@/lib/jobs/format';
import type { BoardCard } from '@/lib/employer/applications';
import CandidatePanel from './CandidatePanel';
import MoveDialog, { type MoveOptions, type MoveRequest, type Template } from './MoveDialog';
import ReviewBar, { type ReviewDecision } from './ReviewBar';
import PoolMatches from './PoolMatches';
import ShareShortlist from './ShareShortlist';
import AddCandidates from './AddCandidates';
import PipelineSettings from './PipelineSettings';
import CompareFinalists from './CompareFinalists';
import { ENDED_STAGE, ON_HOLD_STAGE, OUTCOME_LABEL, STAGES, isSourcedPending, outcomeOf } from '@/lib/employer/stages';
import { dueLabel, nextAction } from '@/lib/employer/next-action';
import FilledPrompt, { type FilledJob } from './FilledPrompt';

const ALL_STAGE_COLUMNS = STAGES;
const REJECTED = ENDED_STAGE;
const ON_HOLD = ON_HOLD_STAGE;
/** The sourcing lane: people the team added who aren't in the pipeline yet. Not a drop target. */
const SOURCING = { key: 'sourcing', label: 'Sourcing', statuses: [] as string[], target: '' } as const;
/**
 * New applicants who didn't meet a knockout question, grouped beside New. Only a view: their status doesn't change,
 * nobody is emailed, and the team still decides (move them on or not).
 */
const UNMET = { key: 'unmet', label: 'Didn’t meet must-haves', statuses: [] as string[], target: '' } as const;

const SOURCE: Record<string, string> = {
  JOBS_PAGE: 'AI Jobs', STARTUP_PROFILE: 'Profile', GOOGLE: 'Google', WIDGET: 'Website', CAREERS_PAGE: 'Careers page',
  REFERRAL: 'Referral', DIRECT: 'Direct', OTHER: 'Other', IMPORTED: 'Imported', SOURCED: 'Sourced', NETWORK: 'Open to opportunities', TALENT_POOL: 'Talent pool',
};
const NOTICE = [{ v: '', l: 'Any notice' }, { v: '0', l: 'Immediate' }, { v: '30', l: '≤ 30 days' }, { v: '60', l: '≤ 60 days' }, { v: '90', l: '≤ 90 days' }];

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

interface Job { id: string; title: string; status: string; count: number; unseen?: number; isGeneral?: boolean; rounds?: string[]; hasAssessment?: boolean }

/** Cards shown per column (and rows in the list) before "Show more": keeps big boards fast, especially on phones. */
const PAGE = 50;

// A steady colour per role, so "All roles" view is scannable at a glance.
const ROLE_TONES = [
  'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
  'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  'bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200',
  'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
  'bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200',
  'bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
];
const GENERAL_TONE = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
function roleTone(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ROLE_TONES[h % ROLE_TONES.length];
}
const STATUS_NOTE: Record<string, string> = { PAUSED: 'paused', CLOSED: 'closed' };

export default function PipelineBoard({
  jobs, jobId, cards: initial, templates, bookingUrl, initialStage, initialCandidate = null, canMove = true, canExport = true, teammates = [],
  ai = { enabled: false, used: 0, limit: 0, canBuy: false }, company = '', initialView = 'board', initialReview = false, canManageJobs = false, capped = false, openPipeline = false,
}: {
  /** Open the pipeline settings straight away (from the "job is live" screen). */
  openPipeline?: boolean;
  /** The first load stopped at the board limit: the list view can load the rest. */
  capped?: boolean;
  canManageJobs?: boolean;
  company?: string;
  /** 'top' is the old Top 10 link: it now opens "Review new" on the board. */
  initialView?: 'board' | 'list' | 'top';
  /** Open straight into "Review new" (links from emails). */
  initialReview?: boolean;
  jobs: Job[];
  jobId: string | null;
  cards: BoardCard[];
  templates: Record<string, Template>;
  bookingUrl: string | null;
  initialStage?: string | null;
  initialCandidate?: string | null;
  canMove?: boolean;
  canExport?: boolean;
  teammates?: { email: string; name: string }[];
  ai?: { enabled: boolean; used: number; limit: number; canBuy: boolean };
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  // A server refresh (after adding people, saving the pipeline, a decision) brings new cards: show them.
  useEffect(() => { setCards(initial); }, [initial]);
  const [view, setView] = useState<'board' | 'list'>(initialView === 'list' ? 'list' : 'board');
  const showLayout = (v: 'board' | 'list') => setView(v);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [minExp, setMinExp] = useState('');
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState('');
  const [onlyNew, setOnlyNew] = useState(initialStage === 'new');
  const [sort, setSort] = useState<'match' | 'ai' | 'newest'>(ai.enabled ? 'ai' : 'match');
  const [aiPicks, setAiPicks] = useState(false);
  const [aiUsage, setAiUsage] = useState({ used: ai.used, limit: ai.limit });
  const [screening, setScreening] = useState(false);
  const [meetsOnly, setMeetsOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [showOnHold, setShowOnHold] = useState(initialStage === 'onhold');
  const [waitingOnly, setWaitingOnly] = useState(initialStage === 'waiting');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(initialCandidate);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [toast, setToast] = useState('');
  const [filled, setFilled] = useState<FilledJob[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [booking, setBooking] = useState(bookingUrl);
  const [shown, setShown] = useState<Record<string, number>>({});
  const limitOf = (key: string) => shown[key] ?? PAGE;
  const showMore = (key: string) => setShown((m) => ({ ...m, [key]: (m[key] ?? PAGE) + PAGE }));
  const currentJob = jobs.find((j) => j.id === jobId) ?? null;
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(openPipeline);
  const [comparing, setComparing] = useState(false);
  const [more, setMore] = useState(capped);
  const [loadingMore, setLoadingMore] = useState(false);
  // Assessment shows as a column only where it's used: the job has one, or someone is in it.
  const showAssessment = (currentJob ? !!currentJob.hasAssessment : jobs.some((j) => j.hasAssessment)) || cards.some((c) => c.status === 'ASSESSMENT');
  const COLUMNS = ALL_STAGE_COLUMNS.filter((c) => c.key !== 'assessment' || showAssessment);
  const ALL_COLUMNS = [...COLUMNS, ON_HOLD, REJECTED];
  const moveTargets = useMemo(() => jobs.filter((j) => !j.isGeneral && j.status !== 'CLOSED').map((j) => ({ id: j.id, title: j.title })), [jobs]);

  const skills = useMemo(() => Array.from(new Set(cards.flatMap((c) => c.confirmedSkills))).sort(), [cards]);

  const filtered = useMemo(() => cards.filter((c) => {
    if (q && !`${c.fullName} ${c.currentTitle ?? ''} ${c.currentCompany ?? ''} ${c.city ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (skill && !c.confirmedSkills.includes(skill)) return false;
    if (minExp && (c.experienceYears ?? -1) < Number(minExp)) return false;
    if (notice && (c.noticePeriodDays == null || c.noticePeriodDays > Number(notice))) return false;
    if (source && c.channel !== source) return false;
    if (onlyNew && c.status !== 'APPLIED') return false;
    if (meetsOnly && c.match.knockedOut) return false;
    if (aiPicks && c.ai?.recommendation !== 'shortlist') return false;
    if (waitingOnly && (c.withdrawn || !waitLevel(c.status, c.stageSince))) return false;
    return true;
  }).sort(byBoardOrder(sort)),
  [cards, q, skill, minExp, notice, source, onlyNew, meetsOnly, aiPicks, sort, waitingOnly]);

  const inCol = (statuses: readonly string[]) => filtered.filter((c) => !isSourcedPending(c.sourcedState) && statuses.includes(c.status));
  const sourcing = filtered.filter((c) => isSourcedPending(c.sourcedState));
  const isUnmet = (c: BoardCard) => !c.withdrawn && c.match.knockedOut && (c.status === 'APPLIED' || c.status === 'REVIEWED');
  const unmet = filtered.filter((c) => !isSourcedPending(c.sourcedState) && isUnmet(c));
  const colList = (col: { key: string; statuses: readonly string[] }) =>
    col.key === 'sourcing' ? sourcing : col.key === 'unmet' ? unmet : col.key === 'new' ? inCol(col.statuses).filter((c) => !isUnmet(c)) : inCol(col.statuses);
  const ordered = useMemo(() => [...sourcing, ...ALL_COLUMNS.flatMap((col) => (col.key === 'new' ? [...colList(col), ...unmet] : colList(col)))], [filtered, showAssessment]); // eslint-disable-line react-hooks/exhaustive-deps
  const openIndex = ordered.findIndex((c) => c.id === openId);

  // ── New applicants: best first, the strongest marked "Top pick", and a one-at-a-time review ──
  const isNew = (c: BoardCard) => !c.withdrawn && !isSourcedPending(c.sourcedState) && (c.status === 'APPLIED' || c.status === 'REVIEWED');
  /** Must-have flags matter while the first decision is open (New, Screening); after that they're noise. */
  const pendingDecision = (c: BoardCard) => isNew(c) || c.status === 'SHORTLISTED';
  /** Undecided new applicants in the column's order (filters aside), so the review walks exactly what you see. */
  const newQueue = useMemo(() => cards.filter(isNew).sort(byBoardOrder(sort)), [cards, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The ten strongest that meet the basics (no failed must-answer question, no missing must-have skill, not rated weak). */
  const topPicks = useMemo(() => new Set(cards.filter(isNew).filter((c) => !c.isGeneral).filter(meetsBasics).sort(byBoardOrder('ai')).slice(0, 10).map((c) => c.id)), [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const [review, setReview] = useState<{ queue: string[]; decided: number; skipped: string[] } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const stillNew = (id: string) => { const c = cards.find((x) => x.id === id); return !!c && isNew(c); };

  function startReview() {
    const queue = newQueue.map((c) => c.id);
    if (!queue.length) { setToast('No new candidates to review.'); return; }
    setReview({ queue, decided: 0, skipped: [] });
    setRejectOpen(false);
    setOpenId(queue[0]);
  }
  /** The next undecided person after `from` in the queue; at the end, finish with a summary. */
  function advance(from: string, decided: number, skipped: string[], decidedId?: string) {
    if (!review) return;
    const at = review.queue.indexOf(from);
    const next = review.queue.slice(at + 1).find((id) => id !== decidedId && stillNew(id) && !skipped.includes(id));
    if (next) { setOpenId(next); return; }
    setOpenId(null);
    setReview(null);
    setToast(skipped.length
      ? `Review done: ${decided} decided, ${skipped.length} skipped. They stay in New.`
      : `All caught up: ${decided} decided.`);
  }
  async function decideInReview(status: ReviewDecision, reason?: string) {
    if (!review || !openId || reviewBusy) return;
    const id = openId;
    setRejectOpen(false);
    setReviewBusy(true);
    const opts: MoveOptions = status === 'REJECTED'
      ? { email: templates.REJECTED?.sendByDefault ? { subject: templates.REJECTED.subject, body: templates.REJECTED.body, sendAt: null } : null, reason }
      : { email: null };
    const ok = await doMove({ ids: [id], toStatus: status }, opts);
    setReviewBusy(false);
    if (!ok) return;
    const decided = review.decided + 1;
    setReview({ ...review, decided });
    advance(id, decided, review.skipped, id);
  }
  function skipInReview() {
    if (!review || !openId) return;
    const skipped = [...review.skipped, openId];
    setReview({ ...review, skipped });
    advance(openId, review.decided, skipped);
  }
  function endReview() { setReview(null); setRejectOpen(false); setOpenId(null); }
  // Links from the weekly email and old "Top 10" links open the review straight away.
  const startedFromLink = useRef(false);
  useEffect(() => {
    if (!initialReview || startedFromLink.current || !canMove) return;
    startedFromLink.current = true;
    if (newQueue.length) startReview();
  }, [initialReview, canMove, newQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewPos = review && openId ? review.queue.indexOf(openId) + 1 : 0;
  const activeFilters = [q, skill, minExp, notice, source].filter(Boolean).length + (onlyNew ? 1 : 0) + (meetsOnly ? 1 : 0) + (aiPicks ? 1 : 0) + (waitingOnly ? 1 : 0);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectable = canMove || canExport;
  const requestMove = useCallback((ids: string[], toStatus: string, name?: string) => {
    if (!canMove) return;
    const movable = ids.filter((id) => { const c = cards.find((x) => x.id === id); return c && !c.withdrawn && c.status !== toStatus && !isSourcedPending(c.sourcedState); });
    if (!movable.length) { setToast('Nothing to move: those candidates are already there, withdrew, or haven’t said they’re interested yet.'); return; }
    if (toStatus === 'REVIEWED') { void doMove({ ids: movable, toStatus }, { email: null }); return; }
    setMove({ ids: movable, toStatus, name: name?.split(' ')[0] });
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  async function doMove(req: MoveRequest, opts: MoveOptions): Promise<boolean> {
    const before = cards;
    const nowIso = new Date().toISOString();
    setCards((cs) => cs.map((c) => (req.ids.includes(c.id) ? {
      ...c, status: req.toStatus, stageSince: nowIso,
      onHoldUntil: req.toStatus === 'ON_HOLD' ? opts.holdUntil ?? null : null,
      exitReason: req.toStatus === 'REJECTED' || req.toStatus === 'ON_HOLD' ? opts.reason ?? null : null,
    } : c)));
    let ok = false;
    const batchKey = crypto.randomUUID();
    const single = req.ids.length === 1;
    try {
      const res = await fetch(single ? `/api/employer/applications/${req.ids[0]}` : '/api/employer/applications/bulk', {
        method: single ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: req.ids, toStatus: req.toStatus, email: opts.email, bookingUrl: opts.bookingUrl, reason: opts.reason, note: opts.note, holdUntil: opts.holdUntil, batchKey }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setCards(before); setToast(d.error || 'Couldn’t move. Try again.'); }
      else {
        ok = true;
        const r = d.result;
        if (opts.bookingUrl) setBooking(opts.bookingUrl);
        setToast([
          `Moved ${r.moved} candidate${r.moved === 1 ? '' : 's'}`,
          r.emailed ? `emailed ${r.emailed}` : '', r.scheduled ? `${r.scheduled} email${r.scheduled === 1 ? '' : 's'} scheduled` : '',
          r.failed ? `${r.failed} email${r.failed === 1 ? '' : 's'} failed` : '',
        ].filter(Boolean).join(' · '));
        setSelected(new Set());
        setPanelKey((k) => k + 1);
        if (Array.isArray(r.filledJobs) && r.filledJobs.length) setFilled(r.filledJobs);
      }
    } catch {
      setCards(before);
      setToast('You seem to be offline. Nothing was changed.');
    }
    setMove(null);
    return ok;
  }

  const unscreened = cards.filter((c) => !c.withdrawn && c.status !== 'REJECTED' && !isSourcedPending(c.sourcedState) && (!c.ai || c.ai.status === 'FAILED')).length;

  /** Past the board limit: load the next page into the list (or search everyone on the server). */
  async function loadMore(q?: string) {
    setLoadingMore(true);
    try {
      const p = new URLSearchParams({ ...(jobId ? { job: jobId } : {}), ...(q ? { q } : { skip: String(cards.length) }) });
      const res = await fetch(`/api/employer/applications/list?${p}`);
      const d = await res.json();
      if (!res.ok) { setToast(d.error || 'Couldn’t load more.'); return; }
      setCards((cs) => { const seen = new Set(cs.map((c) => c.id)); return [...cs, ...(d.cards as BoardCard[]).filter((c) => !seen.has(c.id))]; });
      if (!q) setMore(!!d.more);
      showLayout('list');
      setToast(q ? `Found ${d.cards.length} matching “${q}” across all candidates.` : `Loaded ${d.cards.length} more.`);
    } catch { setToast('You seem to be offline.'); }
    setLoadingMore(false);
  }

  async function screenAll() {
    setScreening(true);
    let total = 0;
    try {
      for (let round = 0; round < 50; round++) {
        const res = await fetch('/api/employer/applications/ai-screen', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jobId ? { jobId } : {}),
        });
        const d = await res.json().catch(() => ({}));
        if (d.ai) setAiUsage({ used: d.ai.used, limit: d.ai.limit });
        if (!res.ok) { setToast(d.error || 'AI review stopped. Try again.'); break; }
        const results = (d.results ?? {}) as Record<string, BoardCard['ai']>;
        setCards((cs) => cs.map((c) => (results[c.id] ? { ...c, ai: results[c.id] } : c)));
        total += d.done;
        if (d.stopped) { setToast(`Reviewed ${total}. ${d.stopped.message}`); break; }
        if (!d.remaining || !d.done) { setToast(total ? `AI reviewed ${total} candidate${total === 1 ? '' : 's'}.` : 'Nothing new to review.'); break; }
      }
    } catch {
      setToast('You seem to be offline. Reviews done so far are saved.');
    }
    setScreening(false);
  }

  const exportHref = `/api/employer/applications/export?${new URLSearchParams({ ...(jobId ? { job: jobId } : {}), ...(selected.size ? { ids: Array.from(selected).join(',') } : {}) })}`;
  const input = 'min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';

  const renderCard = (c: BoardCard) => (
    <article
      key={c.id}
      draggable={canMove && !c.withdrawn}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; }}
      className={`group relative rounded-[12px] border bg-white dark:bg-gray-900 p-3 transition-shadow hover:shadow-md ${selected.has(c.id) ? 'border-[#A50F15] ring-1 ring-[#A50F15]' : 'border-gray-200 dark:border-gray-800'} ${c.withdrawn ? 'opacity-60' : canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        {selectable && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.fullName}`}
          className="mt-1 w-4 h-4 accent-[#A50F15] shrink-0" />}
        <button type="button" onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A50F15] rounded">
          <span className="flex items-center gap-1.5">
            {c.status === 'APPLIED' && !c.withdrawn && <span className="w-2 h-2 rounded-full bg-[#A50F15] shrink-0" aria-label="Unseen" />}
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.fullName}</span>
          </span>
          {(c.currentTitle || c.currentCompany) && (
            <span className="block text-[13px] text-gray-600 dark:text-gray-400 truncate">{[c.currentTitle, c.currentCompany].filter(Boolean).join(' at ')}</span>
          )}
          {(!jobId || c.otherRoles > 0) && (
            <span className="flex flex-wrap items-center gap-1 mt-1">
              {!jobId && <span className={`max-w-full truncate text-xs font-semibold px-1.5 py-0.5 rounded ${c.isGeneral ? GENERAL_TONE : roleTone(c.listingId)}`}>{c.jobTitle}</span>}
              {c.otherRoles > 0 && <span className="text-xs font-semibold px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300" title="Applied to other roles at your company too">+{c.otherRoles} role{c.otherRoles === 1 ? '' : 's'}</span>}
            </span>
          )}
          <span className="flex flex-wrap gap-1 mt-2">
            {topPicks.has(c.id) && <TopPickBadge />}
            {/* A general application has no role to match against, so it gets no match score. */}
            {!c.isGeneral && <MatchBadge m={c.match} flags={pendingDecision(c)} />}
            <AiBadge a={c.ai} />
            {c.jobSkills > 0 && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.matched / c.jobSkills >= 0.75 ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                {c.matched}/{c.jobSkills} skills
              </span>
            )}
            {c.experienceYears != null && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{yearsText(c.experienceYears)}</span>}
            {c.noticePeriodDays != null && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{c.noticePeriodDays === 0 ? 'Immediate' : `${c.noticePeriodDays}d notice`}</span>}
            {!c.withdrawn && <WaitBadge status={c.status} since={c.stageSince} />}
            {c.status === 'ON_HOLD' && c.onHoldUntil && <HoldBadge until={c.onHoldUntil} />}
            {c.interviewRound && c.status === 'INTERVIEW' && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200">{c.interviewRound}</span>}
            {c.status === 'HIRED' && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.joinedAt ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}`}>{c.joinedAt ? 'Joined' : `Awaiting joining${c.joiningDate ? ` · ${new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`}</span>}
            {c.status === 'REJECTED' && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{OUTCOME_LABEL[outcomeOf(c.status, c.outcome) ?? 'REJECTED']}</span>}
            {isSourcedPending(c.sourcedState) && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">{c.sourcedState === 'ADDED' ? 'Not contacted' : 'Contacted'}{c.sourcedChannel ? ` · ${c.sourcedChannel}` : ''}</span>}
            {c.sourcedState === 'INTERESTED' && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">Sourced</span>}
          </span>
          <NextLine c={c} />
          <span className="flex items-center justify-between gap-2 mt-2 text-xs text-gray-500">
            <span>{c.referredBy ? `Referred by ${c.referredBy}` : `via ${SOURCE[c.channel] ?? c.channel}`} · {isSourcedPending(c.sourcedState) ? 'added' : ''} {ago(c.appliedAt)}</span>
            <span className="flex items-center gap-2">
              {c.noteCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" aria-hidden />{c.noteCount}</span>}
              {c.status === 'REVIEWED' && <span>Seen</span>}
              {c.withdrawn && <span className="font-semibold text-gray-600">Withdrawn</span>}
            </span>
          </span>
        </button>
      </div>
    </article>
  );

  const renderColumn = (col: { key: string; label: string; statuses: readonly string[]; target: string }, collapsed?: boolean) => {
    const list = colList(col);
    const noDrop = col.key === 'sourcing' || col.key === 'unmet';
    // Empty stages take less room, so the stages with people in them fit on screen.
    const narrow = list.length === 0 && dragOver !== col.key;
    return (
      <section key={col.key} aria-label={`${col.label}, ${list.length}`}
        onDragOver={(e) => { if (noDrop) return; e.preventDefault(); setDragOver(col.key); }}
        onDragLeave={() => setDragOver((k) => (k === col.key ? null : k))}
        onDrop={(e) => { e.preventDefault(); setDragOver(null); if (noDrop) return; const id = e.dataTransfer.getData('text/plain'); if (id) requestMove([id], col.target, cards.find((c) => c.id === id)?.fullName); }}
        className={`snap-start shrink-0 ${narrow ? 'w-[60vw] sm:w-[176px]' : 'w-[82vw] sm:w-[280px]'} transition-[width] duration-200 flex flex-col rounded-[14px] ${dragOver === col.key ? 'bg-[#A50F15]/5 ring-2 ring-[#A50F15]/40' : col.key === 'sourcing' ? 'bg-violet-50/70 dark:bg-violet-950/20 border border-dashed border-violet-200 dark:border-violet-900/50' : col.key === 'unmet' ? 'bg-amber-50/80 dark:bg-amber-950/20 border border-dashed border-amber-300 dark:border-amber-900/60' : 'bg-gray-100/70 dark:bg-gray-900/60'}`}>
        <header className="flex items-center gap-2 px-3 pt-3 pb-2">
          <h2 className="text-[13px] font-bold text-gray-800 dark:text-gray-200">{col.label}</h2>
          <span className="text-xs font-semibold text-gray-500 tabular-nums">{list.length}</span>
          {col.key === 'decision' && list.length > 0 && jobId && canMove && (
            <button type="button" onClick={() => setComparing(true)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:underline"><Scale className="w-3.5 h-3.5" aria-hidden /> Compare</button>
          )}
          {col.key === 'new' && list.some((c) => c.status === 'APPLIED') && (
            <span className="text-[11px] font-semibold text-[#A50F15]">{list.filter((c) => c.status === 'APPLIED').length} unseen</span>
          )}
          {col.key === 'new' && canMove && newQueue.length > 0 && (
            <button type="button" onClick={() => startReview()} className="ml-auto text-[11px] font-semibold text-gray-800 dark:text-gray-200 hover:text-[#A50F15] hover:underline">Review →</button>
          )}
          {collapsed && <button onClick={() => (col.key === 'onhold' ? setShowOnHold(false) : setShowRejected(false))} className="ml-auto text-xs font-semibold text-gray-600 hover:underline">Hide</button>}
        </header>
        {col.key === 'unmet' && <p className="px-3 -mt-1 pb-2 text-[11px] leading-snug text-amber-900 dark:text-amber-300">Grouped here, not rejected. Their stage hasn’t changed and nobody was emailed.</p>}
        <div className="flex-1 px-2 pb-2 space-y-2 min-h-[120px] overflow-y-auto max-h-[calc(100dvh-300px)]">
          {list.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-gray-500">{col.key === 'new' ? 'No new candidates' : col.key === 'sourcing' ? 'People you add to this job wait here until they’re interested.' : 'Drag candidates here'}</p>
          ) : list.slice(0, limitOf(col.key)).map(renderCard)}
          {list.length > limitOf(col.key) && (
            <button type="button" onClick={() => showMore(col.key)}
              className="w-full min-h-[40px] rounded-[10px] border border-dashed border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-900">
              Show {Math.min(PAGE, list.length - limitOf(col.key))} more · {list.length - limitOf(col.key)} left
            </button>
          )}
        </div>
      </section>
    );
  };

  const rejectedCount = inCol(REJECTED.statuses).length;
  const onHoldCount = inCol(ON_HOLD.statuses).length;
  const onHoldDue = inCol(ON_HOLD.statuses).filter((c) => c.onHoldUntil && new Date(c.onHoldUntil).getTime() <= Date.now()).length;
  const waitingCount = cards.filter((c) => !c.withdrawn && waitLevel(c.status, c.stageSince)).length;

  /** A narrow side column (On hold, Rejected) that opens on click and accepts dropped cards. */
  const sideColumn = (col: typeof ON_HOLD | typeof REJECTED, count: number, open: () => void, tone: string) => (
    <button key={col.key} onClick={open}
      onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) requestMove([id], col.target, cards.find((c) => c.id === id)?.fullName); }}
      className={`snap-start shrink-0 w-14 rounded-[14px] flex flex-col items-center gap-2 pt-3 text-xs font-bold text-gray-600 dark:text-gray-400 ${dragOver === col.key ? tone : 'bg-gray-100/70 dark:bg-gray-900/60 hover:bg-gray-200/70'}`}
      aria-label={`Show ${col.label.toLowerCase()} candidates (${count})`}>
      <ChevronRight className="w-4 h-4" aria-hidden />
      <span className="[writing-mode:vertical-rl] rotate-180">{col.label} · {count}</span>
    </button>
  );

  return (
    <div className="font-jakarta">
      {/* Title above the toolbar until there's room for both side by side (the toolbar is wide). */}
      <div className="flex flex-col xl:flex-row xl:items-end gap-3 mb-4">
        <div className="flex-1 min-w-0 xl:min-w-[280px]">
          <h1 className="portal-title">{currentJob ? currentJob.title : 'Candidates'}</h1>
          <p className="portal-subtitle">{canMove
            ? <>Drag candidates between stages, or open one to review.<span className="hidden md:inline"> Shortcuts: S screening, I interview, D final decision, R not moving ahead, ←/→ next.</span></>
            : 'Open a candidate to read their resume and answers, and leave notes for your team.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="View" className="inline-flex p-1 rounded-[10px] bg-gray-100 dark:bg-gray-800">
            {([['board', LayoutGrid, 'Board'], ['list', List, 'List']] as const).map(([v, Icon, l]) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => showLayout(v)}
                className={`inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-[8px] text-xs font-semibold ${view === v ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden /> {l}
              </button>
            ))}
          </div>
          {/* "Review new": one candidate at a time with the full profile, then on to the next. */}
          {canMove && newQueue.length > 0 && (
            <button type="button" onClick={() => startReview()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-[#A50F15] hover:bg-[#8E0D12] text-white text-sm font-semibold">
              <Inbox className="w-4 h-4" aria-hidden /> Review new · {newQueue.length}
            </button>
          )}
          {canMove && currentJob && !currentJob.isGeneral && currentJob.status !== 'CLOSED' && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"><UserPlus className="w-4 h-4" aria-hidden /> Add candidates</button>
          )}
          {canManageJobs && currentJob && !currentJob.isGeneral && (
            <button type="button" onClick={() => setSettings(true)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"><Settings2 className="w-4 h-4" aria-hidden /> Pipeline</button>
          )}
          {canMove && currentJob && !currentJob.isGeneral && <ShareShortlist jobId={currentJob.id} jobTitle={currentJob.title} />}
          {canManageJobs && canMove && (
            <Link href="/employer/applications/import" className="hidden md:inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Upload className="w-4 h-4" aria-hidden /> Import
            </Link>
          )}
          {canExport && (
            <a href={exportHref} className="hidden md:inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Download className="w-4 h-4" aria-hidden /> {selected.size ? `Export ${selected.size}` : 'Export CSV'}
            </a>
          )}
        </div>
      </div>

      <nav aria-label="Roles" className="-mx-4 px-4 md:mx-0 md:px-0 mb-4 flex gap-2 overflow-x-auto snap-x [scrollbar-width:thin] pb-1">
        {[{ id: '', title: 'All roles', status: 'OPEN', count: jobs.reduce((n, j) => n + j.count, 0), unseen: jobs.reduce((n, j) => n + (j.unseen ?? 0), 0), isGeneral: false }, ...jobs].map((j) => {
          const on = (jobId ?? '') === j.id;
          return (
            <Link key={j.id || 'all'} href={`/employer/applications${(() => { const p = new URLSearchParams({ ...(j.id ? { job: j.id } : {}), }).toString(); return p ? `?${p}` : ''; })()}`} aria-current={on ? 'page' : undefined} scroll={false}
              className={`snap-start shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${on
                ? 'bg-gray-900 border-gray-900 text-white dark:bg-white dark:border-white dark:text-gray-900'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-400'}`}>
              {j.isGeneral && <Inbox className="w-3.5 h-3.5" aria-hidden />}
              <span className="max-w-[220px] truncate">{j.title}</span>
              <span className={`tabular-nums ${on ? 'opacity-80' : 'text-gray-500'}`}>{j.count.toLocaleString('en-IN')}</span>
              {(j.unseen ?? 0) > 0 && <span className={`text-[11px] font-bold px-1.5 rounded-full ${on ? 'bg-white/20' : 'bg-[#A50F15]/10 text-[#A50F15]'}`}>{j.unseen} unseen</span>}
              {STATUS_NOTE[j.status] && <span className={`text-[11px] font-medium ${on ? 'opacity-70' : 'text-gray-400'}`}>{STATUS_NOTE[j.status]}</span>}
            </Link>
          );
        })}
      </nav>
      {currentJob?.isGeneral && (
        <p className="mb-4 -mt-1 text-sm text-gray-600 dark:text-gray-400">
          People who applied without picking a role. Open one and use <span className="font-semibold text-gray-800 dark:text-gray-200">Move to a role</span> when you have a fitting opening.
        </p>
      )}

      {ai.enabled ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 px-3 py-2 rounded-[12px] bg-violet-50/60 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50 text-sm">
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" aria-hidden />
          <span className="text-gray-800 dark:text-gray-200">
            AI review · <span className="tabular-nums">{aiUsage.used} of {aiUsage.limit}</span> used this month
          </span>
          {canMove && unscreened > 0 && (
            <button type="button" onClick={screenAll} disabled={screening || aiUsage.used >= aiUsage.limit}
              className="ml-auto inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold disabled:opacity-50">
              {screening ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Sparkles className="w-3.5 h-3.5" aria-hidden />}
              {screening ? 'Screening with AI…' : `Screen ${unscreened} with AI`}
            </button>
          )}
        </div>
      ) : cards.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3 px-3 py-2 rounded-[12px] border border-dashed border-gray-300 dark:border-gray-700 text-sm">
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" aria-hidden />
          <span className="text-gray-700 dark:text-gray-300">Let AI read every resume against your job and flag the best ones.</span>
          {ai.canBuy
            ? <Link href="/employer/billing" className="ml-auto min-h-[36px] inline-flex items-center text-[13px] font-semibold text-gray-900 dark:text-white hover:underline">See plans</Link>
            : <span className="ml-auto text-xs text-gray-500">Ask your workspace owner to upgrade</span>}
        </div>
      )}

      <div className={`flex-wrap items-center gap-2 mb-4 flex`}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <label htmlFor="cand-q" className="sr-only">Search candidates</label>
          <input id="cand-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, company, city" className={`${input} w-full pl-9`} />
        </div>
        <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          <SlidersHorizontal className="w-4 h-4" aria-hidden /> Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
        {/* Quick filters: one swipeable line on phones, inline on larger screens. */}
        <div className="order-last md:order-none w-full md:w-auto flex gap-1 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
          <label className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> Unseen only
          </label>
          <label className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer" title="Candidates who have been in the same stage for 3 days or more">
            <input type="checkbox" checked={waitingOnly} onChange={(e) => setWaitingOnly(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> No move in 3+ days{waitingCount ? ` · ${waitingCount}` : ''}
          </label>
          <label className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer" title="Hides candidates whose answers don't meet a must-answer question">
            <input type="checkbox" checked={meetsOnly} onChange={(e) => setMeetsOnly(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> Meets requirements
          </label>
          {ai.enabled && (
            <label className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={aiPicks} onChange={(e) => setAiPicks(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> AI picks
            </label>
          )}
        </div>
        <label htmlFor="cand-sort" className="sr-only">Sort candidates</label>
        <select id="cand-sort" value={sort} onChange={(e) => setSort(e.target.value as 'match' | 'newest')} className={input}>
          {ai.enabled && <option value="ai">AI fit first</option>}
          <option value="match">Best match first</option>
          <option value="newest">Newest first</option>
        </select>
        {activeFilters > 0 && (
          <button onClick={() => { setQ(''); setSkill(''); setMinExp(''); setNotice(''); setSource(''); setOnlyNew(false); setMeetsOnly(false); setAiPicks(false); setWaitingOnly(false); }} className="min-h-[40px] px-2 text-sm font-semibold text-gray-600 hover:underline">Clear</button>
        )}
      </div>
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} className={input}>
            <option value="">Any skill</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Minimum experience" value={minExp} onChange={(e) => setMinExp(e.target.value)} className={input}>
            <option value="">Any experience</option>{[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n}+ years</option>)}
          </select>
          <select aria-label="Notice period" value={notice} onChange={(e) => setNotice(e.target.value)} className={input}>
            {NOTICE.map((n) => <option key={n.v} value={n.v}>{n.l}</option>)}
          </select>
          <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className={input}>
            <option value="">Any source</option>{Object.entries(SOURCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}

      {jobId && canMove && !currentJob?.isGeneral && currentJob?.status === 'OPEN' && (
        <PoolMatches jobId={jobId} onDone={(m) => setToast(m)} />
      )}
      {onHoldDue > 0 && (
        <p role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
          <PauseCircle className="w-4 h-4 shrink-0" aria-hidden />
          {onHoldDue} candidate{onHoldDue === 1 ? ' is' : 's are'} due back from On hold.
          <button type="button" onClick={() => { showLayout('board'); setShowOnHold(true); }} className="font-semibold underline">Show them</button>
        </p>
      )}
      {cards.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] px-4 py-12 text-center">
          <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
          <p className="portal-item-title">No candidates yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Candidates who apply on AI Jobs, your startup profile or your website widget land here. You can also add people you found yourself.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {canMove && currentJob && !currentJob.isGeneral && <button type="button" onClick={() => setAdding(true)} className="btn-brand gap-2"><UserPlus className="w-4 h-4" aria-hidden /> Add candidates</button>}
            <Link href="/employer/jobs/new" className="btn-brand gap-2"><Plus className="w-4 h-4" aria-hidden /> Post a job</Link>
            <Link href="/employer/widget" className="inline-flex items-center min-h-[44px] px-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">Add jobs to your website</Link>
          </div>
        </div>
      ) : view === 'board' ? (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          {(sourcing.length > 0 || (currentJob && !currentJob.isGeneral && canMove)) && renderColumn(SOURCING)}
          {COLUMNS.flatMap((col) => (col.key === 'new' && unmet.length > 0 ? [renderColumn(col), renderColumn(UNMET)] : [renderColumn(col)]))}
          {showOnHold ? renderColumn(ON_HOLD, true) : sideColumn(ON_HOLD, onHoldCount, () => setShowOnHold(true), 'bg-sky-50 ring-2 ring-sky-300')}
          {showRejected ? renderColumn(REJECTED, true) : sideColumn(REJECTED, rejectedCount, () => setShowRejected(true), 'bg-red-50 ring-2 ring-red-300')}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
                <th scope="col" className="pl-4 py-2.5 w-8">
                  {selectable && <input type="checkbox" aria-label="Select all shown" checked={ordered.length > 0 && ordered.every((c) => selected.has(c.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(ordered.map((c) => c.id)) : new Set())} className="w-4 h-4 accent-[#A50F15]" />}
                </th>
                {['Candidate', 'Job', 'Stage', 'Match', ...(ai.enabled ? ['AI'] : []), 'Skills', 'Experience', 'Notice', 'Source', 'Applied'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {ordered.slice(0, limitOf('list')).map((c) => (
                <tr key={c.id} className={c.withdrawn ? 'opacity-60' : ''}>
                  <td className="pl-4 py-2.5">{selectable && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.fullName}`} className="w-4 h-4 accent-[#A50F15]" />}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setOpenId(c.id)} className="text-left font-semibold text-gray-900 dark:text-white hover:text-[#A50F15]">
                      {c.status === 'APPLIED' && <span className="inline-block w-2 h-2 rounded-full bg-[#A50F15] mr-1.5 align-middle" aria-label="Unseen" />}{c.fullName}
                    </button>
                    <span className="block text-xs text-gray-500">{[c.currentTitle, c.currentCompany].filter(Boolean).join(' at ')}</span>
                  </td>
                  <td className="px-3 py-2.5"><span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.isGeneral ? GENERAL_TONE : roleTone(c.listingId)}`}>{c.jobTitle}</span>{c.otherRoles > 0 && <span className="ml-1 text-xs text-gray-500">+{c.otherRoles}</span>}</td>
                  <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{c.withdrawn ? 'Withdrawn' : isSourcedPending(c.sourcedState) ? 'Sourcing' : c.status === 'REJECTED' ? OUTCOME_LABEL[outcomeOf(c.status, c.outcome) ?? 'REJECTED'] : c.status === 'HIRED' ? (c.joinedAt ? 'Joined' : 'Awaiting joining') : ALL_STAGE_COLUMNS.find((col) => (col.statuses as readonly string[]).includes(c.status))?.label ?? (c.status === 'ON_HOLD' ? 'On hold' : '')}{!c.withdrawn && <span className="ml-1.5"><WaitBadge status={c.status} since={c.stageSince} /></span>}</td>
                  <td className="px-3 py-2.5"><span className="inline-flex flex-wrap gap-1">{topPicks.has(c.id) && <TopPickBadge />}{!c.isGeneral && <MatchBadge m={c.match} flags={pendingDecision(c)} />}</span></td>
                  {ai.enabled && <td className="px-3 py-2.5"><AiBadge a={c.ai} /></td>}
                  <td className="px-3 py-2.5 tabular-nums">{c.jobSkills ? `${c.matched}/${c.jobSkills}` : '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.experienceYears != null ? yearsText(c.experienceYears) : '—'}</td>
                  <td className="px-3 py-2.5">{c.noticePeriodDays != null ? (c.noticePeriodDays === 0 ? 'Immediate' : `${c.noticePeriodDays} days`) : '—'}</td>
                  <td className="px-3 py-2.5">{SOURCE[c.channel] ?? c.channel}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{ago(c.appliedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {more && ordered.length <= limitOf('list') && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => loadMore()} disabled={loadingMore} className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">{loadingMore && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Load older candidates</button>
              {q.trim().length >= 2 && <button type="button" onClick={() => loadMore(q.trim())} disabled={loadingMore} className="min-h-[40px] px-4 rounded-[10px] text-sm font-semibold text-gray-800 dark:text-gray-200 underline">Search everyone for “{q.trim()}”</button>}
            </div>
          )}
          {ordered.length > limitOf('list') && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 text-center">
              <button type="button" onClick={() => showMore('list')} className="min-h-[40px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                Show {Math.min(PAGE, ordered.length - limitOf('list'))} more · {ordered.length - limitOf('list')} left
              </button>
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky z-20 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 mt-4 mx-auto w-fit max-w-full flex flex-wrap items-center gap-2 px-3 py-2 rounded-[14px] bg-gray-900 text-white shadow-xl">
          <span className="text-sm font-semibold px-1">{selected.size} selected</span>
          {canMove && <><label htmlFor="bulk-move" className="sr-only">Move selected to</label>
          <select id="bulk-move" value="" onChange={(e) => e.target.value && requestMove(Array.from(selected), e.target.value)}
            className="min-h-[36px] px-2 rounded-[8px] bg-gray-800 text-sm text-white border border-gray-700">
            <option value="">Move to…</option>
            {[...COLUMNS.filter((c) => c.key !== 'hired' && c.key !== 'decision'), ON_HOLD].map((c) => <option key={c.key} value={c.target}>{c.label}</option>)}
          </select>
          <button onClick={() => requestMove(Array.from(selected), 'REJECTED')} className="min-h-[36px] px-3 rounded-[8px] bg-red-700 hover:bg-red-800 text-sm font-semibold">Not moving ahead</button></>}
          {canExport && <a href={exportHref} className="min-h-[36px] inline-flex items-center px-3 rounded-[8px] hover:bg-gray-800 text-sm font-semibold">Export</a>}
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="w-9 h-9 flex items-center justify-center rounded-[8px] hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed z-toast left-1/2 -translate-x-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl max-w-[92vw]">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}

      {filled.length > 0 && (
        <FilledPrompt key={filled.map((f) => f.id).join()} jobs={filled}
          onDone={(m) => { setFilled([]); if (m) { setToast(m); router.refresh(); } }} />
      )}

      {openId && (
        <CandidatePanel
          id={openId}
          refreshKey={panelKey}
          onClose={review ? endReview : () => setOpenId(null)}
          onPrev={review ? undefined : openIndex > 0 ? () => setOpenId(ordered[openIndex - 1].id) : undefined}
          onNext={review ? skipInReview : openIndex >= 0 && openIndex < ordered.length - 1 ? () => setOpenId(ordered[openIndex + 1].id) : undefined}
          onMove={canMove ? (status, name) => {
            // In review, the three triage decisions happen at once; anything else (Interview, Offer…) asks as usual.
            if (review && status === 'SHORTLISTED') return void decideInReview('SHORTLISTED');
            if (review && status === 'REJECTED') return setRejectOpen(true);
            requestMove([openId], status, name);
          } : undefined}
          reviewBar={review && reviewPos > 0 ? (
            <ReviewBar position={reviewPos} total={review.queue.length} decided={review.decided} busy={reviewBusy}
              rejectOpen={rejectOpen} setRejectOpen={setRejectOpen} rejectEmails={!!templates.REJECTED?.sendByDefault}
              onDecide={(st, r) => void decideInReview(st, r)} onSkip={skipInReview} onExit={endReview} />
          ) : undefined}
          company={company}
          onStatus={(id, status, round, extra) => setCards((cs) => cs.map((c) => (c.id === id
            ? { ...c, status, interviewRound: round, ...(extra ?? {}), ...(c.status !== status ? { stageSince: new Date().toISOString() } : {}) } : c)))}
          rejectTemplate={templates.REJECTED}
          onFilled={(jobs) => setFilled(jobs)}
          onBoardChanged={() => router.refresh()}
          teammates={teammates}
          aiAccess={{ enabled: ai.enabled, canRun: canMove, canBuy: ai.canBuy }}
          onAiChanged={(id, a) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ai: a ? { status: a.status, fitScore: a.fitScore, recommendation: a.recommendation } : null } : c)))}
          onSeen={(id) => setCards((cs) => cs.map((c) => (c.id === id && c.status === 'APPLIED' ? { ...c, status: 'REVIEWED' } : c)))}
          onNoteAdded={(id) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, noteCount: c.noteCount + 1 } : c)))}
          onOpenOther={(other) => (cards.some((c) => c.id === other) ? setOpenId(other) : router.push(`/employer/applications?candidate=${other}`))}
          moveTargets={canMove ? moveTargets : []}
          onMovedToJob={canMove ? (id, job) => {
            setToast(`Moved to ${job.title}.`);
            // On the General applications tab they leave this list; elsewhere the card just shows its new role.
            setCards((cs) => (currentJob?.isGeneral
              ? cs.filter((c) => c.id !== id)
              : cs.map((c) => (c.id === id ? { ...c, listingId: job.id, jobTitle: job.title, isGeneral: false } : c))));
            if (currentJob?.isGeneral) setOpenId(null);
            router.refresh();
          } : undefined}
        />
      )}

      {adding && currentJob && (
        <AddCandidates jobId={currentJob.id} jobTitle={currentJob.title} onClose={() => setAdding(false)}
          onInvited={(m) => setToast(m)}
          onAdded={(n) => { setToast(`Added ${n} to the sourcing lane. Open one to contact them.`); router.refresh(); }} />
      )}
      {settings && currentJob && (
        <PipelineSettings jobId={currentJob.id} onClose={() => setSettings(false)} onSaved={(m) => { setSettings(false); setToast(m); router.refresh(); }} />
      )}
      {comparing && currentJob && (
        <CompareFinalists jobId={currentJob.id} onClose={() => setComparing(false)} onOpen={(id) => { setComparing(false); setOpenId(id); }} />
      )}

      {move && (
        <MoveDialog
          request={move}
          template={templates[move.toStatus]}
          bookingUrl={booking}
          onCancel={() => setMove(null)}
          onConfirm={(opts) => doMove(move, opts)}
        />
      )}
    </div>
  );
}

/** Meets the basics: no failed must-answer question, no missing must-have skill, not rated weak by the AI. */
function meetsBasics(c: BoardCard): boolean {
  return !c.match.knockedOut && !c.match.missingMust.length && c.ai?.recommendation !== 'weak';
}

/** The board's order for the chosen sort; the review queue uses the same, so "next" always matches the column. */
function byBoardOrder(sort: 'ai' | 'match' | 'newest') {
  return (a: BoardCard, b: BoardCard) => (sort !== 'newest' ? Number(meetsBasics(b)) - Number(meetsBasics(a)) : 0) // flagged people sink
    || (sort === 'ai' ? (b.ai?.fitScore ?? -1) - (a.ai?.fitScore ?? -1) : 0)
    || (sort !== 'newest' ? b.match.score - a.match.score : 0) || +new Date(b.appliedAt) - +new Date(a.appliedAt);
}

const BAND_STYLE: Record<BoardCard['match']['band'], string> = {
  Strong: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Good: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Fair: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/** Among the ten strongest new applicants who meet the basics. */
function TopPickBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-[#A50F15]/10 text-[#A50F15]" title="One of the 10 strongest new applicants who meet your must-haves">
      <Trophy className="w-3 h-3" aria-hidden /> Top pick
    </span>
  );
}

function MatchBadge({ m, flags = true }: { m: BoardCard['match']; flags?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums ${BAND_STYLE[m.band]}`} title={`${m.band} match`}>{m.score}% match</span>
      {flags && m.knockedOut && (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" title="Didn't meet a must-answer question">
          <Flag className="w-3 h-3" aria-hidden /> Failed a must-answer
        </span>
      )}
      {flags && m.missingMust.length > 0 && (
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" title="A skill you marked as must-have">
          Missing {m.missingMust.slice(0, 2).join(', ')}{m.missingMust.length > 2 ? '…' : ''}
        </span>
      )}
    </span>
  );
}

const AI_REC: Record<string, string> = { shortlist: 'AI pick', consider: 'AI: maybe', weak: 'AI: weak' };

function AiBadge({ a }: { a: BoardCard['ai'] }) {
  if (!a || a.status === 'FAILED') return null;
  if (a.status === 'PENDING') {
    return <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> AI</span>;
  }
  const pick = a.recommendation === 'shortlist';
  return (
    <span title={`AI fit ${a.fitScore}/100`} className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums ${pick ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
      <Sparkles className="w-3 h-3" aria-hidden /> {AI_REC[a.recommendation ?? 'weak']} · {a.fitScore}
    </span>
  );
}

/** Amber after 3 days and red after 5 days without a move in a waiting stage. */
function WaitBadge({ status, since }: { status: string; since: string }) {
  const level = waitLevel(status, since);
  if (!level) return null;
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 864e5);
  return (
    <span title={`${days} days in this stage without a move`}
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded tabular-nums ${level === 'red' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'}`}>
      <Clock className="w-3 h-3" aria-hidden /> {days}d waiting
    </span>
  );
}

function HoldBadge({ until }: { until: string }) {
  const due = new Date(until).getTime() <= Date.now();
  const date = new Date(until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${due ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'}`}>
      <PauseCircle className="w-3 h-3" aria-hidden /> {due ? 'Due back' : `Back ${date}`}
    </span>
  );
}

/** "Score assignment · Asha · due today": what to do next, who, and by when. */
function NextLine({ c }: { c: BoardCard }) {
  const a = nextAction({ ...c, ...c.next, status: c.status, sourcedState: c.sourcedState, withdrawn: c.withdrawn });
  if (!a) return null;
  const due = dueLabel(a.due);
  return (
    <span className={`mt-2 flex items-start gap-1 text-xs leading-snug ${a.overdue ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
      <ArrowRight className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
      <span><span className="font-semibold">{a.text}</span>{a.owner ? ` · ${a.owner}` : ''}{due ? ` · ${due}` : ''}</span>
    </span>
  );
}
