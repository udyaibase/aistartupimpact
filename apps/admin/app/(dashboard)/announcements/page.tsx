'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone, Plus, Pencil, Trash2, Search, X, ChevronUp, ChevronDown,
  ToggleLeft, ToggleRight, Rocket, IndianRupee, CalendarDays, Briefcase, Wrench, FileText,
  ExternalLink, Clock,
} from 'lucide-react';
import {
  getAnnouncementsAction,
  createAnnouncementAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
  toggleAnnouncementAction,
  reorderAnnouncementsAction,
  searchExistingDataAction,
} from './actions';
import { ask } from '@/components/Ask';

const TYPES = [
  { value: 'CUSTOM', label: 'Custom', icon: FileText, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  { value: 'STARTUP', label: 'Startup', icon: Rocket, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'FUNDING', label: 'Funding', icon: IndianRupee, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'EVENT', label: 'Event', icon: CalendarDays, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'JOB', label: 'Job', icon: Briefcase, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'TOOL', label: 'Tool', icon: Wrench, color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
];

const DEFAULT_EMOJIS: Record<string, string> = {
  CUSTOM: '📢', STARTUP: '🚀', FUNDING: '💰', EVENT: '🎯', JOB: '💼', TOOL: '🛠️',
};

interface Announcement {
  id: string;
  type: string;
  text: string;
  mobileText: string | null;
  emoji: string;
  link: string;
  startupId: string | null;
  fundingRoundId: string | null;
  eventId: string | null;
  jobListingId: string | null;
  toolId: string | null;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function generateTextFromRecord(type: string, record: any): { text: string; mobileText: string; link: string } {
  switch (type) {
    case 'STARTUP':
      return {
        text: `${record.name} just launched — ${record.tagline || 'Check it out'}`,
        mobileText: `${record.name} just launched`,
        link: `/startups/${record.slug}`,
      };
    case 'FUNDING':
      return {
        text: `${record.name} raises ${record.amountInr ? '₹' + (record.amountInr / 10000000).toFixed(1) + ' Cr' : ''} in ${record.roundType || 'funding'}`,
        mobileText: `${record.name} raises funding`,
        link: `/funding/${record.slug}`,
      };
    case 'EVENT':
      return {
        text: `${record.title} — Register now`,
        mobileText: `${record.title}`,
        link: `/events/${record.slug}`,
      };
    case 'JOB':
      return {
        text: `${record.companyName} is hiring: ${record.title}`,
        mobileText: `${record.companyName} is hiring`,
        link: `/jobs/${record.slug}`,
      };
    case 'TOOL':
      return {
        text: `${record.name} — ${record.tagline || 'Discover this AI tool'}`,
        mobileText: record.name,
        link: `/tools/${record.slug}`,
      };
    default:
      return { text: '', mobileText: '', link: '' };
  }
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [form, setForm] = useState({
    type: 'CUSTOM',
    text: '',
    mobileText: '',
    emoji: '📢',
    link: '',
    startupId: null as string | null,
    fundingRoundId: null as string | null,
    eventId: null as string | null,
    jobListingId: null as string | null,
    toolId: null as string | null,
    isActive: true,
    startsAt: '',
    endsAt: '',
  });

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    const res = await getAnnouncementsAction();
    if (res.success && res.announcements) {
      setAnnouncements(res.announcements as Announcement[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const resetForm = () => {
    setForm({
      type: 'CUSTOM', text: '', mobileText: '', emoji: '📢', link: '',
      startupId: null, fundingRoundId: null, eventId: null, jobListingId: null, toolId: null,
      isActive: true, startsAt: '', endsAt: '',
    });
    setEditingId(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setForm({
      type: a.type,
      text: a.text,
      mobileText: a.mobileText || '',
      emoji: a.emoji,
      link: a.link,
      startupId: a.startupId,
      fundingRoundId: a.fundingRoundId,
      eventId: a.eventId,
      jobListingId: a.jobListingId,
      toolId: a.toolId,
      isActive: a.isActive,
      startsAt: a.startsAt ? a.startsAt.slice(0, 16) : '',
      endsAt: a.endsAt ? a.endsAt.slice(0, 16) : '',
    });
    setEditingId(a.id);
    setSearchQuery('');
    setSearchResults([]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.text || !form.link) return;
    setSaving(true);
    if (editingId) {
      await updateAnnouncementAction(editingId, {
        ...form,
        mobileText: form.mobileText || undefined,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      });
    } else {
      await createAnnouncementAction({
        ...form,
        mobileText: form.mobileText || undefined,
        startupId: form.startupId || undefined,
        fundingRoundId: form.fundingRoundId || undefined,
        eventId: form.eventId || undefined,
        jobListingId: form.jobListingId || undefined,
        toolId: form.toolId || undefined,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      });
    }
    setSaving(false);
    setModalOpen(false);
    resetForm();
    loadAnnouncements();
  };

  const handleDelete = async (id: string) => {
    if (!(await ask({ title: 'Delete announcement', message: 'It is removed from the website straight away. This can’t be undone.', confirmLabel: 'Delete', danger: true }))) return;
    await deleteAnnouncementAction(id);
    loadAnnouncements();
  };

  const handleToggle = async (id: string) => {
    await toggleAnnouncementAction(id);
    loadAnnouncements();
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const items = [...announcements];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    setAnnouncements(items);
    await reorderAnnouncementsAction(items.map(i => i.id));
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await searchExistingDataAction(form.type, q);
    if (res.success && res.results) setSearchResults(res.results);
    setSearching(false);
  };

  const handleSelectRecord = (record: any) => {
    const generated = generateTextFromRecord(form.type, record);
    const fkField = {
      STARTUP: 'startupId',
      FUNDING: 'fundingRoundId',
      EVENT: 'eventId',
      JOB: 'jobListingId',
      TOOL: 'toolId',
    }[form.type] as string;

    setForm(prev => ({
      ...prev,
      text: generated.text,
      mobileText: generated.mobileText,
      link: generated.link,
      startupId: null, fundingRoundId: null, eventId: null, jobListingId: null, toolId: null,
      [fkField]: record.id,
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleTypeChange = (type: string) => {
    setForm(prev => ({
      ...prev,
      type,
      emoji: DEFAULT_EMOJIS[type] || '📢',
      startupId: null, fundingRoundId: null, eventId: null, jobListingId: null, toolId: null,
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  const typeMeta = (t: string) => TYPES.find(x => x.value === t) || TYPES[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="portal-title">Announcements</h1>
            <p className="portal-subtitle">Manage the announcement bar on the website</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-brand flex items-center gap-2 px-4 py-2 text-sm">
          <Plus className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {/* Preview strip */}
      {announcements.filter(a => a.isActive).length > 0 && (
        <div className="bg-brand text-white text-sm py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-jakarta">
          <span className="text-base">{announcements.find(a => a.isActive)?.emoji}</span>
          <span>{announcements.find(a => a.isActive)?.text}</span>
          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 font-jakarta">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="p-8 text-center text-gray-400 font-jakarta">No announcements yet. Create one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-16">Order</th>
                  <th className="text-left p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-12"></th>
                  <th className="text-left p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400">Text</th>
                  <th className="text-left p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-24">Type</th>
                  <th className="text-center p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-20">Active</th>
                  <th className="text-left p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-28">Schedule</th>
                  <th className="text-right p-3 font-jakarta font-semibold text-gray-500 dark:text-gray-400 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map((a, i) => {
                  const meta = typeMeta(a.type);
                  const TypeIcon = meta.icon;
                  return (
                    <tr key={a.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleMove(i, 'up')}
                            disabled={i === 0}
                            className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMove(i, 'down')}
                            disabled={i === announcements.length - 1}
                            className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-lg">{a.emoji}</td>
                      <td className="p-3">
                        <div className="font-medium text-gray-900 dark:text-white font-jakarta line-clamp-1">{a.text}</div>
                        {a.mobileText && (
                          <div className="text-xs text-gray-400 mt-0.5 font-jakarta">Mobile: {a.mobileText}</div>
                        )}
                        <div className="text-xs text-brand mt-0.5 font-jakarta">{a.link}</div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${meta.color}`}>
                          <TypeIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleToggle(a.id)} className="inline-flex">
                          {a.isActive ? (
                            <ToggleRight className="w-6 h-6 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                          )}
                        </button>
                      </td>
                      <td className="p-3">
                        {(a.startsAt || a.endsAt) ? (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>Scheduled</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Always</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-brand rounded-lg hover:bg-brand/5">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(a.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-gray-900 dark:text-white">
                {editingId ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map(t => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        onClick={() => handleTypeChange(t.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                          form.type === t.value
                            ? 'border-brand bg-brand/5 text-brand'
                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data picker for non-CUSTOM types */}
              {form.type !== 'CUSTOM' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">
                    Pick existing {form.type.toLowerCase()}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder={`Search ${form.type.toLowerCase()}s...`}
                      className="input-field pl-10 w-full"
                    />
                  </div>
                  {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg max-h-40 overflow-y-auto">
                      {searchResults.map((r: any) => (
                        <button
                          key={r.id}
                          onClick={() => handleSelectRecord(r)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 font-jakarta"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">
                            {r.name || r.title || r.companyName}
                          </span>
                          {r.tagline && <span className="text-gray-400 ml-2">— {r.tagline}</span>}
                          {r.roundType && <span className="text-gray-400 ml-2">({r.roundType})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Emoji */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Emoji</label>
                <input
                  type="text"
                  value={form.emoji}
                  onChange={e => setForm(prev => ({ ...prev, emoji: e.target.value }))}
                  className="input-field w-20 text-center text-xl"
                  maxLength={4}
                />
              </div>

              {/* Text */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Announcement Text *</label>
                <input
                  type="text"
                  value={form.text}
                  onChange={e => setForm(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Your announcement text..."
                  className="input-field w-full"
                />
              </div>

              {/* Mobile text */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Mobile Text (shorter)</label>
                <input
                  type="text"
                  value={form.mobileText}
                  onChange={e => setForm(prev => ({ ...prev, mobileText: e.target.value }))}
                  placeholder="Shorter version for mobile..."
                  className="input-field w-full"
                />
              </div>

              {/* Link */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Link *</label>
                <input
                  type="text"
                  value={form.link}
                  onChange={e => setForm(prev => ({ ...prev, link: e.target.value }))}
                  placeholder="/path-to-page"
                  className="input-field w-full"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 font-jakarta">Active</label>
                <button
                  onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                  className="inline-flex"
                >
                  {form.isActive ? (
                    <ToggleRight className="w-8 h-8 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  )}
                </button>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Starts at</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={e => setForm(prev => ({ ...prev, startsAt: e.target.value }))}
                    className="input-field w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Ends at</label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={e => setForm(prev => ({ ...prev, endsAt: e.target.value }))}
                    className="input-field w-full text-sm"
                  />
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-jakarta mb-2">Preview</label>
                <div className="bg-brand text-white text-sm py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-jakarta">
                  <span className="text-base">{form.emoji}</span>
                  <span>{form.text || 'Your announcement text...'}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.text || !form.link}
                className="btn-brand px-6 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
