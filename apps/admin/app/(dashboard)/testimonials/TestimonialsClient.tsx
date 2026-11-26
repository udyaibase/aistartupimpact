'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';

interface Testimonial {
  id: number;
  name: string;
  role: string;
  company: string | null;
  avatar: string;
  quote: string;
  subscribed_duration: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export default function TestimonialsClient() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    company: '',
    avatar: '',
    quote: '',
    subscribed_duration: '',
    is_active: true,
    display_order: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState<Testimonial | null>(null);

  useEffect(() => {
    fetchTestimonials();
  }, []);

  const fetchTestimonials = async () => {
    try {
      const res = await fetch('/api/admin/testimonials');
      const data = await res.json();
      if (data.success) {
        setTestimonials(data.testimonials);
      }
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingId ? '/api/admin/testimonials' : '/api/admin/testimonials';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { ...formData, id: editingId } : formData),
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchTestimonials();
        resetForm();
        notify(editingId ? 'Testimonial updated!' : 'Testimonial created!');
      } else {
        notify(data.error || 'Failed to save testimonial');
      }
    } catch (error) {
      console.error('Error saving testimonial:', error);
      notify('Failed to save testimonial');
    }
  };

  const handleEdit = (testimonial: Testimonial) => {
    setFormData({
      name: testimonial.name,
      role: testimonial.role,
      company: testimonial.company || '',
      avatar: testimonial.avatar,
      quote: testimonial.quote,
      subscribed_duration: testimonial.subscribed_duration || '',
      is_active: testimonial.is_active,
      display_order: testimonial.display_order,
    });
    setEditingId(testimonial.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/testimonials?id=${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      
      if (data.success) {
        await fetchTestimonials();
        notify('Testimonial deleted.', 'success');
      } else {
        notify(data.error || "Couldn't delete the testimonial. Try again.", 'error');
      }
    } catch (error) {
      console.error('Error deleting testimonial:', error);
      notify("Couldn't delete the testimonial. Check your connection and try again.", 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      role: '',
      company: '',
      avatar: '',
      quote: '',
      subscribed_duration: '',
      is_active: true,
      display_order: 0,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const columns = useMemo<Column<Testimonial>[]>(() => [
    { key: 'order', header: 'Order', sortValue: (t) => t.display_order, cell: (t) => t.display_order, width: 'w-20' },
    {
      key: 'person', header: 'Person', sortValue: (t) => t.name, searchValue: (t) => `${t.name} ${t.role} ${t.company ?? ''}`,
      cell: (t) => (
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center text-sm font-semibold shrink-0">{t.avatar}</span>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{t.role}{t.company && `, ${t.company}`}</p>
            {t.subscribed_duration && <p className="text-xs text-gray-600 dark:text-gray-400">{t.subscribed_duration}</p>}
          </div>
        </div>
      ),
    },
    { key: 'quote', header: 'Quote', searchValue: (t) => t.quote, cell: (t) => <p className="line-clamp-2 max-w-md">{t.quote}</p> },
    {
      key: 'status', header: 'Status', sortValue: (t) => (t.is_active ? 0 : 1),
      cell: (t) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${t.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>{t.is_active ? 'Shown' : 'Hidden'}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => handleEdit(t)} aria-label={`Edit the testimonial from ${t.name}`} title="Edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit2 className="w-4 h-4" aria-hidden /></button>
          <button onClick={() => setConfirmDelete(t)} aria-label={`Delete the testimonial from ${t.name}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);
  const filters = useMemo<TableFilter<Testimonial>[]>(() => [
    { key: 'status', label: 'Status', options: [{ value: 'shown', label: 'Shown on site' }, { value: 'hidden', label: 'Hidden' }], matches: (t, v) => t.is_active === (v === 'shown') },
  ], []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Newsletter testimonials</h1>
          <p className="portal-subtitle">Quotes from readers shown on the newsletter page.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 text-white rounded-lg transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add testimonial'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingId ? 'Edit Testimonial' : 'New Testimonial'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role *
                </label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Founder"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Acme Inc"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Avatar (2 letters) *
                </label>
                <input
                  type="text"
                  value={formData.avatar}
                  onChange={(e) => setFormData({ ...formData, avatar: e.target.value.toUpperCase().slice(0, 2) })}
                  required
                  maxLength={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="JD"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subscribed Duration
                </label>
                <input
                  type="text"
                  value={formData.subscribed_duration}
                  onChange={(e) => setFormData({ ...formData, subscribed_duration: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                  placeholder="Subscribed 6 months ago"
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
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quote *
              </label>
              <textarea
                value={formData.quote}
                onChange={(e) => setFormData({ ...formData, quote: e.target.value })}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
                placeholder="This newsletter is amazing..."
              />
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
        tableId="testimonials"
        noun="testimonials"
        rows={testimonials}
        rowKey={(t) => String(t.id)}
        columns={columns}
        filters={filters}
        loading={loading}
        searchPlaceholder="Search person, company or quote"
        empty={{ title: 'No testimonials yet', description: 'Add one to show it on the newsletter page.' }}
      />

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { const t = confirmDelete; setConfirmDelete(null); if (t) handleDelete(t.id); }}
        title="Delete testimonial"
        message={confirmDelete ? `Delete the testimonial from ${confirmDelete.name}? It is removed from the newsletter page. This can't be undone.` : ''}
      />
    </div>
  );
}
