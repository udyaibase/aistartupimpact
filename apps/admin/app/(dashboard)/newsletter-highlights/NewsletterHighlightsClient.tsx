'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Save, X, Newspaper } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';

interface Highlight {
  id: number;
  title: string;
  description: string;
  date: string;
  link: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export default function NewsletterHighlightsClient() {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    link: '',
    is_active: true,
    display_order: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState<Highlight | null>(null);

  useEffect(() => {
    fetchHighlights();
  }, []);

  const fetchHighlights = async () => {
    try {
      const res = await fetch('/api/admin/newsletter-highlights');
      const data = await res.json();
      if (data.success) {
        setHighlights(data.highlights);
      }
    } catch (error) {
      console.error('Error fetching highlights:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = '/api/admin/newsletter-highlights';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...formData, id: editingId } : formData),
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchHighlights();
        resetForm();
        notify(editingId ? 'Highlight updated!' : 'Highlight created!');
      } else {
        notify(data.error || 'Failed to save highlight');
      }
    } catch (error) {
      console.error('Error saving highlight:', error);
      notify('Failed to save highlight');
    }
  };

  const handleEdit = (highlight: Highlight) => {
    setFormData({
      title: highlight.title,
      description: highlight.description,
      date: highlight.date,
      link: highlight.link || '',
      is_active: highlight.is_active,
      display_order: highlight.display_order,
    });
    setEditingId(highlight.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/newsletter-highlights?id=${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchHighlights();
        notify('Highlight deleted.', 'success');
      } else {
        notify(data.error || 'Failed to delete highlight');
      }
    } catch (error) {
      console.error('Error deleting highlight:', error);
      notify('Failed to delete highlight');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      date: '',
      link: '',
      is_active: true,
      display_order: 0,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const columns = useMemo<Column<Highlight>[]>(() => [
    { key: 'order', header: 'Order', sortValue: (h) => h.display_order, cell: (h) => h.display_order, width: 'w-20' },
    {
      key: 'highlight', header: 'Highlight', sortValue: (h) => h.title, searchValue: (h) => `${h.title} ${h.description}`,
      cell: (h) => (
        <div className="min-w-0 max-w-md">
          <p className="font-medium text-gray-900 dark:text-white">{h.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">{h.description}</p>
          {h.link && <a href={h.link} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Open link<span className="sr-only"> (new tab)</span></a>}
        </div>
      ),
    },
    { key: 'date', header: 'Date', searchValue: (h) => h.date, cell: (h) => <span className="text-xs whitespace-nowrap">{h.date}</span> },
    {
      key: 'status', header: 'Status', sortValue: (h) => (h.is_active ? 0 : 1),
      cell: (h) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${h.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{h.is_active ? 'Shown' : 'Hidden'}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (h) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => handleEdit(h)} aria-label={`Edit ${h.title}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit2 className="w-4 h-4" aria-hidden /></button>
          <button onClick={() => setConfirmDelete(h)} aria-label={`Delete ${h.title}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);
  const filters = useMemo<TableFilter<Highlight>[]>(() => [
    { key: 'status', label: 'Status', options: [{ value: 'shown', label: 'Shown on site' }, { value: 'hidden', label: 'Hidden' }], matches: (h, v) => h.is_active === (v === 'shown') },
  ], []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Newsletter Highlights</h1>
          <p className="portal-subtitle">
            Manage highlights shown in the "Recent Highlights" section on the newsletter page
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 text-white rounded-lg transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Highlight'}
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Newspaper className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              How it works
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Only the top 3 active highlights (by display order) will appear on the newsletter page. 
              Use this to showcase your best recent newsletter content or important announcements.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? 'Edit Highlight' : 'New Highlight'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Sarvam AI raises $41M Series A"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Led by Lightspeed, Peak XV. Building India's first full-stack AI platform..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date * (e.g., MARCH 7, 2025)
                </label>
                <input
                  type="text"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="MARCH 7, 2025"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Link (optional)
                </label>
                <input
                  type="text"
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="/newsletter/issue-42 or #"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Lower numbers appear first (0, 1, 2...)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Active (visible on website)
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <DataTable
        tableId="newsletter-highlights"
        noun="highlights"
        rows={highlights}
        rowKey={(h) => String(h.id)}
        columns={columns}
        filters={filters}
        loading={loading}
        searchPlaceholder="Search title or description"
        empty={{ title: 'No highlights yet', description: 'Add one to show it on the newsletter page.' }}
      />

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { const h = confirmDelete; setConfirmDelete(null); if (h) handleDelete(h.id); }}
        title="Delete highlight"
        message={confirmDelete ? `Delete “${confirmDelete.title}”? It is removed from the newsletter page. This can't be undone.` : ''}
      />
    </div>
  );
}
