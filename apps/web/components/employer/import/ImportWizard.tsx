'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Download, FileUp, Loader2, Undo2, Upload } from 'lucide-react';
import {
  cleanRows, distinctValues, guessMapping, guessStage, IMPORT_FIELDS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, parseCsv, PIPELINE_STAGES, STAGE_LABEL,
  type ColumnMapping, type ImportField, type JobChoice, type PipelineStage,
} from '@/lib/employer/import-csv';

type Job = { id: string; title: string; status: string };
type Step = 'file' | 'columns' | 'jobs' | 'preview' | 'running' | 'report';
type PastImport = {
  id: string; fileName: string; status: string; totalRows: number; cursor: number; created: number; skipped: number; failed: number; resumes: number;
  createdBy: string; createdAt: string; finishedAt: string | null; undoneAt: string | null; canUndo: boolean;
};

const ALL = '__all__';
const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50';
const ghost = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200';
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-6';
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function call(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, { ...init, headers: init?.body instanceof Blob ? init.headers : { 'Content-Type': 'application/json', ...init?.headers } });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch { return { ok: false, data: { error: 'You seem to be offline. Check your connection and try again.' } }; }
}

/**
 * Import candidates from a CSV (another hiring tool or a spreadsheet), with an optional ZIP of resumes:
 * file → columns → jobs and stages → preview → import (in chunks) → report. Undo for 7 days.
 */
export default function ImportWizard({ jobs }: { jobs: Job[] }) {
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [jobChoices, setJobChoices] = useState<Record<string, JobChoice>>({});
  const [allJob, setAllJob] = useState<JobChoice>({ kind: 'skip' });
  const [stageChoices, setStageChoices] = useState<Record<string, PipelineStage>>({});
  const [zip, setZip] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ label: '', done: 0, total: 0 });
  const [result, setResult] = useState<{ id: string; created: number; skipped: number; problems: number; resumes: number; resumeMisses: number } | null>(null);
  const [past, setPast] = useState<PastImport[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);

  const loadPast = async () => { const r = await call('/api/employer/import'); if (r.ok) setPast(r.data.imports); };
  useEffect(() => { void loadPast(); }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);

  const headers = table[0] ?? [];
  const rows = useMemo(() => table.slice(1), [table]);
  const jobValues = useMemo(() => distinctValues(rows, mapping.job), [rows, mapping.job]);
  const stageValues = useMemo(() => distinctValues(rows, mapping.stage, 100), [rows, mapping.stage]);
  const jobsForClean = mapping.job != null ? jobChoices : { [ALL]: allJob };
  const preview = useMemo(
    () => (step === 'preview' || step === 'jobs') && mapping.email != null
      ? cleanRows({ rows, mapping, jobs: jobsForClean, stages: stageChoices, defaultJob: mapping.job == null ? ALL : undefined })
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, rows, mapping, jobChoices, allJob, stageChoices],
  );

  async function chooseFile(f: File | undefined) {
    setError('');
    if (!f) return;
    if (f.size > IMPORT_MAX_BYTES) { setError('The file is over 4 MB. Split it into smaller files.'); return; }
    const text = await f.text();
    const t = parseCsv(text);
    if (t.length < 2) { setError('The file needs a header row and at least one candidate. Save it as CSV (comma separated) and try again.'); return; }
    if (t.length - 1 > IMPORT_MAX_ROWS) { setError(`Up to ${IMPORT_MAX_ROWS.toLocaleString('en-IN')} candidates per file. Split it and import each part.`); return; }
    setFileName(f.name); setCsv(text); setTable(t); setMapping(guessMapping(t[0]));
  }

  function toJobs() {
    if (mapping.email == null) { setError('Choose the column with each candidate’s email.'); return; }
    setError('');
    // Match job values to existing jobs by title; otherwise keep them as closed jobs for history.
    const byTitle = new Map(jobs.map((j) => [norm(j.title), j.id]));
    const byId = new Set(jobs.map((j) => j.id));
    setJobChoices(Object.fromEntries(jobValues.map(({ value }) => {
      const id = byId.has(value) ? value : byTitle.get(norm(value));
      return [value, (jobChoices[value] ?? (id ? { kind: 'existing', listingId: id } : { kind: 'new' })) as JobChoice];
    })));
    setStageChoices(Object.fromEntries(stageValues.map(({ value }) => [value, stageChoices[value] ?? guessStage(value)])));
    if (mapping.job == null && allJob.kind === 'skip' && jobs[0]) setAllJob({ kind: 'existing', listingId: jobs[0].id });
    setStep('jobs');
  }

  /** Resumes from the ZIP, matched to candidates by the resume column, or by email or name in the file name. */
  async function resumesFromZip(): Promise<{ email: string; bytes: Uint8Array }[]> {
    if (!zip || !preview) return [];
    const { unzipSync } = await import('fflate');
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()), { filter: (f) => /\.(pdf|docx)$/i.test(f.name) && !f.name.startsWith('__MACOSX') && f.originalSize <= 5 * 1024 * 1024 });
    const entries = Object.entries(files).map(([path, bytes]) => ({ base: path.split('/').pop()!, bytes }));
    const out = new Map<string, Uint8Array>();
    for (const r of preview.rows) {
      if (out.has(r.email)) continue;
      const hit = entries.find((e) => r.resumeFile && e.base.toLowerCase() === r.resumeFile.toLowerCase())
        ?? entries.find((e) => e.base.toLowerCase().includes(r.email))
        ?? (norm(r.fullName).length >= 6 ? entries.find((e) => norm(e.base).includes(norm(r.fullName))) : undefined);
      if (hit) out.set(r.email, hit.bytes);
    }
    return Array.from(out, ([email, bytes]) => ({ email, bytes }));
  }

  async function run() {
    if (!preview) return;
    setBusy(true); setError('');
    const start = await call('/api/employer/import', {
      method: 'POST',
      body: JSON.stringify({ fileName, csv, mapping, jobs: jobsForClean, stages: stageChoices, defaultJob: mapping.job == null ? ALL : undefined }),
    });
    if (!start.ok) { setError(start.data.error || 'Couldn’t start the import.'); setBusy(false); return; }
    const id: string = start.data.id;
    setStep('running');
    setProgress({ label: 'Importing candidates', done: 0, total: start.data.total });
    let last = { created: 0, skipped: 0 };
    for (let tries = 0; tries < 200; tries++) {
      const r = await call(`/api/employer/import/${id}/run`, { method: 'POST' });
      if (!r.ok) { setError(`${r.data.error || 'The import stopped.'} Open this page again to see what was imported, or undo it.`); setBusy(false); void loadPast(); return; }
      last = { created: r.data.created, skipped: r.data.skipped };
      setProgress({ label: 'Importing candidates', done: r.data.cursor, total: r.data.total });
      if (r.data.done) break;
    }
    let resumes = 0;
    let misses = 0;
    if (zip) {
      setProgress({ label: 'Reading the resumes ZIP', done: 0, total: 1 });
      const list = await resumesFromZip().catch(() => { setError('Couldn’t open the ZIP. The candidates were imported without resumes.'); return []; });
      setProgress({ label: 'Attaching resumes', done: 0, total: list.length });
      for (let i = 0; i < list.length; i++) {
        const r = await call(`/api/employer/import/${id}/resume?email=${encodeURIComponent(list[i].email)}`, { method: 'POST', body: new Blob([list[i].bytes as BlobPart]), headers: { 'Content-Type': 'application/octet-stream' } });
        if (r.ok) resumes++; else misses++;
        setProgress({ label: 'Attaching resumes', done: i + 1, total: list.length });
      }
      misses += Math.max(0, new Set(preview.rows.map((r) => r.email)).size - list.length);
    }
    setResult({ id, ...last, problems: preview.problems.length, resumes, resumeMisses: misses });
    setBusy(false);
    setStep('report');
    void loadPast();
  }

  async function undo(p: PastImport) {
    if (!confirm(`Undo “${p.fileName}”? This removes the ${p.created} candidates it added, with their notes and resumes, and the closed jobs it created (if still empty).`)) return;
    const r = await call(`/api/employer/import/${p.id}/undo`, { method: 'POST' });
    setError(r.ok ? '' : r.data.error || 'Couldn’t undo.');
    if (r.ok && result?.id === p.id) setResult(null);
    void loadPast();
  }

  const sample = (col: number | undefined) => (col == null ? '' : rows.find((r) => r[col]?.trim())?.[col] ?? '');
  const jobSelect = (value: JobChoice, onChange: (c: JobChoice) => void, id: string) => (
    <select id={id} className={input} value={value.kind === 'existing' ? value.listingId : value.kind}
      onChange={(e) => onChange(e.target.value === 'new' ? { kind: 'new' } : e.target.value === 'skip' ? { kind: 'skip' } : { kind: 'existing', listingId: e.target.value })}>
      <optgroup label="Your jobs">{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.status !== 'OPEN' ? ` (${j.status.toLowerCase()})` : ''}</option>)}</optgroup>
      <option value="new">Keep as a closed job (history only)</option>
      <option value="skip">Don’t import these</option>
    </select>
  );

  return (
    <div className="font-jakarta max-w-3xl">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/employer/applications" aria-label="Back to candidates" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"><ArrowLeft className="w-5 h-5" aria-hidden /></Link>
        <div>
          <h1 className="portal-title" ref={heading} tabIndex={-1}>Import candidates</h1>
          <p className="portal-subtitle">Bring candidates over from another hiring tool or a spreadsheet. Nobody is emailed.</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 p-3 rounded-[10px] bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">{error}</p>}

      {step === 'file' && (
        <div className={`${card} space-y-5`}>
          <div>
            <label htmlFor="imp-file" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">CSV file of candidates</label>
            <p id="imp-file-hint" className="text-[13px] text-gray-600 dark:text-gray-400 mb-2">Export candidates from your old tool as CSV, or save a spreadsheet as CSV. One row per candidate per job, with a header row. Up to {IMPORT_MAX_ROWS.toLocaleString('en-IN')} rows and 4 MB.</p>
            <input id="imp-file" aria-describedby="imp-file-hint" type="file" accept=".csv,text/csv" onChange={(e) => chooseFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:min-h-[40px] file:px-4 file:rounded-[10px] file:border-0 file:bg-gray-900 file:text-white dark:file:bg-white dark:file:text-gray-900 file:font-semibold" />
            {fileName && <p className="mt-2 text-sm text-green-700 dark:text-green-400"><Check className="inline w-4 h-4" aria-hidden /> {fileName}: {rows.length.toLocaleString('en-IN')} rows, {headers.length} columns</p>}
          </div>
          <div>
            <label htmlFor="imp-zip" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Resumes <span className="font-normal text-gray-500">(optional ZIP)</span></label>
            <p id="imp-zip-hint" className="text-[13px] text-gray-600 dark:text-gray-400 mb-2">PDF or Word files. We match each one by the resume column in your CSV, or by the candidate’s email or name in the file name. Files stay in your browser until they’re matched.</p>
            <input id="imp-zip" aria-describedby="imp-zip-hint" type="file" accept=".zip,application/zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-[40px] file:px-4 file:rounded-[10px] file:border file:border-gray-300 file:bg-white file:font-semibold dark:file:bg-gray-900 dark:file:text-white" />
          </div>
          <div className="flex justify-end"><button type="button" className={btn} disabled={!table.length} onClick={() => setStep('columns')}>Next: match columns</button></div>
        </div>
      )}

      {step === 'columns' && (
        <div className={`${card} space-y-4`}>
          <div>
            <h2 className="portal-section-title">Which column holds what?</h2>
            <p className="text-[13px] text-gray-600 dark:text-gray-400">We guessed from your headers. Only email is required; leave the rest as “Not in my file” if you don’t have it.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`map-${f.key}`} className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1">{f.label}{'required' in f && f.required ? ' *' : ''}</label>
                <select id={`map-${f.key}`} className={input} value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                  <option value="">Not in my file</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
                {mapping[f.key] != null && <p className="mt-1 text-xs text-gray-500 truncate">e.g. {sample(mapping[f.key as ImportField]) || '(empty)'}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-between"><button type="button" className={ghost} onClick={() => setStep('file')}>Back</button><button type="button" className={btn} onClick={toJobs}>Next: jobs and stages</button></div>
        </div>
      )}

      {step === 'jobs' && (
        <div className={`${card} space-y-6`}>
          <section className="space-y-3">
            <h2 className="portal-section-title">Jobs</h2>
            {mapping.job == null ? (
              <div>
                <label htmlFor="job-all" className="block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1">Your file has no job column. Add everyone to</label>
                {jobSelect(allJob, setAllJob, 'job-all')}
              </div>
            ) : (
              <>
                <p className="text-[13px] text-gray-600 dark:text-gray-400">Match each job in your file to one of your jobs. Roles you no longer hire for can be kept as closed jobs: their candidates stay searchable, and nothing is shown publicly.</p>
                <ul className="space-y-2">
                  {jobValues.map(({ value, count }, i) => (
                    <li key={value} className="grid sm:grid-cols-[1fr_1fr] gap-2 items-center">
                      <label htmlFor={`job-${i}`} className="text-sm text-gray-900 dark:text-white truncate">{value} <span className="text-gray-500">({count})</span></label>
                      {jobSelect(jobChoices[value] ?? { kind: 'new' }, (c) => setJobChoices({ ...jobChoices, [value]: c }), `job-${i}`)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {mapping.stage != null && (
            <section className="space-y-3">
              <h2 className="portal-section-title">Stages</h2>
              <p className="text-[13px] text-gray-600 dark:text-gray-400">Where each stage from your old tool lands in your pipeline.</p>
              <ul className="space-y-2">
                {stageValues.map(({ value, count }, i) => (
                  <li key={value} className="grid sm:grid-cols-[1fr_1fr] gap-2 items-center">
                    <label htmlFor={`stage-${i}`} className="text-sm text-gray-900 dark:text-white truncate">{value} <span className="text-gray-500">({count})</span></label>
                    <select id={`stage-${i}`} className={input} value={stageChoices[value] ?? guessStage(value)} onChange={(e) => setStageChoices({ ...stageChoices, [value]: e.target.value as PipelineStage })}>
                      {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex justify-between"><button type="button" className={ghost} onClick={() => setStep('columns')}>Back</button><button type="button" className={btn} onClick={() => setStep('preview')}>Next: preview</button></div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className={`${card} space-y-5`}>
          <div>
            <h2 className="portal-section-title">Ready to import {preview.rows.length.toLocaleString('en-IN')} candidate{preview.rows.length === 1 ? '' : 's'}</h2>
            <ul className="mt-2 space-y-1 text-[13px] text-gray-700 dark:text-gray-300 list-disc pl-5">
              <li>Nobody is emailed, and nobody joins your talent pool.</li>
              <li>They show as “via Imported”, in the stage you chose, with the original applied date when your file has one.</li>
              <li>Candidates already in a job are left as they are. You can undo the whole import for 7 days.</li>
            </ul>
          </div>
          {preview.problems.length > 0 && (
            <details className="rounded-[10px] border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 p-3">
              <summary className="text-sm font-semibold text-amber-900 dark:text-amber-200 cursor-pointer">{preview.problems.length} row{preview.problems.length === 1 ? '' : 's'} won’t be imported</summary>
              <ul className="mt-2 text-[13px] text-amber-900 dark:text-amber-200 space-y-0.5 max-h-48 overflow-auto">
                {preview.problems.slice(0, 50).map((p) => <li key={p.row}>Row {p.row}{p.email ? ` (${p.email})` : ''}: {p.reason}</li>)}
              </ul>
            </details>
          )}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-[13px]">
              <caption className="sr-only">First rows to be imported</caption>
              <thead><tr className="text-left text-gray-500"><th className="py-1.5 px-2">Name</th><th className="py-1.5 px-2">Email</th><th className="py-1.5 px-2">Job</th><th className="py-1.5 px-2">Stage</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 8).map((r) => (
                  <tr key={r.row} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 px-2 text-gray-900 dark:text-white">{r.fullName}</td><td className="py-1.5 px-2">{r.email}</td>
                    <td className="py-1.5 px-2">{(() => { const c = jobsForClean[r.jobKey]; return c?.kind === 'existing' ? jobs.find((j) => j.id === c.listingId)?.title : `${r.jobKey} (closed)`; })()}</td>
                    <td className="py-1.5 px-2">{STAGE_LABEL[r.stage]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <button type="button" className={ghost} onClick={() => setStep('jobs')}>Back</button>
            <button type="button" className={btn} disabled={busy || !preview.rows.length} onClick={run}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Upload className="w-4 h-4" aria-hidden />} Import {preview.rows.length.toLocaleString('en-IN')}
            </button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div className={`${card} space-y-3`} aria-busy="true">
          <h2 className="portal-section-title">{progress.label}…</h2>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
            <div className="h-full bg-green-600 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 5}%` }} />
          </div>
          <p className="text-[13px] text-gray-600 dark:text-gray-400">{progress.done.toLocaleString('en-IN')} of {progress.total.toLocaleString('en-IN')}. Keep this page open.</p>
        </div>
      )}

      {step === 'report' && result && (
        <div className={`${card} space-y-4`}>
          <h2 className="portal-section-title flex items-center gap-2"><Check className="w-5 h-5 text-green-600" aria-hidden /> Import finished</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[['Imported', result.created], ['Already there', result.skipped], ['Not imported', result.problems], ['Resumes attached', result.resumes]].map(([l, n]) => (
              <div key={l} className="rounded-[10px] bg-gray-50 dark:bg-gray-800 p-3"><dt className="text-xs text-gray-500">{l}</dt><dd className="portal-stat-sm tabular-nums">{Number(n).toLocaleString('en-IN')}</dd></div>
            ))}
          </dl>
          {zip && result.resumeMisses > 0 && <p className="text-[13px] text-gray-600 dark:text-gray-400">{result.resumeMisses} candidate{result.resumeMisses === 1 ? '' : 's'} got no resume (no matching file, or not a PDF or Word file under 5 MB).</p>}
          <div className="flex flex-wrap gap-2">
            <Link href="/employer/applications" className={btn}>See candidates</Link>
            {(result.problems > 0 || result.skipped > 0) && <a href={`/api/employer/import/${result.id}/problems`} className={ghost}><Download className="w-4 h-4" aria-hidden /> Rows not imported (CSV)</a>}
          </div>
        </div>
      )}

      <section className="mt-8" aria-labelledby="past-h">
        <h2 id="past-h" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Past imports</h2>
        {past.length === 0 ? <p className="text-[13px] text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-[12px]">
            {past.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-[13px]">
                <FileUp className="w-4 h-4 text-gray-400" aria-hidden />
                <span className="font-semibold text-gray-900 dark:text-white">{p.fileName}</span>
                <span className="text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {p.createdBy}</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {p.status === 'UNDONE' ? 'Undone' : p.status === 'RUNNING' ? `Stopped at ${p.cursor} of ${p.totalRows}` : `${p.created} imported`}{p.resumes ? ` · ${p.resumes} resumes` : ''}
                </span>
                <span className="flex-1" />
                {p.status !== 'UNDONE' && (p.failed > 0 || p.skipped > 0) && <a href={`/api/employer/import/${p.id}/problems`} className="font-semibold text-gray-700 dark:text-gray-300 hover:underline">Problems</a>}
                {p.canUndo && <button type="button" onClick={() => undo(p)} className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-400 hover:underline"><Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
