'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import { Plus, Edit3, Trash2, ExternalLink, Eye, EyeOff, X, Save } from 'lucide-react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ConfirmModal } from '@/components/ConfirmModal';
import { notify } from '@/components/Toast';
import {
  getSponsorsAction, createSponsorAction, updateSponsorAction,
  deleteSponsorAction, toggleSponsorStatusAction,
} from './actions';

interface Sponsor {
  id: string; brand: string; tagline: string; ctaUrl: string;
  logoUrl?: string; isActive: boolean; sortOrder: number;
  startDate?: string; endDate?: string; createdAt: string;
}

const empty = { brand: '', tagline: '', ctaUrl: '', logoUrl: '', isActive: true, sortOrder: 0, startDate: '', endDate: '' };

function statusLabel(s: Sponsor) {
  const now = new Date();
  if (!s.isActive) return { label: 'Inactive', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500' };
  if (s.startDate && new Date(s.startDate) > now) return { label: 'Scheduled', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' };
  if (s.endDate && new Date(s.endDate) < now) return { label: 'Expired', cls: 'bg-red-100 dark:bg-red-900/30 text-red-500' };
  return { label: 'Live', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' };
}

export default function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState(empty);
  const [deleteConfirm, setDeleteConfirm] = useState<Sponsor | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const r = await getSponsorsAction();
    if (r.success) setSponsors(r.data as Sponsor[]);
    else notify((r as { error?: string }).error || "Couldn't load sponsors. Refresh to try again.", 'error');
    setLoading(false);
  };

  const openCreate = () => { setEditing(null); setForm(empty); setError(''); setModalOpen(true); };
  const openEdit = (s: Sponsor) => {
    setEditing(s);
    setForm({
      brand: s.brand, tagline: s.tagline, ctaUrl: s.ctaUrl, logoUrl: s.logoUrl || '',
      isActive: s.isActive, sortOrder: s.sortOrder,
      startDate: s.startDate ? s.startDate.split('T')[0] : '',
      endDate: s.endDate ? s.endDate.split('T')[0] : '',
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.brand || !form.tagline || !form.ctaUrl) { setError('Brand, tagline and URL are required.'); return; }
    setError('');
    startTransition(async () => {
      const result = editing
        ? await updateSponsorAction(editing.id, form)
        : await createSponsorAction(form);
      if (!result.success) { setError((result as any).error || 'Save failed'); return; }
      await load();
      setModalOpen(false);
    });
  };

  const handleDelete = (sp: Sponsor) => {
    setDeleteConfirm(null);
    startTransition(async () => {
      const r = await deleteSponsorAction(sp.id);
      if (!r.success) { notify((r as { error?: string }).error || `Couldn't delete ${sp.brand}. Try again.`, 'error'); return; }
      setSponsors((list) => list.filter((x) => x.id !== sp.id));
      notify(`${sp.brand} deleted.`, 'success');
    });
  };

  const handleToggle = (sp: Sponsor) => {
    startTransition(async () => {
      const r = await toggleSponsorStatusAction(sp.id, sp.isActive);
      if (!r.success) { notify((r as { error?: string }).error || `Couldn't change ${sp.brand}. Try again.`, 'error'); return; }
      setSponsors((prev) => prev.map((x) => (x.id === sp.id ? { ...x, isActive: !x.isActive } : x)));
    });
  };

  const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const columns = useMemo<Column<Sponsor>[]>(() => [
    {
      key: 'brand', header: 'Brand', sortValue: (sp) => sp.brand, searchValue: (sp) => `${sp.brand} ${sp.ctaUrl}`,
      cell: (sp) => (
        <div className="flex items-center gap-3 min-w-0">
          {sp.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sp.logoUrl} alt="" className="w-8 h-8 rounded object-contain shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center text-brand font-semibold text-xs shrink-0" aria-hidden>{sp.brand.charAt(0)}</div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{sp.brand}</p>
            <a href={sp.ctaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline inline-flex items-center gap-0.5">
              {sp.ctaUrl.replace(/^https?:\/\//, '')} <ExternalLink className="w-3 h-3" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      ),
    },
    { key: 'tagline', header: 'Tagline', searchValue: (sp) => sp.tagline, cell: (sp) => <p className="line-clamp-1 max-w-xs">{sp.tagline}</p> },
    {
      key: 'schedule', header: 'Schedule', sortValue: (sp) => (sp.startDate ? new Date(sp.startDate) : null),
      cell: (sp) => <span className="text-xs whitespace-nowrap">{sp.startDate ? day(sp.startDate) : 'Any time'} to {sp.endDate ? day(sp.endDate) : 'no end'}</span>,
    },
    { key: 'order', header: 'Order', align: 'right', sortValue: (sp) => sp.sortOrder, cell: (sp) => sp.sortOrder },
    {
      key: 'status', header: 'Status', sortValue: (sp) => statusLabel(sp).label,
      cell: (sp) => { const { label, cls } = statusLabel(sp); return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>; },
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (sp) => (
        <div className="flex justify-end gap-1">
          <button onClick={() => handleToggle(sp)} aria-label={sp.isActive ? `Turn off ${sp.brand}` : `Turn on ${sp.brand}`} title={sp.isActive ? 'Turn off' : 'Turn on'} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            {sp.isActive ? <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden /> : <EyeOff className="w-4 h-4 text-gray-500" aria-hidden />}
          </button>
          <button onClick={() => openEdit(sp)} aria-label={`Edit ${sp.brand}`} title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-300" aria-hidden />
          </button>
          <button onClick={() => setDeleteConfirm(sp)} aria-label={`Delete ${sp.brand}`} title="Delete" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="w-4 h-4 text-red-600" aria-hidden />
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<Sponsor>[]>(() => [
    { key: 'status', label: 'Status', options: ['Live', 'Scheduled', 'Expired', 'Inactive'].map((v) => ({ value: v, label: v })), matches: (sp, v) => statusLabel(sp).label === v },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Sponsors</h1>
          <p className="portal-subtitle">The &ldquo;Powered by&rdquo; strip on the homepage. Each sponsor can run for a set date range.</p>
        </div>
        <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" aria-hidden /> Add sponsor
        </button>
      </div>

      <DataTable
        tableId="sponsors"
        noun="sponsors"
        rows={sponsors}
        rowKey={(sp) => sp.id}
        columns={columns}
        filters={filters}
        loading={loading}
        searchPlaceholder="Search brand, link or tagline"
        empty={{ title: 'No sponsors yet', description: 'Add one to show it in the "Powered by" strip on the homepage.' }}
      />

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{editing ? 'Edit Sponsor' : 'Add Sponsor'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Brand Name *</label>
                <input type="text" className="input-field text-sm" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Yotta Data Services" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">
                  Tagline * <span className="text-gray-400 normal-case font-normal">(max 100 chars)</span>
                </label>
                <input type="text" className="input-field text-sm" maxLength={100} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} placeholder="e.g. Powering Indian AI with NVIDIA H100 GPU Cloud" />
                <p className={`text-xs mt-1 text-right font-jakarta ${form.tagline.length > 90 ? 'text-amber-500' : 'text-gray-400'}`}>{form.tagline.length}/100</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">CTA URL *</label>
                <input type="url" className="input-field text-sm" value={form.ctaUrl} onChange={e => setForm({ ...form, ctaUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Logo URL</label>
                <input type="url" className="input-field text-sm" value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Start Date</label>
                  <input type="date" className="input-field text-sm" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                  <p className="text-[10px] text-gray-400 mt-1 font-jakarta">Leave blank = show immediately</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">End Date</label>
                  <input type="date" className="input-field text-sm" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                  <p className="text-[10px] text-gray-400 mt-1 font-jakarta">Leave blank = no expiry</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Sort Order</label>
                  <input type="number" className="input-field text-sm" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 rounded text-brand border-gray-300 focus:ring-brand" />
                    <span className="text-sm font-jakarta text-navy dark:text-white">Active</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={isPending} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {isPending ? 'Saving...' : 'Save Sponsor'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
        title="Delete sponsor"
        message={deleteConfirm ? `Delete ${deleteConfirm.brand}? It is removed from the homepage straight away. This can't be undone.` : ''}
      />
    </div>
  );
}
