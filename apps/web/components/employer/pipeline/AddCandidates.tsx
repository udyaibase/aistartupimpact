'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronLeft, Clock, Compass, MapPin, UserRound, ChevronRight, FileUp, Loader2, Mail, PenLine, Plus, Search, Sparkles, Star, Trash2, UploadCloud, UserPlus, Users, X } from 'lucide-react';
import { SOURCING_CHANNELS } from '@/lib/employer/stages';
import { yearsText } from '@/lib/jobs/format';
import { normalizeSkill } from '@/lib/jobs/skills';
import { stageStyle } from '@/lib/employer/pool-stage';
import { MESSAGE_MAX, MESSAGE_MIN, REQUEST_EXPIRE_DAYS, WORK_MODES, noticeText, type NetworkCard } from '@/lib/network/rules';

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const small = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5';
const ghost = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';

type Tab = 'pool' | 'network' | 'upload' | 'manual';
type NetPerson = NetworkCard & { score: number };
interface NetData { pilot: boolean; jobOpen?: boolean; access?: { allowed: boolean; reason: 'ok' | 'not_in_pilot' | 'paused'; allowance: number; used: number; left: number }; people?: NetPerson[] }
interface PoolPerson {
  id: string; fullName: string; currentTitle: string | null; city: string | null; experienceYears: number | null; appliedFor: string; score: number;
  appliedAt: string; stage: string; stageRank: number; skills: string[]; matchedSkills: string[]; missingMustHaves: string[];
}
interface Draft { key: string; file: File | null; fullName: string; email: string; phone: string; linkedinUrl: string; currentTitle: string; currentCompany: string; city: string; experienceYears: string; note: string; status: 'reading' | 'ready' | 'saving' | 'saved' | 'error'; error: string; usedAi: boolean; duplicates: number; skills: string[] }
const blank = (file: File | null = null): Draft => ({ key: Math.random().toString(36).slice(2), file, fullName: '', email: '', phone: '', linkedinUrl: '', currentTitle: '', currentCompany: '', city: '', experienceYears: '', note: '', status: file ? 'reading' : 'ready', error: '', usedAi: false, duplicates: 0, skills: [] });

const FIELDS = [['fullName', 'Name *'], ['email', 'Email *'], ['phone', 'Phone'], ['linkedinUrl', 'LinkedIn or profile link'], ['currentTitle', 'Current role'], ['currentCompany', 'Current company'], ['city', 'City'], ['experienceYears', 'Years of experience']] as const;
const PAGE = 8;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

/**
 * Add people to a job, three ways: invite past applicants from the talent pool (they get an email and apply
 * themselves, because that's what they agreed to), drop resumes (each is read to fill the form; AI when the workspace
 * allows it), or type someone in. Uploaded and typed people land in the job's sourcing lane, not the pipeline.
 */
export default function AddCandidates({ jobId, jobTitle, onClose, onAdded, onInvited }: {
  jobId: string; jobTitle: string; onClose: () => void; onAdded: (n: number) => void; onInvited?: (msg: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('pool');
  const [rows, setRows] = useState<Draft[]>([]);
  const [channel, setChannel] = useState<string>('LinkedIn');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const set = (key: string, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Talent pool: matches for this job, fetched once. Opens on Upload when the pool has nobody for this role.
  const [pool, setPool] = useState<PoolPerson[] | null>(null);
  const [poolTotal, setPoolTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/employer/jobs/${jobId}/pool-matches`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { count: 0, people: [] }))
      .then((d) => { if (!alive) return; setPool(d.people ?? []); setPoolTotal(d.count ?? 0); if (!d.people?.length) setTab((t) => (t === 'pool' ? 'upload' : t)); })
      .catch(() => alive && setPool([]));
    return () => { alive = false; };
  }, [jobId]);

  // Open to opportunities (pilot companies only): the tab appears only when the server says this company is in.
  const [net, setNet] = useState<NetData | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/employer/jobs/${jobId}/network-matches`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { pilot: false })).then((d) => alive && setNet(d)).catch(() => alive && setNet({ pilot: false }));
    return () => { alive = false; };
  }, [jobId]);

  const uploads = rows.filter((r) => r.file);
  const manual = rows.filter((r) => !r.file);
  useEffect(() => { if (tab === 'manual' && manual.length === 0) setRows((rs) => [...rs, blank()]); }, [tab, manual.length]);

  async function addFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => /\.(pdf|docx)$/i.test(f.name)).slice(0, 25);
    const drafts = list.map((f) => blank(f));
    setRows((rs) => [...rs, ...drafts]);
    for (const d of drafts) {
      if (d.file!.size > 5 * 1024 * 1024) { set(d.key, { status: 'error', error: 'Over 5 MB' }); continue; }
      try {
        const res = await fetch(`/api/employer/jobs/${jobId}/sourced/read`, { method: 'POST', body: d.file });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { set(d.key, { status: 'ready', error: data.error || 'Couldn’t read it; fill in by hand.' }); continue; }
        const f = data.fields ?? {};
        set(d.key, {
          status: 'ready', usedAi: !!data.usedAi, fullName: f.fullName ?? '', email: f.email ?? '', phone: f.phone ?? '', linkedinUrl: f.linkedinUrl ?? '',
          currentTitle: f.currentTitle ?? '', currentCompany: f.currentCompany ?? '', city: f.city ?? '', experienceYears: f.experienceYears != null ? String(f.experienceYears) : '',
          skills: Array.isArray(f.skills) ? f.skills : [],
        });
      } catch { set(d.key, { status: 'ready', error: 'Couldn’t read it; fill in by hand.' }); }
    }
  }

  const visible = tab === 'upload' ? uploads : manual;
  const pending = visible.filter((r) => r.status !== 'saved');

  async function saveAll() {
    setBusy(true);
    let added = 0;
    for (const r of pending) {
      if (r.status === 'reading') continue;
      set(r.key, { status: 'saving', error: '' });
      const body = { fullName: r.fullName, email: r.email, phone: r.phone, linkedinUrl: r.linkedinUrl, currentTitle: r.currentTitle, currentCompany: r.currentCompany, city: r.city, experienceYears: r.experienceYears, note: r.note, channel, channelOther: other, skills: r.skills };
      let res: Response | null = null;
      if (r.file) {
        const form = new FormData();
        form.append('data', JSON.stringify(body));
        form.append('resume', r.file);
        res = await fetch(`/api/employer/jobs/${jobId}/sourced`, { method: 'POST', body: form }).catch(() => null);
      } else {
        res = await fetch(`/api/employer/jobs/${jobId}/sourced`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      }
      const data = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
      if (res?.ok) { added++; set(r.key, { status: 'saved', duplicates: data.duplicates?.length ?? 0 }); }
      else set(r.key, { status: 'error', error: data.error || 'Couldn’t add.' });
    }
    setBusy(false);
    if (added) onAdded(added);
  }

  const anySaved = rows.some((r) => r.status === 'saved');
  const tabs: { id: Tab; label: string; short: string; icon: typeof Users; count?: number }[] = [
    { id: 'pool', label: 'Talent pool', short: 'Pool', icon: Users, count: poolTotal || undefined },
    ...(net?.pilot ? [{ id: 'network' as const, label: 'Open to work', short: 'Network', icon: Compass, count: net.people?.length || undefined }] : []),
    { id: 'upload', label: 'Upload resumes', short: 'Upload', icon: FileUp, count: uploads.length || undefined },
    { id: 'manual', label: 'Add by hand', short: 'By hand', icon: PenLine },
  ];

  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-title" className="w-full sm:max-w-2xl h-[92dvh] sm:h-[min(720px,90dvh)] flex flex-col rounded-t-[16px] sm:rounded-[16px] bg-white dark:bg-gray-900 shadow-xl font-jakarta overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h2 id="add-title" ref={titleRef} tabIndex={-1} className="portal-dialog-title">Add candidates</h2>
              <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">to <span className="font-semibold text-gray-800 dark:text-gray-200">{jobTitle}</span></p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
          </div>
          <div role="tablist" aria-label="How to add" className="mt-3 flex gap-1 overflow-x-auto -mx-1 px-1 border-b border-gray-200 dark:border-gray-800">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} type="button" role="tab" id={`add-tab-${t.id}`} aria-selected={on} aria-controls={`add-panel-${t.id}`} onClick={() => setTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 -mb-px border-b-2 text-sm font-semibold transition-colors ${on ? 'border-brand text-brand' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                  <t.icon className="w-4 h-4" aria-hidden /> <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>
                  {t.count != null && <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${on ? 'bg-brand/10' : 'bg-gray-100 dark:bg-gray-800'}`}>{t.count}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div role="tabpanel" id={`add-panel-${tab}`} aria-labelledby={`add-tab-${tab}`} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
          {tab === 'pool' && <PoolTab jobId={jobId} people={pool} total={poolTotal} onInvited={onInvited} onUpload={() => setTab('upload')} />}

          {tab === 'network' && net?.pilot && <NetworkTab jobId={jobId} data={net} onSent={onInvited} />}

          {tab === 'upload' && (
            <div className="space-y-3">
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx" className="hidden" onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
                className={`w-full rounded-[14px] border-2 border-dashed px-4 ${uploads.length ? 'py-4' : 'py-10'} flex flex-col items-center text-center gap-1.5 transition-colors ${dragging ? 'border-brand bg-brand/5' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                <span className="w-10 h-10 rounded-full bg-brand/10 text-brand inline-flex items-center justify-center"><UploadCloud className="w-5 h-5" aria-hidden /></span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{uploads.length ? 'Add more resumes' : 'Drop resumes here, or click to choose'}</span>
                <span className="text-xs text-gray-500">PDF or Word, up to 25 at once, 5 MB each. We fill in the details for you to check.</span>
              </button>
              <DraftList rows={uploads} set={set} remove={(k) => setRows((rs) => rs.filter((x) => x.key !== k))} />
            </div>
          )}

          {tab === 'manual' && (
            <div className="space-y-3">
              <DraftList rows={manual} set={set} remove={(k) => setRows((rs) => rs.filter((x) => x.key !== k))} />
              <button type="button" className={ghost} onClick={() => setRows((rs) => [...rs, blank()])}><Plus className="w-4 h-4" aria-hidden /> Add another person</button>
            </div>
          )}
        </div>

        {/* Footer: sourcing tabs only (pool and network send from each row) */}
        {(tab === 'upload' || tab === 'manual') && (
          <div className="border-t border-gray-200 dark:border-gray-800 px-4 sm:px-6 py-3 bg-gray-50/70 dark:bg-gray-900">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[150px] flex-1 sm:flex-none">
                <label htmlFor="add-ch" className={small}>Where you found them</label>
                <select id="add-ch" value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>{SOURCING_CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              {channel === 'Other' && <div className="min-w-[130px] flex-1 sm:flex-none"><label htmlFor="add-oth" className={small}>Name it</label><input id="add-oth" value={other} onChange={(e) => setOther(e.target.value)} className={input} maxLength={40} placeholder="e.g. Hackathon" /></div>}
              <div className="flex gap-2 ml-auto">
                <button type="button" className={ghost} onClick={onClose}>{anySaved ? 'Done' : 'Cancel'}</button>
                <button type="button" className="btn-brand gap-1.5 disabled:opacity-50" disabled={busy || !pending.length || pending.some((r) => r.status === 'reading')} onClick={saveAll}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserPlus className="w-4 h-4" aria-hidden />} Add {pending.length || ''} to sourcing
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">They wait in the sourcing lane until you contact them and they’re interested. They don’t count as applicants before that.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Past applicants who match this job. Inviting emails them a link to apply; nobody is added without applying. */
function PoolTab({ jobId, people, total, onInvited, onUpload }: { jobId: string; people: PoolPerson[] | null; total: number; onInvited?: (msg: string) => void; onUpload: () => void }) {
  const [q, setQ] = useState('');
  const [strong, setStrong] = useState(false);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people ?? []).filter((p) => (!strong || p.score >= 80) && (!term || `${p.fullName} ${p.currentTitle ?? ''} ${p.city ?? ''} ${p.skills.join(' ')}`.toLowerCase().includes(term)));
  }, [people, q, strong]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [q, strong]);

  async function invite(ids: string[], key: string) {
    setSending(key); setNote('');
    try {
      const res = await fetch('/api/employer/talent/invite-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: jobId, applicationIds: ids }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNote(d.error || 'Couldn’t send the invite.'); return; }
      const done: string[] = d.invitedIds ?? [];
      setInvited((s) => new Set([...s, ...done]));
      setPicked((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; });
      const msg = `Invited ${done.length} ${done.length === 1 ? 'person' : 'people'} to apply.${d.skippedForCap ? ` ${d.skippedForCap} not sent: daily limit reached.` : ''}`;
      setNote(msg); onInvited?.(msg);
    } catch { setNote('You seem to be offline.'); } finally { setSending(null); }
  }

  if (people === null) return <div className="py-16 flex justify-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin" aria-label="Loading" /></div>;
  if (people.length === 0) {
    return (
      <div className="py-12 text-center">
        <span className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 inline-flex items-center justify-center"><Users className="w-6 h-6 text-gray-400" aria-hidden /></span>
        <p className="mt-3 font-semibold text-gray-900 dark:text-white">No past applicants match this role yet</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">People who apply to your jobs and agree to hear about other roles show up here when they fit.</p>
        <button type="button" onClick={onUpload} className={`${ghost} mt-4`}><FileUp className="w-4 h-4" aria-hidden /> Upload resumes instead</button>
      </div>
    );
  }

  const pickable = shown.filter((p) => !invited.has(p.id));
  const allPicked = pickable.length > 0 && pickable.every((p) => picked.has(p.id));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, role, city or skill" aria-label="Search the talent pool" className={`${input} pl-9`} />
        </div>
        <div className="inline-flex p-0.5 rounded-[10px] bg-gray-100 dark:bg-gray-800 text-[13px] font-semibold">
          {[[false, 'All matches'], [true, '80%+ match']].map(([v, l]) => (
            <button key={String(v)} type="button" aria-pressed={strong === v} onClick={() => setStrong(v as boolean)}
              className={`min-h-[36px] px-3 rounded-[8px] ${strong === v ? 'bg-white dark:bg-gray-950 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}>{l as string}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-400">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={allPicked} disabled={!pickable.length} onChange={() => setPicked((s) => { const n = new Set(s); pickable.forEach((p) => (allPicked ? n.delete(p.id) : n.add(p.id))); return n; })} />
          Select page
        </label>
        <span className="ml-auto inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-brand" aria-hidden /> Ranked by fit for this job</span>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Nobody matches that search.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((p) => {
            const done = invited.has(p.id);
            const meta = [p.currentTitle, p.city, p.experienceYears != null ? `${yearsText(p.experienceYears)} exp` : null].filter(Boolean).join(' · ');
            const st = stageStyle(p.stageRank);
            const hit = new Set(p.matchedSkills.map(normalizeSkill));
            return (
              <li key={p.id} className={`flex items-start gap-3 rounded-[12px] border px-3 py-2.5 transition-colors ${picked.has(p.id) ? 'border-brand/40 bg-brand/5' : 'border-gray-300 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-700'}`}>
                <input type="checkbox" aria-label={`Select ${p.fullName}`} checked={picked.has(p.id) || done} disabled={done} className="mt-3"
                  onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-700 text-gray-800 dark:text-gray-200 text-sm font-bold inline-flex items-center justify-center" aria-hidden>{initials(p.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">{p.fullName}</span>
                    <span className={`shrink-0 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full border ${p.score >= 80 ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-900/30 dark:border-transparent dark:text-emerald-300' : 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-transparent dark:text-amber-300'}`}>{p.score}% fit</span>
                  </p>
                  {meta && <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">{meta}</p>}
                  <p className="text-xs mt-0.5 truncate">
                    <span className={`inline-flex items-center gap-1 font-semibold ${st.text}`}><span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} aria-hidden />{st.star && <Star className="w-3 h-3 fill-current" aria-hidden />}{p.stage}</span>
                    <span className="text-gray-500"> · for {p.appliedFor} · {new Date(p.appliedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                  </p>
                  {(p.skills.length > 0 || p.missingMustHaves.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.skills.slice(0, 5).map((sk) => {
                        const ok = hit.has(normalizeSkill(sk));
                        return <span key={sk} className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${ok ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-900/30 dark:border-transparent dark:text-emerald-300' : 'bg-white border-gray-300 dark:bg-gray-800 dark:border-transparent text-gray-800 dark:text-gray-300'}`}>{ok && <Check className="w-3 h-3" aria-hidden />}{sk}</span>;
                      })}
                      {p.skills.length > 5 && <span className="text-[11px] text-gray-500 px-1 py-0.5">+{p.skills.length - 5}</span>}
                      {p.missingMustHaves.slice(0, 2).map((m) => <span key={`m-${m}`} title="Must-have they don’t list" className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full border border-red-300 bg-red-50 text-red-800 dark:border-transparent dark:bg-red-900/30 dark:text-red-300"><X className="w-3 h-3" aria-hidden />{m}</span>)}
                    </div>
                  )}
                </div>
                {done ? (
                  <span className="shrink-0 inline-flex items-center gap-1 min-h-[36px] px-3 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"><Check className="w-4 h-4" aria-hidden /> Invited</span>
                ) : (
                  <button type="button" onClick={() => invite([p.id], p.id)} disabled={!!sending}
                    className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-brand/30 text-brand text-[13px] font-semibold hover:bg-brand/5 disabled:opacity-50">
                    {sending === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Mail className="w-3.5 h-3.5" aria-hidden />}<span className="hidden sm:inline">Invite</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {note && <p role="status" className="text-[13px] text-gray-700 dark:text-gray-300">{note}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[13px] text-gray-600 dark:text-gray-400 tabular-nums">{list.length} {list.length === 1 ? 'person' : 'people'}{total > (people?.length ?? 0) ? ` (top ${people.length} of ${total})` : ''}</span>
        {pages > 1 && (
          <nav aria-label="Pages" className="inline-flex items-center gap-1 ml-auto">
            <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronLeft className="w-4 h-4" aria-hidden /></button>
            {Array.from({ length: pages }, (_, i) => i).filter((i) => pages <= 7 || Math.abs(i - page) <= 2 || i === 0 || i === pages - 1).map((i) => (
              <button key={i} type="button" aria-current={i === page ? 'page' : undefined} onClick={() => setPage(i)}
                className={`min-w-8 h-8 px-2 rounded-[8px] text-[13px] font-semibold tabular-nums ${i === page ? 'border border-brand text-brand' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{i + 1}</button>
            ))}
            <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronRight className="w-4 h-4" aria-hidden /></button>
          </nav>
        )}
      </div>

      {picked.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-2 rounded-[12px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-3 py-2 shadow-lg">
          <span className="text-sm font-semibold flex-1">{picked.size} selected</span>
          <button type="button" onClick={() => setPicked(new Set())} className="text-[13px] font-semibold opacity-80 hover:opacity-100 px-2 min-h-[36px]">Clear</button>
          <button type="button" disabled={!!sending} onClick={() => invite([...picked].slice(0, 50), 'bulk')}
            className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-[13px] font-semibold disabled:opacity-60">
            {sending === 'bulk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Mail className="w-3.5 h-3.5" aria-hidden />} Invite {Math.min(picked.size, 50)} to apply
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500">These people agreed to hear about other roles. Each gets one email with a link to apply; nobody is invited twice. <Link href="/employer/talent" className="underline">Open the full talent pool</Link></p>
    </div>
  );
}

/** Editable people from uploads or typed in by hand. */
function DraftList({ rows, set, remove }: { rows: Draft[]; set: (key: string, patch: Partial<Draft>) => void; remove: (key: string) => void }) {
  if (!rows.length) return null;
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.key} className={`rounded-[12px] border p-3 space-y-2 ${r.status === 'saved' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10' : r.status === 'error' ? 'border-red-200 dark:border-red-900/50' : 'border-gray-200 dark:border-gray-800'}`}>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold inline-flex items-center justify-center" aria-hidden>
              {r.status === 'saved' ? <Check className="w-4 h-4 text-emerald-700" /> : r.fullName ? initials(r.fullName) : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{r.fullName || (r.file ? r.file.name : `Person ${i + 1}`)}</p>
              {r.file && r.fullName && <p className="text-xs text-gray-500 truncate">{r.file.name}</p>}
            </div>
            {r.status === 'reading' && <span className="inline-flex items-center gap-1 text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Reading…</span>}
            {r.usedAi && r.status === 'ready' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 px-2 py-0.5 rounded-full"><Sparkles className="w-3 h-3" aria-hidden /> Filled by AI: check it</span>}
            {r.status === 'saved' && <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Added{r.duplicates ? ` · ${r.duplicates} possible duplicate${r.duplicates === 1 ? '' : 's'}` : ''}</span>}
            {r.status !== 'saved' && <button type="button" aria-label="Remove" onClick={() => remove(r.key)} className="w-8 h-8 flex items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><Trash2 className="w-4 h-4" aria-hidden /></button>}
          </div>
          {r.status !== 'saved' && r.status !== 'reading' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FIELDS.map(([k, l]) => (
                <div key={k}>
                  <label htmlFor={`${r.key}-${k}`} className={small}>{l}</label>
                  <input id={`${r.key}-${k}`} value={r[k]} onChange={(e) => set(r.key, { [k]: e.target.value } as Partial<Draft>)} className={input}
                    type={k === 'email' ? 'email' : k === 'experienceYears' ? 'number' : 'text'} inputMode={k === 'phone' ? 'tel' : undefined} min={k === 'experienceYears' ? 0 : undefined} />
                </div>
              ))}
              <div className="sm:col-span-2"><label htmlFor={`${r.key}-note`} className={small}>Note for your team</label><input id={`${r.key}-note`} value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} className={input} /></div>
            </div>
          )}
          {r.error && <p role="alert" className="text-[13px] text-red-700 dark:text-red-400">{r.error}</p>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Anonymous "Open to opportunities" people, ranked for this job. A request sends a short note for this job; the
 * person sees the company and decides. Nothing about them is shared unless they accept and apply.
 */
function NetworkTab({ jobId, data, onSent }: { jobId: string; data: NetData; onSent?: (msg: string) => void }) {
  const [access, setAccess] = useState(data.access!);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const people = useMemo(() => data.people ?? [], [data.people]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? people.filter((p) => `${p.headline} ${p.skills.join(' ')} ${p.city ?? ''}`.toLowerCase().includes(term)) : people;
  }, [people, q]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [q]);

  async function send(profileId: string) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/employer/network/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, listingId: jobId, message }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || 'Couldn’t send the request.'); return; }
      setSent((s) => new Set(s).add(profileId));
      setAccess((a) => ({ ...a, left: d.left, used: a.allowance - d.left }));
      setOpen(null); setMessage('');
      onSent?.(`Request sent. If they accept, they apply and land in your pipeline. ${d.left} left this month.`);
    } catch { setError('You seem to be offline.'); } finally { setBusy(false); }
  }

  if (!data.jobOpen) {
    return <p className="py-12 text-center text-sm text-gray-600 dark:text-gray-400">Requests are for open jobs. Publish this job to ask people on the network to apply.</p>;
  }
  const pct = access.allowance ? Math.min(100, Math.round((access.used / access.allowance) * 100)) : 100;
  const canSend = access.allowed && access.left > 0;

  return (
    <div className="space-y-3">
      <div className="rounded-[12px] border border-gray-200 dark:border-gray-800 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{access.left} of {access.allowance} requests left</span>
          <span className="text-gray-500">this month</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" aria-hidden><div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} /></div>
        {access.reason === 'paused' && <p className="mt-2 text-[13px] text-amber-800 dark:text-amber-300">Requests are paused while we look at a report. This usually takes a working day.</p>}
      </div>

      {people.length === 0 ? (
        <div className="py-10 text-center">
          <span className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 inline-flex items-center justify-center"><Compass className="w-6 h-6 text-gray-400" aria-hidden /></span>
          <p className="mt-3 font-semibold text-gray-900 dark:text-white">Nobody on the network yet</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">Job seekers who turn on Open to opportunities show up here, without their name or contact details.</p>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by role, skill or city" aria-label="Search the network" className={`${input} pl-9`} />
          </div>
          <ul className="space-y-2">
            {shown.map((p) => {
              const asked = sent.has(p.id) || !!p.requestedAt;
              const facts = [p.experienceYears != null ? `${yearsText(p.experienceYears)} exp` : null, p.currentCompany ? `at ${p.currentCompany}` : null].filter(Boolean).join(' ');
              const notice = noticeText(p.noticePeriodDays);
              const len = message.trim().length;
              return (
                <li key={p.id} className={`rounded-[12px] border px-3 py-2.5 ${open === p.id ? 'border-brand/40 bg-brand/5' : 'border-gray-200 dark:border-gray-800'}`}>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 inline-flex items-center justify-center" aria-hidden><UserRound className="w-5 h-5 text-gray-400" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">{p.headline}</span>
                        <span className={`shrink-0 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${p.score >= 75 ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : p.score >= 50 ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>{p.score}%</span>
                      </p>
                      <p className="text-[13px] text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-3">
                        {facts && <span>{facts}</span>}
                        {p.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden />{p.city}</span>}
                        <span>{WORK_MODES[p.workMode]}</span>
                        {notice && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden />{notice}</span>}
                      </p>
                      {p.skills.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.skills.slice(0, 5).map((s) => <span key={s} className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{s}</span>)}
                          {p.skills.length > 5 && <span className="text-[11px] text-gray-500 px-1">+{p.skills.length - 5}</span>}
                        </div>
                      )}
                    </div>
                    {asked ? (
                      <span className="shrink-0 inline-flex items-center gap-1 min-h-[36px] px-2 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"><Check className="w-4 h-4" aria-hidden /> Requested</span>
                    ) : (
                      <button type="button" disabled={!canSend} aria-expanded={open === p.id} onClick={() => { setOpen(open === p.id ? null : p.id); setError(''); }}
                        className="shrink-0 inline-flex items-center gap-1 min-h-[36px] px-3 rounded-[10px] border border-brand/30 text-brand text-[13px] font-semibold hover:bg-brand/5 disabled:opacity-50">
                        <span className="hidden sm:inline">Request</span><ChevronDown className={`w-4 h-4 transition-transform ${open === p.id ? 'rotate-180' : ''}`} aria-hidden />
                        <span className="sr-only sm:hidden">Request intro</span>
                      </button>
                    )}
                  </div>
                  {open === p.id && (
                    <div className="mt-3 pt-3 border-t border-gray-200/70 dark:border-gray-800 space-y-2">
                      <label htmlFor={`nw-${p.id}`} className={small}>Your note: why this role, and why them</label>
                      <textarea id={`nw-${p.id}`} rows={3} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus
                        placeholder="e.g. “We’re building retrieval for legal docs and your RAG + PyTorch work stood out…”"
                        className="w-full px-3 py-2 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs tabular-nums ${len > 0 && len < MESSAGE_MIN ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>{len < MESSAGE_MIN ? `At least ${MESSAGE_MIN} characters (${len} so far)` : `${len}/${MESSAGE_MAX}`}</span>
                        <button type="button" onClick={() => setOpen(null)} className="ml-auto min-h-[36px] px-3 text-[13px] font-semibold text-gray-600 dark:text-gray-300">Cancel</button>
                        <button type="button" disabled={busy || len < MESSAGE_MIN} onClick={() => send(p.id)} className="btn-brand gap-1.5 disabled:opacity-50">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Mail className="w-4 h-4" aria-hidden />} Send request
                        </button>
                      </div>
                      {error && <p role="alert" className="text-[13px] text-red-700 dark:text-red-400">{error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="py-8 text-center text-sm text-gray-500">Nobody matches that search.</li>}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-end gap-1">
              <button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((n) => n - 1)} className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronLeft className="w-4 h-4" aria-hidden /></button>
              <span className="text-[13px] tabular-nums text-gray-600 dark:text-gray-400 px-2">{page + 1} / {pages}</span>
              <button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)} className="w-8 h-8 inline-flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronRight className="w-4 h-4" aria-hidden /></button>
            </nav>
          )}
        </>
      )}
      <p className="text-xs text-gray-500">You see skills and experience, never names or contact details. They get your note for this job and decide; requests expire after {REQUEST_EXPIRE_DAYS} days. <Link href="/employer/talent/network" className="underline">Open Discover</Link></p>
    </div>
  );
}
