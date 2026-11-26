'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import {
  Mail, Users, Send, Plus, Eye, Clock, CheckCircle, TrendingUp,
  Edit3, X, Save, Trash2, Loader2, AlertCircle, FlaskConical,
  Monitor, Smartphone, Tablet,
} from 'lucide-react';
import {
  getNewsletterStatsAction, getCampaignsAction, saveCampaignAction,
  deleteCampaignAction, sendCampaignAction, sendTestEmailAction,
} from './actions';
import { NEWSLETTER_TEMPLATES, generateNewsletterHtml } from '@/lib/newsletter-templates';

interface Campaign {
  id: string; subject: string; previewText: string; body: string;
  sentAt: string | null; scheduledAt: string | null;
  status: string; totalSent: number; opens: number; uniqueOpens: number; 
  clicks: number; uniqueClicks: number; unsubscribes: number;
}
interface Stats { total: number; active: number; sentCount: number; openRate: string; ctr: string; }

const empty: Omit<Campaign, 'id'> = {
  subject: '', previewText: '', body: '', sentAt: null,
  scheduledAt: null, status: 'DRAFT', totalSent: 0, opens: 0, uniqueOpens: 0,
  clicks: 0, uniqueClicks: 0, unsubscribes: 0,
};
const statusStyle: Record<string, string> = {
  SENT: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  SENDING: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  DRAFT: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

export default function NewsletterAdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testModalId, setTestModalId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [selectedTemplate, setSelectedTemplate] = useState('modern');
  const [sendConfirm, setSendConfirm] = useState<{ type: 'send' | 'test'; id: string } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // Generate preview HTML using professional template system
  const getPreviewHtml = (body: string, subject: string) => {
    return generateNewsletterHtml(selectedTemplate, subject, body);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([getNewsletterStatsAction(), getCampaignsAction()]);
    if (s.success && s.data) setStats(s.data as Stats);
    if (c.success) setCampaigns((c.data as any[]).map(r => ({
      id: r.id, subject: r.subject, previewText: r.previewText || '',
      body: (r.contentJson as any)?.html || '',
      sentAt: r.sentAt, scheduledAt: r.scheduledAt,
      status: r.status, totalSent: Number(r.totalSent || 0),
      opens: Number(r.opens || 0), uniqueOpens: Number(r.uniqueOpens || 0),
      clicks: Number(r.clicks || 0), uniqueClicks: Number(r.uniqueClicks || 0),
      unsubscribes: Number(r.unsubscribes || 0),
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing({ id: '', ...empty }); setModalOpen(true); };
  const openEdit = (c: Campaign) => { setEditing({ ...c }); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSave = async () => {
    if (!editing || !editing.subject.trim()) return;
    setSaving(true);
    const res = await saveCampaignAction({
      id: editing.id || undefined,
      subject: editing.subject, previewText: editing.previewText,
      body: editing.body, scheduledAt: editing.scheduledAt || undefined,
      templateId: selectedTemplate,
    });
    setSaving(false);
    if (res.success) { showToast('Campaign saved'); closeModal(); load(); }
    else showToast(res.error || 'Save failed', false);
  };

  const handleSend = async (id: string) => {
    setSendConfirm(null);
    setSending(id);
    const res = await sendCampaignAction(id);
    setSending(null);
    if (res.success) { showToast(`Sent to ${res.sent} subscribers`); load(); }
    else showToast(res.error || 'Send failed', false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const res = await deleteCampaignAction(deleteConfirm);
    setDeleteConfirm(null);
    if (res.success) { setCampaigns(prev => prev.filter(c => c.id !== deleteConfirm)); showToast('Deleted'); }
    else showToast(res.error || 'Delete failed', false);
  };

  const handleSendTest = async () => {
    if (!testModalId || !testEmail) return;
    setSendConfirm(null);
    const res = await sendTestEmailAction(testModalId, testEmail);
    setTestModalId(null); setTestEmail('');
    if (res.success) showToast('Test email sent');
    else showToast(res.error || 'Failed', false);
  };

  const statCards = stats ? [
    { label: 'Total Subscribers', value: stats.total.toLocaleString(), icon: Users },
    { label: 'Active Subscribers', value: stats.active.toLocaleString(), icon: Mail },
    { label: 'Campaigns Sent', value: stats.sentCount.toString(), icon: Send },
    { label: 'Avg Open Rate', value: `${stats.openRate}%`, icon: Eye },
    { label: 'Click-through Rate', value: `${stats.ctr}%`, icon: TrendingUp },
  ] : [];


  const rate = (part: number, whole: number) => (whole > 0 && part > 0 ? `${((part / whole) * 100).toFixed(1)}%` : null);
  const campaignColumns = useMemo<Column<Campaign>[]>(() => [
    {
      key: 'subject', header: 'Subject', sortValue: (c) => c.subject, searchValue: (c) => `${c.subject} ${c.previewText ?? ''}`,
      cell: (c) => (
        <div className="min-w-[200px] max-w-md">
          <p className="font-semibold text-gray-900 dark:text-white line-clamp-1">{c.subject}</p>
          {c.previewText && <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{c.previewText}</p>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', sortValue: (c) => c.status,
      cell: (c) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusStyle[c.status] || statusStyle.DRAFT}`}>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</span>,
    },
    {
      key: 'sentAt', header: 'Sent', sortValue: (c) => (c.sentAt ? new Date(c.sentAt) : null),
      cell: (c) => <span className="whitespace-nowrap text-xs">{c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '–'}</span>,
    },
    { key: 'sentTo', header: 'Sent to', align: 'right', sortValue: (c) => c.totalSent, cell: (c) => <span className="tabular-nums">{c.totalSent > 0 ? c.totalSent.toLocaleString('en-IN') : '–'}</span> },
    {
      key: 'opens', header: 'Opened', align: 'right', sortValue: (c) => (c.totalSent > 0 ? c.uniqueOpens / c.totalSent : null),
      cell: (c) => <span className="tabular-nums">{rate(c.uniqueOpens, c.totalSent) ?? '–'}{c.uniqueOpens > 0 && <span className="block text-xs text-gray-600 dark:text-gray-400">{c.uniqueOpens.toLocaleString('en-IN')}</span>}</span>,
    },
    {
      key: 'clicks', header: 'Clicked', align: 'right', sortValue: (c) => (c.totalSent > 0 ? c.uniqueClicks / c.totalSent : null),
      cell: (c) => <span className="tabular-nums">{rate(c.uniqueClicks, c.totalSent) ?? '–'}{c.uniqueClicks > 0 && <span className="block text-xs text-gray-600 dark:text-gray-400">{c.uniqueClicks.toLocaleString('en-IN')}</span>}</span>,
    },
    { key: 'unsubs', header: 'Unsubscribed', align: 'right', sortValue: (c) => c.unsubscribes, cell: (c) => <span className="tabular-nums">{c.unsubscribes > 0 ? c.unsubscribes.toLocaleString('en-IN') : '–'}</span> },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
            <button onClick={() => setSendConfirm({ type: 'send', id: c.id })} disabled={sending === c.id} aria-label={`Send ${c.subject} to subscribers`}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 inline-flex items-center gap-1">
              {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Send className="w-3 h-3" aria-hidden />} Send
            </button>
          )}
          {c.status !== 'SENT' && (
            <button onClick={() => setTestModalId(c.id)} title="Send a test email" aria-label={`Send a test of ${c.subject}`} className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><FlaskConical className="w-4 h-4" aria-hidden /></button>
          )}
          <button onClick={() => openEdit(c)} title="Edit" aria-label={`Edit ${c.subject}`} className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Edit3 className="w-4 h-4" aria-hidden /></button>
          <button onClick={() => setDeleteConfirm(c.id)} title="Delete" aria-label={`Delete ${c.subject}`} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers; only `sending` changes how they look
  ], [sending]);
  const campaignFilters = useMemo<TableFilter<Campaign>[]>(() => [
    { key: 'status', label: 'Status', options: [...new Set(campaigns.map((c) => c.status))].sort().map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() })), matches: (c, v) => c.status === v },
  ], [campaigns]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-jakarta font-medium flex items-center gap-2 ${toast.ok ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Newsletter</h1>
          <p className="portal-subtitle">Manage email campaigns and subscribers</p>
        </div>
        <button onClick={openCreate} className="btn-brand text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> New Campaign</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
              <s.icon className="w-5 h-5 text-gray-400 dark:text-gray-500 mb-3" />
              <p className="font-sora font-extrabold text-xl text-navy dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-400 font-jakarta mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <section aria-labelledby="campaigns-title" className="space-y-3">
        <h2 id="campaigns-title" className="portal-section-title">Campaigns</h2>
        <DataTable
          tableId="newsletter-campaigns"
          noun="campaigns"
          rows={campaigns}
          rowKey={(c) => c.id}
          columns={campaignColumns}
          filters={campaignFilters}
          loading={loading}
          searchPlaceholder="Search subject"
          empty={{ title: 'No campaigns yet', description: 'Create your first newsletter to see it here.' }}
        />
      </section>

      {/* Create/Edit Modal */}
      {modalOpen && editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-[95vw] shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{editing.id ? 'Edit Campaign' : 'New Campaign'}</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowPreview(!showPreview)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                    showPreview 
                      ? 'bg-brand text-white' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showPreview ? 'Hide Preview' : 'Show Preview'}
                </button>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Subject *</label>
                  <input type="text" className="input-field text-sm" value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Weekly AI Pulse #..." />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Preview Text</label>
                  <input type="text" className="input-field text-sm" value={editing.previewText} onChange={(e) => setEditing({ ...editing, previewText: e.target.value })} placeholder="Brief preview shown in inbox..." />
                </div>
              </div>

              {/* Template Selector */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 block font-jakarta">Email Template</label>
                <div className="grid grid-cols-4 gap-2">
                  {NEWSLETTER_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selectedTemplate === t.id
                          ? 'border-brand bg-brand/5 dark:bg-brand/10'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className="font-sora font-bold text-xs text-navy dark:text-white block">{t.name}</span>
                      <span className="text-[10px] text-gray-400 font-jakarta mt-0.5 block line-clamp-2">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Email Body (HTML)</label>
                <div className={`grid ${showPreview ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  {/* Code Editor */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-jakarta font-medium">HTML Code</div>
                    </div>
                    <textarea 
                      className="input-field text-sm font-mono resize-none" 
                      rows={20} 
                      value={editing.body} 
                      onChange={(e) => setEditing({ ...editing, body: e.target.value })} 
                      placeholder="<p>Hello readers,</p><p>This week in Indian AI...</p>" 
                    />
                    <p className="text-xs text-gray-400 font-jakarta mt-2">Write HTML. It will be wrapped in the branded email template automatically.</p>
                  </div>
                  
                  {/* Enhanced Live Preview */}
                  {showPreview && (
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-jakarta font-medium">Live Preview</div>
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                          <button
                            onClick={() => setPreviewDevice('mobile')}
                            className={`p-1.5 rounded transition-colors ${
                              previewDevice === 'mobile' 
                                ? 'bg-white dark:bg-gray-700 text-brand shadow-sm' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            title="Mobile (375px)"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewDevice('tablet')}
                            className={`p-1.5 rounded transition-colors ${
                              previewDevice === 'tablet' 
                                ? 'bg-white dark:bg-gray-700 text-brand shadow-sm' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            title="Tablet (768px)"
                          >
                            <Tablet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewDevice('desktop')}
                            className={`p-1.5 rounded transition-colors ${
                              previewDevice === 'desktop' 
                                ? 'bg-white dark:bg-gray-700 text-brand shadow-sm' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                            title="Desktop (600px)"
                          >
                            <Monitor className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center p-4">
                        <div 
                          className={`bg-white transition-all duration-300 ${
                            previewDevice === 'mobile' ? 'w-[375px]' : 
                            previewDevice === 'tablet' ? 'w-full max-w-[768px]' : 
                            'w-full'
                          }`}
                          style={{ 
                            height: '600px',
                            overflow: 'auto',
                            boxShadow: previewDevice !== 'desktop' ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                            borderRadius: previewDevice !== 'desktop' ? '8px' : '0'
                          }}
                        >
                          <iframe
                            srcDoc={getPreviewHtml(editing.body, editing.subject)}
                            className="w-full h-full border-0"
                            title="Email Preview"
                            sandbox="allow-same-origin"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 font-jakarta mt-2 text-center">
                        {previewDevice === 'mobile' && '📱 Mobile view (375px) - How it looks on phones'}
                        {previewDevice === 'tablet' && '📱 Tablet view (768px) - How it looks on tablets'}
                        {previewDevice === 'desktop' && '💻 Desktop view (600px) - How it looks in email clients'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Schedule (optional)</label>
                <input type="datetime-local" className="input-field text-sm" value={editing.scheduledAt || ''} onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value || null })} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={!editing.subject || saving} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Email Modal */}
      {testModalId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white mb-4">Send Test Email</h3>
            <input type="email" className="input-field text-sm w-full" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setTestModalId(null); setTestEmail(''); }} className="flex-1 btn-secondary text-sm">Cancel</button>
              <button onClick={() => setSendConfirm({ type: 'test', id: testModalId! })} disabled={!testEmail} className="flex-1 btn-brand text-sm disabled:opacity-50">Send Test</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Campaign?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-1">This action cannot be undone.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Confirm */}
      {sendConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Send className="w-10 h-10 text-brand mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">
              {sendConfirm.type === 'send' ? 'Send to All Subscribers?' : 'Send Test Email?'}
            </h3>
            <p className="text-sm text-gray-500 font-jakarta mt-1">
              {sendConfirm.type === 'send'
                ? 'This will deliver the newsletter to all active subscribers. This cannot be undone.'
                : `A test email will be sent to ${testEmail || 'the specified address'}.`}
            </p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setSendConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">Cancel</button>
              <button
                onClick={() => {
                  if (sendConfirm.type === 'send') handleSend(sendConfirm.id);
                  else handleSendTest();
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-brand hover:bg-brand/90 text-white rounded-xl"
              >
                {sendConfirm.type === 'send' ? 'Yes, Send Now' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
