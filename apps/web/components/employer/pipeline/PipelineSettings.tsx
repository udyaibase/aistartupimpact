'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Settings2, Trash2, X } from 'lucide-react';
import AssessmentEditor, { EMPTY_ASSESSMENT } from './AssessmentEditor';
import type { AssessmentConfig } from '@/lib/employer/assessment-config';

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const ghost = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200';

interface Config { assessment: AssessmentConfig | null; rounds: string[] }
interface Template { key: string; name: string; family: string; builtIn: boolean; version: number; config: Config; description: string }
interface Impact { openAssessments: { id: string; candidate: string; status: string }[]; bookedInterviews: { id: string; candidate: string; round: string; startAt: string }[]; inRemovedRounds: { id: string; candidate: string; round: string }[] }
interface Data {
  job: { id: string; title: string; template: string; version: number; config: Config; decisionOwnerEmail: string | null; decisionDelegateEmail: string | null; recruitersSeeOffers: boolean };
  templates: Template[]; people: { email: string; name: string; role: string }[]; canEditPeople: boolean;
}


/**
 * A job's pipeline: template, steps (interview rounds, optional assessment), who records the final decision, and
 * who sees offer amounts. Changes that affect people in progress show who first, then let those finish or cancel them.
 */
export default function PipelineSettings({ jobId, onClose, onSaved }: { jobId: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [template, setTemplate] = useState('');
  const [cfg, setCfg] = useState<Config | null>(null);
  const [owner, setOwner] = useState('');
  const [delegate, setDelegate] = useState('');
  const [seeOffers, setSeeOffers] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [saveAs, setSaveAs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch(`/api/employer/jobs/${jobId}/pipeline`).then((r) => r.json()).then((data: Data) => {
      if (!data.job) { setError('Couldn’t load the pipeline.'); return; }
      setD(data); setTemplate(data.job.template); setCfg(data.job.config);
      setOwner(data.job.decisionOwnerEmail ?? ''); setDelegate(data.job.decisionDelegateEmail ?? ''); setSeeOffers(data.job.recruitersSeeOffers);
      setTimeout(() => titleRef.current?.focus(), 0);
    }).catch(() => setError('You seem to be offline.'));
  }, [jobId]);

  function pickTemplate(key: string) {
    const t = d?.templates.find((x) => x.key === key);
    if (!t) return;
    setTemplate(key); setCfg(JSON.parse(JSON.stringify(t.config)));
  }

  async function save(affected?: 'finish' | 'cancel') {
    if (!d || !cfg) return;
    setBusy(true); setError('');
    const body: Record<string, unknown> = { config: cfg, ...(template !== d.job.template ? { template } : {}), ...(affected ? { affected } : {}) };
    if (d.canEditPeople) Object.assign(body, { decisionOwnerEmail: owner || null, decisionDelegateEmail: delegate || null, recruitersSeeOffers: seeOffers });
    const res = await fetch(`/api/employer/jobs/${jobId}/pipeline`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: 'You seem to be offline.' };
    setBusy(false);
    if (res?.status === 409 && data.needsChoice) { setImpact(data.impact); return; }
    if (!res?.ok) { setError(data.error || 'Couldn’t save.'); return; }
    if (saveAs.trim()) {
      const t = await fetch('/api/employer/pipeline-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: saveAs, config: cfg }) }).catch(() => null);
      if (!t?.ok) { const e = await t?.json().catch(() => ({})); setError(e?.error || 'Saved the job, but not the template.'); return; }
    }
    onSaved(saveAs.trim() ? `Pipeline saved, and saved as the template “${saveAs.trim()}”.` : 'Pipeline saved.');
  }

  const setRound = (i: number, v: string) => setCfg((c) => c && ({ ...c, rounds: c.rounds.map((r, j) => (j === i ? v : r)) }));
  const a = cfg?.assessment;

  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby="pl-title" className="w-full sm:max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-[16px] sm:rounded-[16px] bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xl font-jakarta space-y-4">
        <div className="flex items-start gap-2">
          <h2 id="pl-title" ref={titleRef} tabIndex={-1} className="portal-dialog-title flex-1 flex items-center gap-2"><Settings2 className="w-5 h-5" aria-hidden /> Pipeline{d ? `: ${d.job.title}` : ''}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        {!d || !cfg ? (error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />) : impact ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-800 dark:text-gray-200 font-semibold">This change affects people already in progress:</p>
            <ul className="text-[13px] list-disc pl-5 space-y-0.5 text-gray-700 dark:text-gray-300">
              {impact.openAssessments.map((x) => <li key={x.id}>{x.candidate}: assessment {x.status === 'SENT' ? 'not submitted yet' : 'submitted, not scored'}</li>)}
              {impact.bookedInterviews.map((x) => <li key={x.id}>{x.candidate}: {x.round} interview on {new Date(x.startAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</li>)}
              {impact.inRemovedRounds.map((x) => <li key={x.id}>{x.candidate}: in the {/\bround$/i.test(x.round) ? x.round : `${x.round} round`} (moves to the first remaining round)</li>)}
            </ul>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" className={btn} disabled={busy} onClick={() => save('finish')}>Let them finish</button>
              <button type="button" className={ghost} disabled={busy} onClick={() => save('cancel')}>Cancel them (candidates are told)</button>
              <button type="button" className={ghost} onClick={() => setImpact(null)}>Back</button>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="pl-tpl" className={label}>Template</label>
              <select id="pl-tpl" value={template} onChange={(e) => pickTemplate(e.target.value)} className={input}>
                {Array.from(new Set(d.templates.map((t) => t.family))).map((f) => (
                  <optgroup key={f} label={f}>
                    {d.templates.filter((t) => t.family === f).map((t) => <option key={t.key} value={t.key}>{t.name}{t.builtIn ? '' : ` (v${t.version})`}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{d.templates.find((t) => t.key === template)?.description}</p>
              <p className="mt-0.5 text-xs text-gray-500">Changing a template later only affects new jobs. You can adjust the steps below for this job.</p>
            </div>

            <div>
              <p className={label}>Interview rounds</p>
              <ol className="space-y-1.5">
                {cfg.rounds.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <label htmlFor={`pl-r${i}`} className="sr-only">Round {i + 1}</label>
                    <input id={`pl-r${i}`} value={r} maxLength={40} onChange={(e) => setRound(i, e.target.value)} className={input} />
                    {cfg.rounds.length > 1 && <button type="button" aria-label={`Remove ${r}`} onClick={() => setCfg({ ...cfg, rounds: cfg.rounds.filter((_, j) => j !== i) })} className="w-10 h-10 flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800"><Trash2 className="w-4 h-4" aria-hidden /></button>}
                  </li>
                ))}
              </ol>
              {cfg.rounds.length < 6 && <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold underline" onClick={() => setCfg({ ...cfg, rounds: [...cfg.rounds, ''] })}><Plus className="w-3.5 h-3.5" aria-hidden /> Add a round</button>}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><input type="checkbox" checked={!!a} onChange={(e) => setCfg({ ...cfg, assessment: e.target.checked ? EMPTY_ASSESSMENT : null })} className="w-4 h-4 accent-[#A50F15]" /> Assessment before interviews</label>
              {a && <div className="pl-6"><AssessmentEditor value={a} onChange={(v) => setCfg({ ...cfg, assessment: v })} /></div>}
            </div>

            {d.canEditPeople ? (
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label htmlFor="pl-o" className={label}>Final decision owner</label>
                  <select id="pl-o" value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
                    <option value="">Workspace owners</option>{d.people.map((p) => <option key={p.email} value={p.email}>{p.name} ({p.role.toLowerCase()})</option>)}
                  </select></div>
                <div><label htmlFor="pl-dl" className={label}>Delegate <span className="font-normal text-gray-500">(optional)</span></label>
                  <select id="pl-dl" value={delegate} onChange={(e) => setDelegate(e.target.value)} className={input}>
                    <option value="">None</option>{d.people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
                  </select></div>
                <label className="sm:col-span-2 flex items-center gap-2 text-[13px] text-gray-800 dark:text-gray-200"><input type="checkbox" checked={seeOffers} onChange={(e) => setSeeOffers(e.target.checked)} className="w-4 h-4 accent-[#A50F15]" /> Recruiters can see offer amounts on this job</label>
              </div>
            ) : <p className="text-xs text-gray-500">Only owners change who decides and who sees offers.</p>}

            <div><label htmlFor="pl-sa" className={label}>Also save as a template <span className="font-normal text-gray-500">(optional)</span></label><input id="pl-sa" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} className={input} maxLength={60} placeholder="e.g. AI engineering" /></div>

            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" className={ghost} onClick={onClose}>Cancel</button><button type="button" className={btn} disabled={busy} onClick={() => save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save</button></div>
          </>
        )}
      </div>
    </div>
  );
}
