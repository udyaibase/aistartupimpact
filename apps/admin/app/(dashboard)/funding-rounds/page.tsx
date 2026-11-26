'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit3, Trash2, X, Save, ExternalLink } from 'lucide-react';
import {
  getFundingRoundsAction,
  getStartupsForDropdownAction,
  createFundingRoundAction,
  updateFundingRoundAction,
  deleteFundingRoundAction,
} from './actions';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';

interface FundingRound {
  id: string;
  startupId: string;
  startupName: string;
  roundType: string;
  amountInr: string;
  announcedAt: string;
  leadInvestors: string[];
  sourceUrl?: string;
  createdAt: string;
}

interface Startup {
  id: string;
  name: string;
}

const roundTypes = ['Pre-Seed', 'Angle', 'Seed', 'Pre-Series A', 'Series A', 'Pre-Series B', 'Series B', 'Pre-Series C', 'Series C', 'Pre-Series D', 'Series D', 'Series E', 'Series F', 'Series G', 'Series I', 'Series J', 'Growth', 'Bridge', 'Debt', 'Grant', 'Internal Funding', 'IPO', 'Public'];

export default function FundingRoundsPage() {
  const [fundingRounds, setFundingRounds] = useState<FundingRound[]>([]);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FundingRound | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FundingRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [investorInput, setInvestorInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [roundsData, startupsData] = await Promise.all([
        getFundingRoundsAction(),
        getStartupsForDropdownAction(),
      ]);
      setFundingRounds(roundsData as FundingRound[]);
      setStartups(startupsData as Startup[]);
    } catch {
      notify("Couldn't load funding rounds. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing({
      id: '',
      startupId: '',
      startupName: '',
      roundType: 'Seed',
      amountInr: '',
      announcedAt: new Date().toISOString().split('T')[0],
      leadInvestors: [],
      createdAt: '',
    });
    setInvestorInput('');
    setModalOpen(true);
  };

  const openEdit = (round: FundingRound) => {
    setEditing({ ...round });
    setInvestorInput(round.leadInvestors.join(', '));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    const crores = parseFloat(editing.amountInr);
    if (!editing.startupId) { notify('Choose the startup this round belongs to.', 'error'); return; }
    if (!Number.isFinite(crores) || crores <= 0) { notify('Enter the amount in crores, for example 12.5.', 'error'); return; }

    try {
      const data = {
        startupId: editing.startupId,
        roundType: editing.roundType,
        amountInr: (crores * 1000000000).toString(), // crores to paise
        announcedAt: editing.announcedAt,
        leadInvestors: investorInput.split(',').map((inv) => inv.trim()).filter(Boolean),
        sourceUrl: editing.sourceUrl,
      };
      const isEdit = !!editing.id && fundingRounds.some((r) => r.id === editing.id);
      const result = isEdit ? await updateFundingRoundAction(editing.id, data) : await createFundingRoundAction(data);
      if (!result.success) {
        notify((result as { error?: string }).error || "Couldn't save the funding round. Try again.", 'error');
        return; // keep the form open so nothing typed is lost
      }
      notify(isEdit ? 'Funding round updated.' : 'Funding round added.', 'success');
      setModalOpen(false);
      setEditing(null);
      setInvestorInput('');
      await loadData();
    } catch {
      notify("Couldn't save the funding round. Check your connection and try again.", 'error');
    }
  };

  const handleDelete = async (round: FundingRound) => {
    setDeleteConfirm(null);
    try {
      const result = await deleteFundingRoundAction(round.id);
      if (!result.success) { notify((result as { error?: string }).error || "Couldn't delete the funding round. Try again.", 'error'); return; }
      setFundingRounds((list) => list.filter((r) => r.id !== round.id));
      notify(`${round.startupName} ${round.roundType} round deleted.`, 'success');
    } catch {
      notify("Couldn't delete the funding round. Check your connection and try again.", 'error');
    }
  };

  const crores = (amountInr: string) => Number(amountInr) / 1000000000;
  const formatAmount = (amountInr: string) => `₹${crores(amountInr).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;

  const columns = useMemo<Column<FundingRound>[]>(() => [
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
    { key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => crores(r.amountInr), cell: (r) => <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{formatAmount(r.amountInr)}</span> },
    {
      key: 'investors', header: 'Lead investors', searchValue: (r) => r.leadInvestors.join(' '),
      cell: (r) => r.leadInvestors.length
        ? <span title={r.leadInvestors.join(', ')}>{r.leadInvestors.slice(0, 2).join(', ')}{r.leadInvestors.length > 2 && ` +${r.leadInvestors.length - 2}`}</span>
        : '–',
    },
    {
      key: 'date', header: 'Announced', sortValue: (r) => new Date(r.announcedAt),
      cell: (r) => <span className="whitespace-nowrap">{new Date(r.announcedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => openEdit(r)} aria-label={`Edit the ${r.roundType} round of ${r.startupName}`} title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden />
          </button>
          <button onClick={() => setDeleteConfirm(r)} aria-label={`Delete the ${r.roundType} round of ${r.startupName}`} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-4 h-4 text-red-600" aria-hidden />
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<FundingRound>[]>(() => [
    { key: 'round', label: 'Round', options: [...new Set(fundingRounds.map((r) => r.roundType))].sort().map((t) => ({ value: t, label: t })), matches: (r, v) => r.roundType === v },
    { key: 'year', label: 'Year', options: [...new Set(fundingRounds.map((r) => String(new Date(r.announcedAt).getFullYear())))].sort().reverse().map((y) => ({ value: y, label: y })), matches: (r, v) => String(new Date(r.announcedAt).getFullYear()) === v },
  ], [fundingRounds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Funding rounds</h1>
          <p className="portal-subtitle">Individual rounds shown on the homepage and on each startup&rsquo;s page.</p>
        </div>
        <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden /> Add funding round
        </button>
      </div>

      <DataTable
        tableId="funding-rounds"
        noun="funding rounds"
        rows={fundingRounds}
        rowKey={(r) => r.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search startup, round or investor"
        empty={{ title: 'No funding rounds yet', description: 'Add a round to show it on the homepage and the startup page.' }}
      />

      {/* Create/Edit Modal */}
      {modalOpen && editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
                {editing.id && fundingRounds.find(r => r.id === editing.id) ? 'Edit Funding Round' : 'Add Funding Round'}
              </h2>
              <button onClick={() => { setModalOpen(false); setEditing(null); setInvestorInput(''); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Startup *</label>
                <select className="input-field text-sm" value={editing.startupId} onChange={(e) => setEditing({ ...editing, startupId: e.target.value })}>
                  <option value="">Select startup...</option>
                  {startups.map(startup => (
                    <option key={startup.id} value={startup.id}>{startup.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Round Type</label>
                  <select className="input-field text-sm" value={editing.roundType} onChange={(e) => setEditing({ ...editing, roundType: e.target.value })}>
                    {roundTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Amount (₹ Crores)</label>
                  <input type="number" className="input-field text-sm" value={editing.amountInr} onChange={(e) => setEditing({ ...editing, amountInr: e.target.value })} placeholder="e.g. 41" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Announced Date</label>
                <input type="date" className="input-field text-sm" value={editing.announcedAt} onChange={(e) => setEditing({ ...editing, announcedAt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Lead Investors</label>
                <input type="text" className="input-field text-sm" value={investorInput} onChange={(e) => setInvestorInput(e.target.value)} placeholder="e.g. Lightspeed, Peak XV, Matrix Partners" />
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-1">Separate multiple investors with commas</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Source URL (Optional)</label>
                <input type="url" className="input-field text-sm" value={editing.sourceUrl || ''} onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setModalOpen(false); setEditing(null); setInvestorInput(''); }} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={!editing.startupId || !editing.amountInr} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> Save Round
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
        title="Delete funding round"
        message={deleteConfirm ? `Delete the ${deleteConfirm.roundType} round of ${deleteConfirm.startupName}? It is removed from the website. This can't be undone.` : ''}
      />
    </div>
  );
}