'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { SKILLS, baseKey, type SkillCategory } from '@udyaibase/utils/skill-dictionary';
import {
  addAliasAction, addRuleAction, addSkillAction, getSkillsAdminAction, ignoreUnknownAction, mergeSkillAction, removeAdditionAction,
} from './actions';

type Data = Extract<Awaited<ReturnType<typeof getSkillsAdminAction>>, { success: true }>;
const CATEGORIES: SkillCategory[] = ['language', 'frontend', 'backend', 'mobile', 'data', 'database', 'ml', 'ai', 'cloud', 'devops', 'testing', 'security', 'design', 'product', 'business', 'soft', 'tools'];
const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl';
const input = 'min-h-[34px] px-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 text-xs';
const btn = 'inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg text-xs font-semibold disabled:opacity-50';

interface Row { key: string; name: string; category: string; aliases: string[]; implies: string[]; ambiguous: boolean; added: boolean }

export default function SkillsDictionaryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');

  const load = async () => {
    const r = await getSkillsAdminAction();
    if (r.success) { setData(r); setError(''); } else setError(r.error ?? 'Failed to load');
  };
  useEffect(() => { load(); }, []);

  // Base list + admin additions, as matching sees them.
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const byKey = new Map<string, Row>();
    for (const s of SKILLS) {
      byKey.set(baseKey(s.name), {
        key: baseKey(s.name), name: s.name, category: s.category, aliases: [...(s.aliases ?? []), ...(s.loose ?? [])],
        implies: (s.implies ?? []).map(baseKey), ambiguous: !!s.ambiguous, added: false,
      });
    }
    for (const s of data.skills) byKey.set(s.key, { key: s.key, name: s.name, category: s.category, aliases: [], implies: [], ambiguous: false, added: true });
    for (const a of data.aliases) {
      const target = byKey.get(a.skillKey);
      if (target) target.aliases.push(a.alias);
      if (byKey.has(a.aliasKey) && a.aliasKey !== a.skillKey) byKey.delete(a.aliasKey); // merged away
    }
    for (const r of data.rules) {
      const row = byKey.get(r.fromKey);
      if (!row) continue;
      if (r.kind === 'implies') row.implies.push(r.toKey);
      if (r.kind === 'ambiguous') row.ambiguous = true;
      if (r.kind === 'not_ambiguous') row.ambiguous = false;
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const nameOf = (k: string) => rows.find((r) => r.key === k)?.name ?? k;
  const keyOfName = (n: string) => rows.find((r) => r.name.toLowerCase() === n.trim().toLowerCase())?.key ?? '';
  const shown = q.trim() ? rows.filter((r) => `${r.name} ${r.aliases.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40) : [];

  async function run(tag: string, fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    setBusy(tag);
    const r = await fn().catch(() => ({ success: false, error: 'Something went wrong.' }));
    setBusy(null);
    setToast(r.success ? ok : r.error ?? 'Couldn’t save.');
    if (r.success) await load();
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />;

  return (
    <div className="space-y-5 font-jakarta">
      <datalist id="skill-names">{rows.map((r) => <option key={r.key} value={r.name} />)}</datalist>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><BookOpen className="w-5 h-5 text-brand" /> Skills dictionary</h1>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            {rows.length} skills ({SKILLS.length} in code, {data.skills.length} added here) · version {data.version}
            {data.version > data.rescoredVersion ? ' · stored AI review scores update in the next daily run (by code, no AI cost)' : ' · all review scores up to date'}.
            Nothing here changes matching until you approve it.
          </p>
        </div>
        <button onClick={load} className={`${btn} border border-gray-200 dark:border-gray-700`}><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
      </div>
      {toast && <p role="status" className="text-xs font-semibold text-gray-800 dark:text-gray-200">{toast}</p>}

      <section className={card} aria-labelledby="queue-title">
        <div className="px-4 pt-4 pb-2">
          <h2 id="queue-title" className="text-sm font-semibold text-gray-900 dark:text-white">Unknown skills to review</h2>
          <p className="text-xs text-gray-500">Seen in job posts and resume skills lists, most frequent first. AI suggestions are made weekly; you decide. {Object.entries(data.counts).map(([s, n]) => `${s.toLowerCase()} ${n}`).join(' · ')}</p>
        </div>
        {data.queue.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-500">Nothing to review.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.queue.map((u) => <UnknownRow key={u.key} u={u} busy={busy === u.key} keyOfName={keyOfName}
              onAlias={(skillName) => run(u.key, () => addAliasAction(u.sample, keyOfName(skillName)), `“${u.sample}” is now an alias of ${skillName}.`)}
              onNew={(name, cat) => run(u.key, () => addSkillAction(name, cat), `Added ${name}.`)}
              onIgnore={() => run(u.key, () => ignoreUnknownAction(u.key), `Ignored “${u.sample}”.`)} />)}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="dict-title">
        <div className="px-4 pt-4 pb-3 space-y-2">
          <h2 id="dict-title" className="text-sm font-semibold text-gray-900 dark:text-white">Find a skill</h2>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and aliases, e.g. react, k8s, power bi" className={`${input} w-full max-w-md`} aria-label="Search skills" />
          <AddSkill busy={busy === 'new'} onAdd={(n, c) => run('new', () => addSkillAction(n, c), `Added ${n}.`)} />
        </div>
        {shown.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {shown.map((r) => <SkillRow key={r.key} r={r} nameOf={nameOf} busy={busy === r.key}
              onAlias={(a) => run(r.key, () => addAliasAction(a, r.key), `Added “${a}” to ${r.name}.`)}
              onImplies={(n) => run(r.key, () => addRuleAction('implies', r.key, keyOfName(n)), `${r.name} now implies ${n}.`)}
              onAmbiguous={(on) => run(r.key, () => addRuleAction(on ? 'ambiguous' : 'not_ambiguous', r.key), on ? `${r.name} now counts only when written as the tool’s name.` : `${r.name} counts however it’s written.`)}
              onMerge={(n) => run(r.key, () => mergeSkillAction(r.key, keyOfName(n)), `Merged ${r.name} into ${n}.`)} />)}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="added-title">
        <h2 id="added-title" className="px-4 pt-4 pb-2 text-sm font-semibold text-gray-900 dark:text-white">Changes made here</h2>
        {data.skills.length + data.aliases.length + data.rules.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-500">None yet: matching uses the list in code.</p> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
            {data.skills.map((s) => <Change key={s.id} text={`New skill: ${s.name} (${s.category})`} by={s.createdBy} onRemove={() => run(s.id, () => removeAdditionAction('skill', s.id), 'Removed.')} />)}
            {data.aliases.map((a) => <Change key={a.id} text={`Alias: “${a.alias}” → ${nameOf(a.skillKey)}`} by={a.createdBy} onRemove={() => run(a.id, () => removeAdditionAction('alias', a.id), 'Removed.')} />)}
            {data.rules.map((r) => <Change key={r.id} text={r.kind === 'implies' ? `${nameOf(r.fromKey)} implies ${nameOf(r.toKey)}` : `${nameOf(r.fromKey)}: ${r.kind === 'ambiguous' ? 'only as the tool’s name' : 'counts however written'}`} by={r.createdBy} onRemove={() => run(r.id, () => removeAdditionAction('rule', r.id), 'Removed.')} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function UnknownRow({ u, busy, keyOfName, onAlias, onNew, onIgnore }: {
  u: Data['queue'][number]; busy: boolean; keyOfName: (n: string) => string;
  onAlias: (skillName: string) => void; onNew: (name: string, category: string) => void; onIgnore: () => void;
}) {
  const s = u.suggestion;
  const [target, setTarget] = useState(s?.action === 'alias' ? s.skill : '');
  const [name, setName] = useState(s?.action === 'new' ? s.skill : u.sample);
  const [cat, setCat] = useState(s?.category || '');
  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">“{u.sample}”</span>
        <span className="text-xs text-gray-500">seen {u.seenCount}× · {u.source === 'job' ? 'job posts' : 'resume skills lists'}</span>
        {s && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            <Sparkles className="w-3 h-3" /> AI suggests: {s.action === 'alias' ? `alias of ${s.skill}` : s.action === 'new' ? `new skill “${s.skill}” (${s.category})` : 'ignore'}{s.reason ? ` · ${s.reason}` : ''}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input list="skill-names" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Skill it means…" className={`${input} w-48`} aria-label={`Skill “${u.sample}” is another way to write`} />
        <button disabled={busy || !keyOfName(target)} onClick={() => onAlias(target)} className={`${btn} bg-gray-900 text-white dark:bg-white dark:text-gray-900`}><Check className="w-3.5 h-3.5" /> Make alias</button>
        <span className="text-xs text-gray-400">or</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-40`} aria-label="New skill name" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input} aria-label="Category"><option value="">Category…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button disabled={busy || !name.trim() || !cat} onClick={() => onNew(name, cat)} className={`${btn} border border-gray-300 dark:border-gray-600`}>Add as new skill</button>
        <button disabled={busy} onClick={onIgnore} className={`${btn} text-gray-600 dark:text-gray-400`}><X className="w-3.5 h-3.5" /> Ignore</button>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    </li>
  );
}

function SkillRow({ r, nameOf, busy, onAlias, onImplies, onAmbiguous, onMerge }: {
  r: Row; nameOf: (k: string) => string; busy: boolean;
  onAlias: (a: string) => void; onImplies: (n: string) => void; onAmbiguous: (on: boolean) => void; onMerge: (n: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [imp, setImp] = useState('');
  const [merge, setMerge] = useState('');
  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">{r.name}</span>
        <span className="text-xs text-gray-500">{r.category}{r.added ? ' · added here' : ''}</span>
        {r.ambiguous && <span className="text-xs px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">only as the tool’s name</span>}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">Also written: {r.aliases.length ? r.aliases.join(', ') : '—'}{r.implies.length ? ` · implies ${r.implies.map(nameOf).join(', ')}` : ''}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="New alias" className={`${input} w-32`} aria-label={`New alias for ${r.name}`} />
        <button disabled={busy || !alias.trim()} onClick={() => { onAlias(alias); setAlias(''); }} className={`${btn} border border-gray-300 dark:border-gray-600`}>Add alias</button>
        <input list="skill-names" value={imp} onChange={(e) => setImp(e.target.value)} placeholder="Implies…" className={`${input} w-32`} aria-label={`${r.name} implies`} />
        <button disabled={busy || !imp.trim()} onClick={() => { onImplies(imp); setImp(''); }} className={`${btn} border border-gray-300 dark:border-gray-600`}>Add implies</button>
        <button disabled={busy} onClick={() => onAmbiguous(!r.ambiguous)} className={`${btn} border border-gray-300 dark:border-gray-600`}>{r.ambiguous ? 'Count however written' : 'Only as the tool’s name'}</button>
        <input list="skill-names" value={merge} onChange={(e) => setMerge(e.target.value)} placeholder="Merge into…" className={`${input} w-32`} aria-label={`Merge ${r.name} into`} />
        <button disabled={busy || !merge.trim()} onClick={() => { if (confirm(`Merge ${r.name} into ${merge}? ${r.name} becomes another way to write ${merge}.`)) onMerge(merge); }} className={`${btn} border border-red-300 text-red-700 dark:border-red-800 dark:text-red-300`}>Merge</button>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
      </div>
    </li>
  );
}

function AddSkill({ busy, onAdd }: { busy: boolean; onAdd: (name: string, category: string) => void }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a new skill" className={`${input} w-48`} aria-label="New skill" />
      <select value={cat} onChange={(e) => setCat(e.target.value)} className={input} aria-label="Category"><option value="">Category…</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      <button disabled={busy || !name.trim() || !cat} onClick={() => { onAdd(name, cat); setName(''); }} className={`${btn} bg-gray-900 text-white dark:bg-white dark:text-gray-900`}>Add skill</button>
    </div>
  );
}

function Change({ text, by, onRemove }: { text: string; by: string; onRemove: () => void }) {
  return (
    <li className="px-4 py-2 flex items-center gap-3">
      <span className="flex-1 text-gray-800 dark:text-gray-200">{text}</span>
      <span className="text-gray-500">{by}</span>
      <button onClick={onRemove} aria-label={`Remove: ${text}`} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </li>
  );
}
