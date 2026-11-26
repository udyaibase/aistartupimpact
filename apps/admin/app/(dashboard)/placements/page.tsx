'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Crown, Zap, Newspaper, Calendar, Building2, CheckCircle, Clock,
  Edit3, Plus, X, Save, Trash2, Loader2, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getPlacementsAction, getPlacementStatsAction, savePlacementAction,
  saveCreativeAction, updatePlacementStatusAction, deletePlacementAction,
} from './actions';

interface Creative { id: string; zone: string; headline: string; bodyText: string; ctaText: string; ctaUrl: string; imageUrl?: string; isActive: boolean; impressionCount: number; clickCount: number; }
interface Campaign { id: string; clientName: string; companyName: string; clientEmail: string; status: string; startDate: string; endDate: string; totalBudgetPaise: number | bigint; notes?: string; createdAt: string; creatives: Creative[]; }
interface Stats { total: number; active: number; open: number; }

const ZONES = ['H1_HERO_FEATURE','H2_TRENDING_STRIP','H3_SECTION_SPONSOR','H4_NEWSLETTER_CTA','A1_IN_ARTICLE','A2_SIDEBAR_STICKY','A3_END_OF_ARTICLE','D1_TOOL_FEATURED','D2_STARTUP_BOOST','N1_NEWSLETTER_PRIMARY','N2_NEWSLETTER_FOOTER'];
const ZONE_LABELS: Record<string,string> = {
  H1_HERO_FEATURE:'Hero Cover Story', H2_TRENDING_STRIP:'Breaking Ticker',
  H3_SECTION_SPONSOR:'Section Sponsor', H4_NEWSLETTER_CTA:'Newsletter CTA',
  A1_IN_ARTICLE:'In-Article Ad', A2_SIDEBAR_STICKY:'Sidebar Sticky',
  A3_END_OF_ARTICLE:'End of Article', D1_TOOL_FEATURED:'Tool Featured',
  D2_STARTUP_BOOST:'Startup Boost', N1_NEWSLETTER_PRIMARY:'Newsletter Primary',
  N2_NEWSLETTER_FOOTER:'Newsletter Footer',
};
const STATUS_OPTS = ['PENDING_REVIEW','ACTIVE','PAUSED','COMPLETED','CANCELLED'];
const statusStyle: Record<string,string> = {
  ACTIVE:'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  PENDING_REVIEW:'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  PAUSED:'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  COMPLETED:'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  CANCELLED:'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  DRAFT:'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const emptyCampaign = { id:'', clientName:'', companyName:'', clientEmail:'', status:'PENDING_REVIEW', startDate:'', endDate:'', totalBudgetPaise:0, notes:'' };
const emptyCreative = { id:'', campaignId:'', zone:'H1_HERO_FEATURE', headline:'', bodyText:'', ctaText:'Learn More', ctaUrl:'', imageUrl:'' };

const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric'}) : '—';
const fmtBudget = (p: number | bigint) => p ? `₹${(Number(p)/100).toLocaleString('en-IN')}` : '—';

export default function PlacementsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{msg:string;ok:boolean}|null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null);
  const [saving, setSaving] = useState(false);

  // Campaign modal
  const [campModal, setCampModal] = useState(false);
  const [editCamp, setEditCamp] = useState<typeof emptyCampaign|null>(null);

  // Creative modal
  const [creativeModal, setCreativeModal] = useState(false);
  const [editCreative, setEditCreative] = useState<typeof emptyCreative|null>(null);

  const showToast = (msg:string, ok=true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),3500); };

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c] = await Promise.all([getPlacementStatsAction(), getPlacementsAction()]);
    if (s.success && s.data) setStats(s.data as Stats);
    if (c.success) setCampaigns(c.data as Campaign[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveCampaign = async () => {
    if (!editCamp || !editCamp.clientName || !editCamp.companyName) return;
    setSaving(true);
    const res = await savePlacementAction({
      id: editCamp.id || undefined,
      clientName: editCamp.clientName, companyName: editCamp.companyName,
      clientEmail: editCamp.clientEmail, startDate: editCamp.startDate,
      endDate: editCamp.endDate, totalBudgetPaise: Number(editCamp.totalBudgetPaise),
      notes: editCamp.notes, status: editCamp.status,
    });
    setSaving(false);
    if (res.success) { showToast('Saved'); setCampModal(false); setEditCamp(null); load(); }
    else showToast(res.error||'Failed', false);
  };

  const handleSaveCreative = async () => {
    if (!editCreative || !editCreative.headline || !editCreative.campaignId) return;
    setSaving(true);
    const res = await saveCreativeAction({
      id: editCreative.id || undefined,
      campaignId: editCreative.campaignId, zone: editCreative.zone,
      headline: editCreative.headline, bodyText: editCreative.bodyText,
      ctaText: editCreative.ctaText, ctaUrl: editCreative.ctaUrl,
      imageUrl: editCreative.imageUrl,
    });
    setSaving(false);
    if (res.success) { showToast('Creative saved'); setCreativeModal(false); setEditCreative(null); load(); }
    else showToast(res.error||'Failed', false);
  };

  const handleStatusChange = async (id:string, status:string) => {
    const res = await updatePlacementStatusAction(id, status);
    if (res.success) { showToast('Status updated'); load(); }
    else showToast(res.error||'Failed', false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const res = await deletePlacementAction(deleteConfirm);
    setDeleteConfirm(null);
    if (res.success) { showToast('Deleted'); load(); }
    else showToast(res.error||'Failed', false);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-jakarta font-medium flex items-center gap-2 ${toast.ok?'bg-green-500 text-white':'bg-red-500 text-white'}`}>
          {toast.ok ? <CheckCircle className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>} {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Placements</h1>
          <p className="portal-subtitle">Manage paid startup story placements across the site</p>
        </div>
        <button onClick={() => { setEditCamp({...emptyCampaign}); setCampModal(true); }} className="btn-brand text-sm flex items-center gap-2">
          <Plus className="w-4 h-4"/> New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label:'Total Campaigns', value: stats?.total ?? '—', color:'text-navy dark:text-white' },
          { label:'Active', value: stats?.active ?? '—', color:'text-green-600 dark:text-green-400' },
          { label:'Pending Review', value: stats?.open ?? '—', color:'text-yellow-600 dark:text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 text-center">
            <p className={`font-sora font-extrabold text-2xl ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 font-jakarta mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Campaigns */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand"/></div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-12 text-center text-sm text-gray-400 font-jakarta">
          No campaigns yet. Create your first placement campaign.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-visible">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-brand"/>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-sora font-bold text-sm text-navy dark:text-white">{c.companyName}</h3>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusStyle[c.status]||statusStyle.DRAFT}`}>
                          {c.status === 'ACTIVE' ? <CheckCircle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                          {c.status.replace('_',' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 font-jakarta mt-0.5">{c.clientName} · {c.clientEmail}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 font-jakarta">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {fmt(c.startDate)} → {fmt(c.endDate)}</span>
                        <span className="font-semibold text-brand">{fmtBudget(c.totalBudgetPaise)}</span>
                        <span>{c.creatives.length} creative{c.creatives.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select value={c.status} onChange={e => handleStatusChange(c.id, e.target.value)}
                      className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-jakarta">
                      {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                    <button onClick={() => { setEditCamp({id:c.id,clientName:c.clientName,companyName:c.companyName,clientEmail:c.clientEmail,status:c.status,startDate:c.startDate?.slice(0,10)||'',endDate:c.endDate?.slice(0,10)||'',totalBudgetPaise:Number(c.totalBudgetPaise),notes:c.notes||''}); setCampModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><Edit3 className="w-4 h-4 text-gray-400"/></button>
                    <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500"/></button>
                    <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                      {expanded === c.id ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Creatives */}
              {expanded === c.id && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide font-jakarta">Ad Creatives / Zones</h4>
                    <button onClick={() => { setEditCreative({...emptyCreative, campaignId:c.id}); setCreativeModal(true); }}
                      className="text-xs text-brand font-semibold flex items-center gap-1 hover:underline">
                      <Plus className="w-3 h-3"/> Add Creative
                    </button>
                  </div>
                  {c.creatives.length === 0 ? (
                    <p className="text-xs text-gray-400 font-jakarta italic">No creatives yet. Add a zone/creative to this campaign.</p>
                  ) : (
                    <div className="space-y-2">
                      {c.creatives.map(cr => (
                        <div key={cr.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-brand font-jakarta">{ZONE_LABELS[cr.zone]||cr.zone}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cr.isActive?'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400':'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
                                {cr.isActive?'LIVE':'PAUSED'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 font-jakarta mt-0.5 line-clamp-1">{cr.headline}</p>
                            <p className="text-[10px] text-gray-400 font-jakarta mt-0.5">{cr.impressionCount.toLocaleString()} impressions · {cr.clickCount.toLocaleString()} clicks</p>
                          </div>
                          <button onClick={() => { setEditCreative({id:cr.id,campaignId:c.id,zone:cr.zone,headline:cr.headline,bodyText:cr.bodyText,ctaText:cr.ctaText,ctaUrl:cr.ctaUrl,imageUrl:cr.imageUrl||''}); setCreativeModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"><Edit3 className="w-3.5 h-3.5 text-gray-400"/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Campaign Modal */}
      {campModal && editCamp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{editCamp.id ? 'Edit Campaign' : 'New Campaign'}</h2>
              <button onClick={() => { setCampModal(false); setEditCamp(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400"/></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Client Name *</label>
                  <input className="input-field text-sm" value={editCamp.clientName} onChange={e=>setEditCamp({...editCamp,clientName:e.target.value})} placeholder="John Doe"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Company *</label>
                  <input className="input-field text-sm" value={editCamp.companyName} onChange={e=>setEditCamp({...editCamp,companyName:e.target.value})} placeholder="Sarvam AI"/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Client Email</label>
                <input type="email" className="input-field text-sm" value={editCamp.clientEmail} onChange={e=>setEditCamp({...editCamp,clientEmail:e.target.value})} placeholder="ads@company.com"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Start Date</label>
                  <input type="date" className="input-field text-sm" value={editCamp.startDate} onChange={e=>setEditCamp({...editCamp,startDate:e.target.value})}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">End Date</label>
                  <input type="date" className="input-field text-sm" value={editCamp.endDate} onChange={e=>setEditCamp({...editCamp,endDate:e.target.value})}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Budget (₹)</label>
                  <input type="number" className="input-field text-sm" value={Number(editCamp.totalBudgetPaise)/100||''} onChange={e=>setEditCamp({...editCamp,totalBudgetPaise:Number(e.target.value)*100})} placeholder="75000"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Status</label>
                  <select className="input-field text-sm" value={editCamp.status} onChange={e=>setEditCamp({...editCamp,status:e.target.value})}>
                    {STATUS_OPTS.map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Notes</label>
                <textarea className="input-field text-sm" rows={2} value={editCamp.notes} onChange={e=>setEditCamp({...editCamp,notes:e.target.value})} placeholder="Internal notes..."/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setCampModal(false); setEditCamp(null); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSaveCampaign} disabled={!editCamp.clientName||!editCamp.companyName||saving} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creative Modal */}
      {creativeModal && editCreative && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">{editCreative.id ? 'Edit Creative' : 'New Creative'}</h2>
              <button onClick={() => { setCreativeModal(false); setEditCreative(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-4 h-4 text-gray-400"/></button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Placement Zone</label>
                <select className="input-field text-sm" value={editCreative.zone} onChange={e=>setEditCreative({...editCreative,zone:e.target.value})}>
                  {ZONES.map(z=><option key={z} value={z}>{ZONE_LABELS[z]||z}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Headline *</label>
                <input className="input-field text-sm" value={editCreative.headline} onChange={e=>setEditCreative({...editCreative,headline:e.target.value})} placeholder="Sarvam AI raises $41M Series A"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Body Text</label>
                <textarea className="input-field text-sm" rows={3} value={editCreative.bodyText} onChange={e=>setEditCreative({...editCreative,bodyText:e.target.value})} placeholder="Brief description..."/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">CTA Text</label>
                  <input className="input-field text-sm" value={editCreative.ctaText} onChange={e=>setEditCreative({...editCreative,ctaText:e.target.value})} placeholder="Learn More"/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">CTA URL</label>
                  <input className="input-field text-sm" value={editCreative.ctaUrl} onChange={e=>setEditCreative({...editCreative,ctaUrl:e.target.value})} placeholder="https://..."/>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block font-jakarta">Image URL (optional)</label>
                <input className="input-field text-sm" value={editCreative.imageUrl} onChange={e=>setEditCreative({...editCreative,imageUrl:e.target.value})} placeholder="https://..."/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => { setCreativeModal(false); setEditCreative(null); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button onClick={handleSaveCreative} disabled={!editCreative.headline||saving} className="btn-brand text-sm flex items-center gap-2 disabled:opacity-50">
                {saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm p-6 text-center border border-gray-200 dark:border-gray-800">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3"/>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Campaign?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-1">All creatives will also be deleted. This cannot be undone.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
