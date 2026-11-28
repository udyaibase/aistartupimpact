'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Check, ChevronLeft, ExternalLink, RotateCcw, X } from 'lucide-react';
import { REVIEW_REASONS, REVIEW_NOTE_MAX, REVIEW_STATUS_LABEL, type ReviewStatus } from '@udyaibase/utils/startup-review';
import { notify } from '@/components/Toast';
import { AI_CHECK_LABEL_TEXT } from '@udyaibase/utils/startup-ai-check';
import { DEFAULT_AUTO_APPROVE, type AutoApproveSettings } from '@udyaibase/utils/auto-approve';
import { askText } from '@/components/Ask';
import {
  loadReviewQueueAction, decideStartupAction, runAiCheckAction, holdFastApprovalAction, markFastApprovalCheckedAction,
  takeDownFastApprovalAction, saveAutoApproveSettingsAction, type ReviewRow, type FastItem, type ReviewKind,
} from './actions';

type TabKey = ReviewStatus | 'FAST';
const TABS: { key: TabKey; label: string; empty: string }[] = [
  { key: 'IN_REVIEW', label: 'Waiting', empty: 'Nothing is waiting for review.' },
  { key: 'CHANGES_REQUESTED', label: 'Changes requested', empty: 'No submission is waiting on its founder.' },
  { key: 'REJECTED', label: 'Not approved', empty: 'No submission has been turned down.' },
  { key: 'TAKEN_DOWN', label: 'Taken down', empty: 'Nothing live has been taken down.' },
  { key: 'FAST', label: 'Fast approval', empty: 'Nothing has been fast-approved, and no AI tool is scheduled.' },
];
const TARGET_DAYS = 2;
const AI_TONE = {
  LIKELY_AI: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  UNCLEAR: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  LIKELY_NOT_AI: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200',
} as const;
const timeText = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const pretty = (v: string | null) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '');

/** Startup submissions: every startup that is not public yet, with one place to approve, send back or turn down. */
export default function StartupReviewQueuePage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState<ReviewKind>('startup');
  const [tab, setTab] = useState<TabKey>('IN_REVIEW');
  const [fast, setFast] = useState<FastItem[]>([]);
  const [settings, setSettings] = useState<AutoApproveSettings>(DEFAULT_AUTO_APPROVE);
  const [canEditSettings, setCanEditSettings] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState({ enabled: false, delayMinutes: '15', dailyCap: '20', blockWords: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<'request_changes' | 'reject' | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const runCheck = async (row: ReviewRow) => {
    if (checking) return;
    setChecking(row.id);
    const res = await runAiCheckAction(row.id, row.kind);
    setChecking(null);
    if (!res.success) { notify(res.error, 'error'); return; }
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, aiCheckLabel: res.label, aiCheckReason: res.reason, aiCheckedAt: res.checkedAt } : r)));
  };

  const load = async (which: ReviewKind = kind) => {
    const res = await loadReviewQueueAction(which);
    if (res.success) {
      setRows(res.rows); setFast(res.fast); setSettings(res.settings); setCanEditSettings(res.canEditSettings); setLoadError('');
      setDraft({ enabled: res.settings.enabled, delayMinutes: String(res.settings.delayMinutes), dailyCap: String(res.settings.dailyCap), blockWords: res.settings.blockWords.join(', ') });
    } else setLoadError(res.error);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const switchKind = (next: ReviewKind) => {
    if (next === kind) return;
    setKind(next); setRows([]); setLoading(true); setOpenId(null); setMode(null); if (tab === 'FAST') setTab('IN_REVIEW');
    void load(next);
  };
  const noun = kind === 'tool' ? 'AI tool' : 'startup';

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, t.key === 'FAST' ? fast.length : rows.filter((r) => r.status === t.key).length])), [rows, fast]);

  const act = async (work: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    if (busy) return;
    setBusy(true);
    const res = await work();
    setBusy(false);
    if (!res.success) { notify(res.error || "That didn't work. Try again.", 'error'); return; }
    notify(done, 'success');
    await load();
  };
  const takeDownFast = async (item: FastItem) => {
    const reason = await askText({
      title: `Take down ${item.name}`, label: 'Reason (sent to the founder)', required: true, multiline: true, danger: true, confirmLabel: 'Take down',
      message: 'It disappears from the site straight away. Nothing is deleted, and the founder can fix it and send it for review again.',
    });
    if (!reason) return;
    await act(() => takeDownFastApprovalAction(item.kind, item.id, reason), `${item.name} was taken down.`);
  };
  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    const res = await saveAutoApproveSettingsAction({
      enabled: draft.enabled, delayMinutes: Number(draft.delayMinutes), dailyCap: Number(draft.dailyCap),
      blockWords: draft.blockWords.split(/[\s,]+/).filter(Boolean),
    });
    setSavingSettings(false);
    if (!res.success) { notify(res.error, 'error'); return; }
    setSettings(res.settings);
    setDraft({ enabled: res.settings.enabled, delayMinutes: String(res.settings.delayMinutes), dailyCap: String(res.settings.dailyCap), blockWords: res.settings.blockWords.join(', ') });
    notify(res.settings.enabled ? 'Fast approval is on.' : 'Fast approval is off.', 'success');
    await load();
  };
  const shown = rows.filter((r) => r.status === tab);

  const startDecision = (row: ReviewRow, next: 'request_changes' | 'reject') => {
    setOpenId(row.id); setMode(next); setFormError('');
    const guess = !row.aiUseCase && next === 'reject' ? 'NOT_AI' : '';
    setReasonCode(guess); setNote(REVIEW_REASONS.find((r) => r.code === guess)?.text ?? '');
  };
  const pickReason = (code: string) => { setReasonCode(code); setNote(REVIEW_REASONS.find((r) => r.code === code)?.text ?? ''); setFormError(''); };

  const decide = async (row: ReviewRow, action: 'approve' | 'request_changes' | 'reject') => {
    if (busy) return;
    setBusy(true); setFormError('');
    const res = await decideStartupAction(row.id, { action, reasonCode: action === 'approve' ? null : reasonCode, note: action === 'approve' ? null : note }, row.kind);
    setBusy(false);
    if (!res.success) { if (action === 'approve') notify(res.error, 'error'); else setFormError(res.error); return; }
    notify(action === 'approve' ? `${row.name} is live. The founder has been told.` : action === 'reject' ? `${row.name} was not approved. The founder has the reason.` : `Sent back to the founder of ${row.name}.`, 'success');
    setMode(null); setOpenId(null);
    await load();
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <Link href={kind === 'tool' ? '/tools-dir' : '/startups-dir'} className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-brand"><ChevronLeft className="w-4 h-4" aria-hidden /> {kind === 'tool' ? 'AI tools' : 'Startups'}</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white">Submissions</h1>
          <div role="group" aria-label="What to review" className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5">
            {(['startup', 'tool'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => switchKind(k)}
                className={`px-3.5 py-1.5 rounded-md text-sm font-semibold transition-colors ${kind === k ? 'bg-brand text-white' : 'text-gray-700 dark:text-gray-300 hover:text-brand'}`}>
                {k === 'tool' ? 'AI tools' : 'Startups'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-3xl">
          {kind === 'tool' ? 'AI tools' : 'Startups'} that are not public yet. Verified founders come first, then the longest wait. The AI label on each card is a hint from the founder’s own text: you decide.
        </p>
      </div>

      <section aria-labelledby="fast-settings" className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="fast-settings" className="text-sm font-semibold text-navy dark:text-white">
              Fast approval is {settings.enabled ? 'on' : 'off'}
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 max-w-3xl">
              {settings.enabled
                ? `Verified founders with an AI-looking address and a "likely AI" label go live by themselves after ${settings.delayMinutes} minutes (at most ${settings.dailyCap} a day). Check them afterwards under Fast approval.`
                : 'Every submission waits for a person.'}
            </p>
          </div>
          {canEditSettings && <button type="button" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen} className="btn-outline text-sm">{settingsOpen ? 'Close settings' : 'Settings'}</button>}
        </div>
        {settingsOpen && canEditSettings && (
          <form onSubmit={saveSettings} className="mt-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            <label className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
              <input type="checkbox" className="h-4 w-4" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
              Let qualifying startups and AI tools go live by themselves
            </label>
            <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
              <div>
                <label htmlFor="fast-delay" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Wait before going live (minutes)</label>
                <input id="fast-delay" type="number" min={5} max={1440} className="input-field text-sm" value={draft.delayMinutes} onChange={(e) => setDraft((d) => ({ ...d, delayMinutes: e.target.value }))} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">5 minutes to 24 hours. The job runs every 5 minutes, so allow a few minutes more.</p>
              </div>
              <div>
                <label htmlFor="fast-cap" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Most in any 24 hours</label>
                <input id="fast-cap" type="number" min={1} max={500} className="input-field text-sm" value={draft.dailyCap} onChange={(e) => setDraft((d) => ({ ...d, dailyCap: e.target.value }))} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Startups and tools together. The rest wait for room, or for you.</p>
              </div>
            </div>
            <div>
              <label htmlFor="fast-words" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Ordinary words that never count as “ai”</label>
              <textarea id="fast-words" rows={3} className="input-field text-sm font-mono" value={draft.blockWords} onChange={(e) => setDraft((d) => ({ ...d, blockWords: e.target.value }))} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Separated by commas. A website named after one of these (dubai, chai, mail, paint…) is not treated as an AI address. Add any you see slipping through.</p>
            </div>
            <button type="submit" disabled={savingSettings} className="btn-brand text-sm disabled:opacity-50">{savingSettings ? 'Saving…' : 'Save settings'}</button>
          </form>
        )}
      </section>

      <div role="tablist" aria-label="Submissions by status" className="flex flex-wrap gap-2">
        {TABS.filter((t) => t.key !== 'FAST' || settings.enabled || fast.length > 0).map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setOpenId(null); setMode(null); }}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${tab === t.key ? 'bg-brand text-white border-brand' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-brand'}`}>
            {t.label} <span className="tabular-nums opacity-80">({counts[t.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p role="status" className="card p-5 text-sm text-gray-600 dark:text-gray-400">Loading submissions…</p>
      ) : loadError ? (
        <p role="alert" className="card p-5 text-sm text-red-600 dark:text-red-400">{loadError}</p>
      ) : tab === 'FAST' ? (
        fast.length === 0 ? (
          <p className="card p-5 text-sm text-gray-600 dark:text-gray-400">{TABS.find((t) => t.key === 'FAST')?.empty}</p>
        ) : (
          <ul className="space-y-3">
            {fast.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="card p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-navy dark:text-white">
                    {item.name} <span className="ml-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{item.kind === 'tool' ? 'AI tool' : 'Startup'}</span>
                  </p>
                  {item.tagline && <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{item.tagline}</p>}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {item.state === 'live' ? `Went live by fast approval on ${timeText(item.at)}. No person has looked at it yet.` : item.state === 'held' ? 'On hold: it will not go live by itself. Approve it from AI tools.' : `Goes live by itself at ${timeText(item.at)}.`}
                    {item.founderName ? ` Submitted by ${item.founderName}${item.founderEmail ? ` (${item.founderEmail})` : ''}.` : ''}
                  </p>
                  {item.aiCheckReason && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">First look: {item.aiCheckReason}</p>}
                  <p className="flex flex-wrap gap-x-4 text-sm mt-2">
                    {item.websiteUrl && <a href={item.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">Open website <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
                    <Link href={item.kind === 'tool' ? `/tools-dir/${item.id}/edit` : `/startups-dir/${item.id}/edit`} className="text-brand hover:underline">Open listing</Link>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {item.state === 'live' && <button type="button" disabled={busy} onClick={() => act(() => markFastApprovalCheckedAction(item.kind, item.id), `${item.name} marked as checked.`)} className="btn-brand text-sm gap-1.5 disabled:opacity-50"><Check className="w-4 h-4" aria-hidden /> Looks good</button>}
                  {item.state === 'live' && <button type="button" disabled={busy} onClick={() => takeDownFast(item)} className="btn-outline text-sm text-red-600 dark:text-red-400">Take down</button>}
                  {item.state === 'scheduled' && <button type="button" disabled={busy} onClick={() => act(() => holdFastApprovalAction(item.kind, item.id, true), `${item.name} is on hold. A person will decide.`)} className="btn-outline text-sm">Hold</button>}
                  {item.state === 'held' && <button type="button" disabled={busy} onClick={() => act(() => holdFastApprovalAction(item.kind, item.id, false), `Hold removed from ${item.name}.`)} className="btn-outline text-sm">Remove hold</button>}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <p className="card p-5 text-sm text-gray-600 dark:text-gray-400">{TABS.find((t) => t.key === tab)?.empty}</p>
      ) : (
        <ul className="space-y-4">
          {shown.map((row) => {
            const open = openId === row.id;
            const late = row.status === 'IN_REVIEW' && row.daysWaiting > TARGET_DAYS;
            return (
              <li key={row.id} className="card p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {row.logoUrl ? <img src={row.logoUrl} alt="" className="w-full h-full object-cover" /> : row.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{row.name}</h2>
                      {row.isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                          <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> Owns {row.verifiedDomain || 'the website'}{row.verificationMethod ? ` (${row.verificationMethod === 'DNS' ? 'DNS record' : 'work email'})` : ''}
                        </span>
                      )}
                      {row.sameSite > 0 && <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">Possible duplicate: {row.sameSite} other listing{row.sameSite === 1 ? '' : 's'} on this website</span>}
                    </div>
                    {row.tagline && <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{row.tagline}</p>}
                    <p className={`text-xs mt-1 ${late ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                      {row.status === 'IN_REVIEW'
                        ? `Waiting ${row.daysWaiting === 0 ? 'since today' : `${row.daysWaiting} day${row.daysWaiting === 1 ? '' : 's'}`}${late ? ` (target: ${TARGET_DAYS} days)` : ''} · submitted ${dateText(row.waitingSince)}`
                        : `${REVIEW_STATUS_LABEL[row.status]}${row.reviewedAt ? ` on ${dateText(row.reviewedAt)}` : ''}${row.reviewedByEmail ? ` by ${row.reviewedByEmail}` : ''}`}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy dark:text-white">
                      Is it an AI product?
                      {row.aiCheckLabel
                        ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${AI_TONE[row.aiCheckLabel]}`}>{AI_CHECK_LABEL_TEXT[row.aiCheckLabel]}</span>
                        : <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Not checked</span>}
                    </p>
                    <button type="button" disabled={checking === row.id} onClick={() => runCheck(row)} className="text-xs font-semibold text-brand hover:underline disabled:opacity-50">
                      {checking === row.id ? 'Checking…' : row.aiCheckLabel ? 'Check again' : 'Run the check'}
                    </button>
                  </div>
                  {row.aiCheckReason && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1.5">{row.aiCheckReason}</p>}
                  {row.kind === 'tool' ? (
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-2">
                      <span className="font-semibold">Features listed: </span>
                      {row.features?.length ? row.features.join(' · ') : <span className="text-gray-600 dark:text-gray-400">none. Check the website.</span>}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-2 whitespace-pre-line">
                      <span className="font-semibold">Founder says: </span>
                      {row.aiUseCase || <span className="text-gray-600 dark:text-gray-400">no answer (submitted before we asked). Check the website.</span>}
                    </p>
                  )}
                </div>

                {settings.enabled && row.status === 'IN_REVIEW' && (() => {
                  const failed = row.fastChecks.filter((c) => !c.ok && c.key !== 'hold');
                  const coming = !row.autoApproveHeld && (row.autoApproveAt || failed.length === 0);
                  if (row.autoApproveHeld) {
                    return (
                      <p className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                        Fast approval is on hold for this one. You decide.
                        <button type="button" disabled={busy} onClick={() => act(() => holdFastApprovalAction(row.kind, row.id, false), `Hold removed from ${row.name}.`)} className="text-xs font-semibold text-brand hover:underline disabled:opacity-50">Remove hold</button>
                      </p>
                    );
                  }
                  if (coming) {
                    return (
                      <p className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                        {row.autoApproveAt ? `Goes live by itself at ${timeText(row.autoApproveAt)}.` : 'Passes every check: it will be scheduled within 5 minutes.'}
                        <button type="button" disabled={busy} onClick={() => act(() => holdFastApprovalAction(row.kind, row.id, true), `${row.name} is on hold. It will not go live by itself.`)} className="btn-outline text-xs">Hold</button>
                      </p>
                    );
                  }
                  return (
                    <details className="text-sm text-gray-600 dark:text-gray-400">
                      <summary className="cursor-pointer hover:text-brand">Waits for you: not eligible for fast approval ({failed.length} reason{failed.length === 1 ? '' : 's'})</summary>
                      <ul className="mt-2 space-y-1 text-xs">
                        {failed.map((c) => <li key={c.key}><span className="font-semibold">{c.label}:</span> {c.detail}</li>)}
                      </ul>
                    </details>
                  );
                })()}

                {row.description && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{row.description}</p>}

                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 text-sm">
                  {([['Category', row.category], ['Pricing', pretty(row.pricing ?? null)], ['Launched', row.launchYear], ['Business model', row.businessType], ['Stage', pretty(row.stage)], ['Founded', row.foundedYear], ['Team size', row.employeeCount], ['Headquarters', row.headquartersCity], ['Founders', row.founders.join(', ')], ['Submitted by', row.founderName ? `${row.founderName}${row.founderEmail ? ` (${row.founderEmail})` : ''}` : 'No founder account']] as const).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-xs text-gray-500 dark:text-gray-400">{k}</dt>
                      <dd className="text-gray-900 dark:text-gray-100 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {row.websiteUrl && <a href={row.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">Open website <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
                  {row.linkedinUrl && <a href={row.linkedinUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand hover:underline">LinkedIn <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
                  <Link href={row.kind === 'tool' ? `/tools-dir/${row.id}/edit` : `/startups-dir/${row.id}/edit`} className="text-brand hover:underline">Edit listing</Link>
                  {row.founderId && <Link href={`/founders/${row.founderId}`} className="text-brand hover:underline">Founder’s account</Link>}
                </div>

                {row.status !== 'IN_REVIEW' && row.reviewNote && (
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">What the founder was told</p>
                    <p className="text-sm text-gray-800 dark:text-gray-200 mt-1 whitespace-pre-line">{row.reviewNote}</p>
                  </div>
                )}

                {open && mode ? (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                    <p className="text-sm font-semibold text-navy dark:text-white">{mode === 'reject' ? `Turn this ${noun} down` : 'Ask the founder for changes'}</p>
                    <div>
                      <label htmlFor={`reason-${row.id}`} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Reason</label>
                      <select id={`reason-${row.id}`} className="input-field text-sm max-w-md" value={reasonCode} onChange={(e) => pickReason(e.target.value)}>
                        <option value="">Choose a reason…</option>
                        {REVIEW_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`note-${row.id}`} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Message to the founder <span className="font-normal text-gray-500">(emailed and shown in their portal)</span></label>
                      <textarea id={`note-${row.id}`} rows={4} maxLength={REVIEW_NOTE_MAX} className="input-field text-sm" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!formError} aria-describedby={formError ? `err-${row.id}` : undefined} placeholder="Say exactly what to change, so one more round is enough." />
                    </div>
                    {formError && <p id={`err-${row.id}`} role="alert" className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => decide(row, mode)} className="btn-brand text-sm disabled:opacity-50">{busy ? 'Sending…' : mode === 'reject' ? 'Turn down and tell the founder' : 'Send back to the founder'}</button>
                      <button type="button" onClick={() => { setMode(null); setOpenId(null); }} className="btn-outline text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={busy} onClick={() => decide(row, 'approve')} className="btn-brand text-sm gap-1.5 disabled:opacity-50"><Check className="w-4 h-4" aria-hidden /> Approve and publish</button>
                    {row.status !== 'CHANGES_REQUESTED' && <button type="button" onClick={() => startDecision(row, 'request_changes')} className="btn-outline text-sm gap-1.5"><RotateCcw className="w-4 h-4" aria-hidden /> Request changes</button>}
                    {row.status !== 'REJECTED' && <button type="button" onClick={() => startDecision(row, 'reject')} className="btn-outline text-sm gap-1.5 text-red-600 dark:text-red-400"><X className="w-4 h-4" aria-hidden /> Not approved</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
