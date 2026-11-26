'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { Plus, Edit3, Trash2, X, Save, ExternalLink } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';
import {
  getFundingDigestsAction, createFundingDigestAction, updateFundingDigestAction,
  deleteFundingDigestAction, toggleFundingDigestStatusAction,
  getFundingRoundsDirectAction, createFundingRoundDirectAction,
  updateFundingRoundDirectAction, deleteFundingRoundDirectAction,
} from './actions';

interface Deal { startup: string; amount: string; stage: string; }
interface Digest { id: string; title: string; date: string; status: string; dealsCount: number; totalRaised: string; deals: Deal[]; }
interface Round {
  id: string; startupId: string; startupName: string; roundType: string;
  amountUsd: string; amountInr: string; announcedAt: string;
  leadInvestors: string[]; allInvestors: string[]; valuation: string | null; sourceUrl?: string;
}
interface Startup { id: string; name: string; }

const ROUND_TYPES = ['Pre-Seed', 'Angle', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Pre-Series C', 'Series C', 'Pre-Series D', 'Series D', 'Series E', 'Series F', 'Series G', 'Series I', 'Series J', 'Growth', 'Bridge', 'Debt', 'Grant', 'Internal Funding', 'IPO', 'Public'];

function formatUsd(cents: string | number | null) {
  if (!cents) return '—';
  const usd = Number(cents) / 100;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(0)}M`;
  return `$${(usd / 1e3).toFixed(0)}K`;
}

/** Dates as plain yyyy-mm-dd text and deals as a list, whatever shape the server sent. */
function toDigests(list: unknown): Digest[] {
  return (list as any[]).map((x) => ({
    ...x,
    date: x.date instanceof Date ? x.date.toISOString().split('T')[0] : typeof x.date === 'string' ? x.date.split('T')[0] : String(x.date ?? ''),
    deals: typeof x.deals === 'string' ? JSON.parse(x.deals) : x.deals || [],
  }));
}
const usd = (cents: string | number | null) => Number(cents ?? 0) / 100;
const iconButton = 'p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';

export default function FundingDirPage() {
  const [tab, setTab] = useState<'digests' | 'rounds'>('rounds');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Digest modal
  const [digestModal, setDigestModal] = useState(false);
  const [editDigest, setEditDigest] = useState<Digest | null>(null);
  const [deleteDigest, setDeleteDigest] = useState<Digest | null>(null);

  // Round modal
  const [roundModal, setRoundModal] = useState(false);
  const [editRound, setEditRound] = useState<Partial<Round> | null>(null);
  const [deleteRound, setDeleteRound] = useState<Round | null>(null);
  const [investorInput, setInvestorInput] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [d, r] = await Promise.all([
      getFundingDigestsAction(),
      getFundingRoundsDirectAction(),
    ]);
    setDigests((d as any[]).map(x => ({
      ...x,
      // Ensure date is always a plain string — Neon returns date columns as Date objects
      date: x.date instanceof Date
        ? x.date.toISOString().split('T')[0]
        : typeof x.date === 'string'
          ? x.date.split('T')[0]
          : String(x.date ?? ''),
      deals: typeof x.deals === 'string' ? JSON.parse(x.deals) : x.deals || [],
    })));
    setRounds(r as Round[]);
    setLoading(false);
  };

  // ── Digest handlers ──────────────────────────────────────────────────────
  const openCreateDigest = () => {
    setEditDigest({ id: '', title: '', date: new Date().toISOString().split('T')[0], status: 'DRAFT', dealsCount: 0, totalRaised: '', deals: [] });
    setDigestModal(true);
  };
  const saveDigest = () => {
    if (!editDigest) return;
    startTransition(async () => {
      const data = { title: editDigest.title, date: editDigest.date, status: editDigest.status, dealsCount: editDigest.deals.length, totalRaised: editDigest.totalRaised, deals: editDigest.deals };
      if (editDigest.id && digests.find(d => d.id === editDigest.id)) {
        await updateFundingDigestAction(editDigest.id, data);
      } else {
        await createFundingDigestAction(data);
      }
      const updated = await getFundingDigestsAction();
      setDigests((updated as any[]).map(x => ({
        ...x,
        date: x.date instanceof Date
          ? x.date.toISOString().split('T')[0]
          : typeof x.date === 'string'
            ? x.date.split('T')[0]
            : String(x.date ?? ''),
        deals: typeof x.deals === 'string' ? JSON.parse(x.deals) : x.deals || [],
      })));
      setDigestModal(false); setEditDigest(null);
    });
  };
  const addDeal = () => { if (!editDigest) return; setEditDigest({ ...editDigest, deals: [...editDigest.deals, { startup: '', amount: '', stage: 'Seed' }] }); };
  const updateDeal = (i: number, f: keyof Deal, v: string) => { if (!editDigest) return; const d = [...editDigest.deals]; d[i] = { ...d[i], [f]: v }; setEditDigest({ ...editDigest, deals: d }); };
  const removeDeal = (i: number) => { if (!editDigest) return; setEditDigest({ ...editDigest, deals: editDigest.deals.filter((_, j) => j !== i) }); };

  // ── Round handlers ───────────────────────────────────────────────────────
  const openCreateRound = () => {
    setEditRound({ roundType: 'Series A', announcedAt: new Date().toISOString().split('T')[0], leadInvestors: [] });
    setInvestorInput('');
    setRoundModal(true);
  };
  const saveRound = () => {
    if (!editRound) return;
    startTransition(async () => {
      const investors = investorInput.split(',').map(s => s.trim()).filter(Boolean);
      const data = {
        startupName: editRound.startupName || '',
        roundType: editRound.roundType || 'Seed',
        amountUsd: editRound.amountUsd || '',
        announcedAt: editRound.announcedAt || '',
        leadInvestors: investors,
        valuation: editRound.valuation || '',
        sourceUrl: editRound.sourceUrl || '',
      };
      if (editRound.id && rounds.find(r => r.id === editRound.id)) {
        await updateFundingRoundDirectAction(editRound.id, data);
      } else {
        await createFundingRoundDirectAction(data);
      }
      const updated = await getFundingRoundsDirectAction();
      setRounds(updated as Round[]);
      setRoundModal(false); setEditRound(null);
    });
  };

  const toggleDigest = (d: Digest) => startTransition(async () => {
    const r = await toggleFundingDigestStatusAction(d.id);
    if (!r.success) { notify((r as { error?: string }).error || "Couldn't change the digest. Try again.", 'error'); return; }
    setDigests(toDigests(await getFundingDigestsAction()));
  });

  const confirmDeleteRound = (r: Round) => { setDeleteRound(null); startTransition(async () => {
    const res = await deleteFundingRoundDirectAction(r.id);
    if (!res.success) { notify((res as { error?: string }).error || "Couldn't delete the round. Try again.", 'error'); return; }
    setRounds((list) => list.filter((x) => x.id !== r.id));
    notify(`${r.startupName} ${r.roundType} round deleted.`, 'success');
  }); };

  const confirmDeleteDigest = (d: Digest) => { setDeleteDigest(null); startTransition(async () => {
    const res = await deleteFundingDigestAction(d.id);
    if (!res.success) { notify((res as { error?: string }).error || "Couldn't delete the digest. Try again.", 'error'); return; }
    setDigests((list) => list.filter((x) => x.id !== d.id));
    notify('Digest deleted.', 'success');
  }); };

  const roundColumns = useMemo<Column<Round>[]>(() => [
    {
      key: 'startup', header: 'Startup', sortValue: (r) => r.startupName, searchValue: (r) => r.startupName,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{r.startupName}</p>
          {r.sourceUrl && (
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-0.5">
              Source <ExternalLink className="w-3 h-3" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      ),
    },
    { key: 'round', header: 'Round', sortValue: (r) => r.roundType, searchValue: (r) => r.roundType, cell: (r) => <span className="whitespace-nowrap">{r.roundType}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => usd(r.amountUsd), cell: (r) => <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{formatUsd(r.amountUsd)}</span> },
    { key: 'valuation', header: 'Valuation', align: 'right', sortValue: (r) => (r.valuation ? usd(r.valuation) : null), cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatUsd(r.valuation)}</span> },
    {
      key: 'investors', header: 'Lead investors', searchValue: (r) => (r.leadInvestors || []).join(' '),
      cell: (r) => (r.leadInvestors || []).length
        ? <span title={r.leadInvestors.join(', ')}>{r.leadInvestors.slice(0, 2).join(', ')}{r.leadInvestors.length > 2 ? ` +${r.leadInvestors.length - 2}` : ''}</span>
        : '–',
    },
    {
      key: 'date', header: 'Announced', sortValue: (r) => (r.announcedAt ? new Date(r.announcedAt) : null),
      cell: (r) => <span className="whitespace-nowrap">{r.announcedAt ? new Date(r.announcedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => { setEditRound(r); setInvestorInput((r.leadInvestors || []).join(', ')); setRoundModal(true); }} aria-label={`Edit the ${r.roundType} round of ${r.startupName}`} title="Edit" className={iconButton}><Edit3 className="w-4 h-4" aria-hidden /></button>
          <button onClick={() => setDeleteRound(r)} aria-label={`Delete the ${r.roundType} round of ${r.startupName}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  ], []);

  const roundFilters = useMemo<TableFilter<Round>[]>(() => [
    { key: 'round', label: 'Round', options: [...new Set(rounds.map((r) => r.roundType))].sort().map((t) => ({ value: t, label: t })), matches: (r, v) => r.roundType === v },
    { key: 'year', label: 'Year', options: [...new Set(rounds.filter((r) => r.announcedAt).map((r) => String(new Date(r.announcedAt).getFullYear())))].sort().reverse().map((y) => ({ value: y, label: y })), matches: (r, v) => !!r.announcedAt && String(new Date(r.announcedAt).getFullYear()) === v },
  ], [rounds]);

  const digestColumns = useMemo<Column<Digest>[]>(() => [
    { key: 'title', header: 'Digest', sortValue: (d) => d.title, searchValue: (d) => `${d.title} ${d.deals.map((x) => x.startup).join(' ')}`, cell: (d) => <p className="font-semibold text-gray-900 dark:text-white max-w-md">{d.title}</p> },
    { key: 'date', header: 'Week of', sortValue: (d) => d.date, cell: (d) => <span className="whitespace-nowrap">{d.date}</span> },
    { key: 'deals', header: 'Deals', align: 'right', sortValue: (d) => d.dealsCount, cell: (d) => d.dealsCount },
    { key: 'raised', header: 'Total raised', align: 'right', cell: (d) => <span className="whitespace-nowrap">{d.totalRaised || '–'}</span> },
    {
      key: 'status', header: 'Status', sortValue: (d) => d.status,
      cell: (d) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${d.status === 'PUBLISHED' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{d.status === 'PUBLISHED' ? 'Published' : 'Draft'}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => toggleDigest(d)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap" aria-label={`${d.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'} ${d.title}`}>
            {d.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={() => { setEditDigest({ ...d }); setDigestModal(true); }} aria-label={`Edit ${d.title}`} title="Edit" className={iconButton}><Edit3 className="w-4 h-4" aria-hidden /></button>
          <button onClick={() => setDeleteDigest(d)} aria-label={`Delete ${d.title}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const digestFilters = useMemo<TableFilter<Digest>[]>(() => [
    { key: 'status', label: 'Status', options: [{ value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Draft' }], matches: (d, v) => (d.status === 'PUBLISHED') === (v === 'PUBLISHED') },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Funding</h1>
          <p className="portal-subtitle">Funding rounds in US dollars and the weekly deal digests.</p>
        </div>
        <button onClick={tab === 'digests' ? openCreateDigest : openCreateRound} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden /> {tab === 'digests' ? 'New digest' : 'Add round'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {(['rounds', 'digests'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold font-jakarta transition-all capitalize ${tab === t ? 'bg-white dark:bg-gray-900 text-navy dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t === 'rounds' ? `Funding rounds (${rounds.length})` : `Weekly digests (${digests.length})`}
          </button>
        ))}
      </div>

      {tab === 'rounds' && (
        <DataTable tableId="funding-dir-rounds" noun="funding rounds" rows={rounds} rowKey={(r) => r.id} columns={roundColumns} filters={roundFilters}
          loading={loading} pageSize={25} searchPlaceholder="Search startup, round or investor"
          empty={{ title: 'No funding rounds yet', description: 'Add a round to show it in the funding tracker.' }} />
      )}

      {tab === 'digests' && (
        <DataTable tableId="funding-dir-digests" noun="digests" rows={digests} rowKey={(d) => d.id} columns={digestColumns} filters={digestFilters}
          loading={loading} pageSize={25} searchPlaceholder="Search digest or startup"
          empty={{ title: 'No weekly digests yet', description: 'Create a digest to round up the week\u2019s deals.' }} />
      )}

      {/* ── ROUND MODAL ── */}
      {roundModal && editRound && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{editRound.id ? 'Edit Round' : 'Add Funding Round'}</h2>
              <button onClick={() => { setRoundModal(false); setEditRound(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Startup Name *</label>
                <input type="text" className="input-field text-sm" value={editRound.startupName || ''} onChange={e => setEditRound({ ...editRound, startupName: e.target.value })} placeholder="e.g. Neysa" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Round Type</label>
                  <select className="input-field text-sm" value={editRound.roundType || 'Seed'} onChange={e => setEditRound({ ...editRound, roundType: e.target.value })}>
                    {ROUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Amount (USD cents)</label>
                  <input type="number" className="input-field text-sm" value={editRound.amountUsd || ''} onChange={e => setEditRound({ ...editRound, amountUsd: e.target.value })} placeholder="e.g. 1500000000 = $15M" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Announced Date</label>
                <input type="date" className="input-field text-sm" value={editRound.announcedAt || ''} onChange={e => setEditRound({ ...editRound, announcedAt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Lead Investors (comma separated)</label>
                <input type="text" className="input-field text-sm" value={investorInput} onChange={e => setInvestorInput(e.target.value)} placeholder="Bessemer, NVIDIA, Amazon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Source URL</label>
                <input type="url" className="input-field text-sm" value={editRound.sourceUrl || ''} onChange={e => setEditRound({ ...editRound, sourceUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setRoundModal(false); setEditRound(null); }} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={saveRound} disabled={!editRound.startupName || isPending} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {isPending ? 'Saving...' : 'Save Round'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DIGEST MODAL ── */}
      {digestModal && editDigest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{digests.find(d => d.id === editDigest.id) ? 'Edit Digest' : 'New Digest'}</h2>
              <button onClick={() => { setDigestModal(false); setEditDigest(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Title *</label>
                <input type="text" className="input-field text-sm" value={editDigest.title} onChange={e => setEditDigest({ ...editDigest, title: e.target.value })} placeholder="Week X: headline..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Date</label>
                  <input type="date" className="input-field text-sm" value={editDigest.date} onChange={e => setEditDigest({ ...editDigest, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Total Raised</label>
                  <input type="text" className="input-field text-sm" value={editDigest.totalRaised} onChange={e => setEditDigest({ ...editDigest, totalRaised: e.target.value })} placeholder="e.g. $1.58B" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase font-jakarta">Deals</label>
                  <button onClick={addDeal} className="text-xs text-brand font-semibold hover:underline">+ Add Deal</button>
                </div>
                {editDigest.deals.map((deal, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input type="text" className="input-field text-sm flex-1" placeholder="Startup" value={deal.startup} onChange={e => updateDeal(i, 'startup', e.target.value)} />
                    <input type="text" className="input-field text-sm w-24" placeholder="Amount" value={deal.amount} onChange={e => updateDeal(i, 'amount', e.target.value)} />
                    <input type="text" className="input-field text-sm w-24" placeholder="Stage" value={deal.stage} onChange={e => updateDeal(i, 'stage', e.target.value)} />
                    <button onClick={() => removeDeal(i)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><X className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setDigestModal(false); setEditDigest(null); }} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={saveDigest} disabled={!editDigest.title || isPending} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {isPending ? 'Saving...' : 'Save Digest'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteRound}
        onClose={() => setDeleteRound(null)}
        onConfirm={() => { if (deleteRound) confirmDeleteRound(deleteRound); }}
        title="Delete funding round"
        message={deleteRound ? `Delete the ${deleteRound.roundType} round of ${deleteRound.startupName}? It is removed from the website. This can't be undone.` : ''}
      />
      <ConfirmModal
        open={!!deleteDigest}
        onClose={() => setDeleteDigest(null)}
        onConfirm={() => { if (deleteDigest) confirmDeleteDigest(deleteDigest); }}
        title="Delete digest"
        message={deleteDigest ? `Delete “${deleteDigest.title}”? This can't be undone.` : ''}
      />
    </div>
  );
}
