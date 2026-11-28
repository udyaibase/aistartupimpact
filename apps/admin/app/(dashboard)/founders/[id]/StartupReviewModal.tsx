'use client';

import { notify } from '@/components/Toast';
import { Building2, Globe, Linkedin, Twitter, X, ExternalLink } from 'lucide-react';
import type { ConfirmRequest, FounderDetail } from './types';

/** The full details of one submitted startup, with approve and reject. */
export default function StartupReviewModal({ viewingStartup, setViewingStartup, isRejecting, setIsRejecting, rejectReason, setRejectReason, actionLoading, setActionLoading, setConfirmAction, loadFounder, founder }: {
  viewingStartup: any;
  setViewingStartup: (v: any) => void;
  isRejecting: boolean;
  setIsRejecting: (v: boolean) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
  setConfirmAction: (v: ConfirmRequest | null) => void;
  loadFounder: () => void;
  founder: FounderDetail;
}) {
  return (
    <>
      {viewingStartup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center overflow-hidden shrink-0 border border-brand/20">
                  {viewingStartup.logoUrl ? (
                    <img src={viewingStartup.logoUrl} alt={viewingStartup.name} className="w-full h-full object-contain p-1" />
                  ) : (
                    <Building2 className="w-6 h-6 text-brand" />
                  )}
                </div>
                <div>
                  <h3 className="font-sora font-bold text-lg text-gray-900 dark:text-white">
                    {viewingStartup.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                    Submitted: {new Date(viewingStartup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingStartup(null)} 
                className="p-1.5 hover:bg-gray-150 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 font-jakarta text-sm">
              {/* Tagline */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Tagline</p>
                <p className="text-base text-gray-900 dark:text-white font-medium">{viewingStartup.tagline}</p>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Description</p>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-150 dark:border-gray-800/60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {viewingStartup.description || 'No description provided.'}
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stage</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1 capitalize">
                    {viewingStartup.stage?.replace(/_/g, ' ') || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Founded Year</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.foundedYear || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employees</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.employeeCount || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Headquarters</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.headquartersCity || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.category || 'N/A'}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/20 p-3 rounded-lg border border-gray-150 dark:border-gray-800">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Business Type</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingStartup.businessType || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Links */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Links</p>
                <div className="flex flex-wrap gap-3">
                  {viewingStartup.websiteUrl && (
                    <a href={viewingStartup.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Globe className="w-3.5 h-3.5" /> Website <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {viewingStartup.linkedinUrl && (
                    <a href={viewingStartup.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Linkedin className="w-3.5 h-3.5" /> LinkedIn <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {viewingStartup.twitterUrl && (
                    <a href={viewingStartup.twitterUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-850 hover:bg-brand/10 hover:text-brand text-gray-700 dark:text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-200 dark:border-gray-800">
                      <Twitter className="w-3.5 h-3.5" /> Twitter <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {!viewingStartup.websiteUrl && !viewingStartup.linkedinUrl && !viewingStartup.twitterUrl && (
                    <span className="text-gray-400 italic">No links provided.</span>
                  )}
                </div>
              </div>

              {/* Founders Data */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Founders & Team</p>
                {viewingStartup.foundersData && Array.isArray(JSON.parse(JSON.stringify(viewingStartup.foundersData))) && (JSON.parse(JSON.stringify(viewingStartup.foundersData)).length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {JSON.parse(JSON.stringify(viewingStartup.foundersData)).map((f: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2.5 p-2 bg-gray-50 dark:bg-gray-850 rounded-lg border border-gray-150 dark:border-gray-850">
                        {f.avatar ? (
                          <img src={f.avatar} alt={f.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs shrink-0">
                            {f.name?.charAt(0) || 'F'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-gray-900 dark:text-white truncate">{f.name}</p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{f.role || 'Founder'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No detailed founders data provided.</p>
                )}
              </div>

              {/* Funding Rounds */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Funding Rounds</p>
                {viewingStartup.fundingRounds && viewingStartup.fundingRounds.length > 0 ? (
                  <div className="space-y-3">
                    {viewingStartup.fundingRounds.map((round: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-850 rounded-xl border border-gray-150 dark:border-gray-800 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="badge-category text-[10px] font-bold px-2 py-0.5 capitalize bg-brand/5 text-brand border border-brand/10">
                            {round.roundType?.replace(/_/g, ' ') || 'Unknown Round'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {round.announcedAt ? new Date(round.announcedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Date N/A'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {round.amountInr && Number(round.amountInr) > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Amount (INR)</p>
                              <p className="font-semibold text-xs text-gray-900 dark:text-white mt-0.5">
                                ₹{(Number(round.amountInr) / 10000000).toFixed(2)} Cr
                              </p>
                            </div>
                          )}
                          {round.amountUsd && Number(round.amountUsd) > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Amount (USD)</p>
                              <p className="font-semibold text-xs text-gray-900 dark:text-white mt-0.5">
                                ${(Number(round.amountUsd) / 1000000).toFixed(2)} M
                              </p>
                            </div>
                          )}
                        </div>
                        {((round.leadInvestors && round.leadInvestors.length > 0) || (round.allInvestors && round.allInvestors.length > 0)) && (
                          <div className="text-xs space-y-1 pt-1 border-t border-gray-150/40 dark:border-gray-800/40">
                            {round.leadInvestors && round.leadInvestors.length > 0 && (
                              <p className="text-gray-750 dark:text-gray-300">
                                <span className="font-semibold text-gray-500">Lead Investors:</span> {round.leadInvestors.join(', ')}
                              </p>
                            )}
                            {round.allInvestors && round.allInvestors.length > 0 && (
                              <p className="text-gray-750 dark:text-gray-300">
                                <span className="font-semibold text-gray-500">All Investors:</span> {round.allInvestors.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No funding rounds declared.</p>
                )}
              </div>

              {/* FAQs */}
              <div>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Frequently Asked Questions</p>
                {viewingStartup.faqs && viewingStartup.faqs.length > 0 ? (
                  <div className="space-y-3">
                    {viewingStartup.faqs.map((faq: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-850/50 rounded-xl border border-gray-150 dark:border-gray-800/60">
                        <p className="font-semibold text-xs text-gray-900 dark:text-white mb-1.5 flex items-start gap-1">
                          <span className="text-brand shrink-0">Q.</span>
                          <span>{faq.question}</span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 text-xs pl-4 leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 italic">No FAQs added.</p>
                )}
              </div>

              {/* Rejection Form Input */}
              {isRejecting && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl space-y-3 animate-in slide-in-from-bottom-2">
                  <label className="block text-xs font-bold text-red-800 dark:text-red-300 uppercase tracking-wider">
                    Rejection Reason (Sent to Founder)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Please add a valid website URL or update the description to reflect your core product details."
                    rows={3}
                    className="w-full px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsRejecting(false)}
                      className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!rejectReason.trim()) {
                          notify('Rejection reason is required');
                          return;
                        }
                        setActionLoading(true);
                        try {
                          const res = await fetch(`/api/founder/startups/${viewingStartup.id}/reject`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reason: rejectReason.trim() })
                          });
                          if (res.ok) {
                            notify('Startup rejected successfully');
                            setViewingStartup(null);
                            loadFounder();
                          } else {
                            const data = await res.json();
                            notify(`Failed to reject: ${data.error || 'Unknown error'}`);
                          }
                        } catch (err) {
                          notify('Error rejecting startup');
                        } finally {
                          setActionLoading(false);
                        }
                      }}
                      disabled={actionLoading}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                    >
                      {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex items-center justify-between flex-shrink-0">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Current Status:</span>
                <span className={`ml-1.5 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  viewingStartup.status === 'CLAIMED' || viewingStartup.status === 'VERIFIED'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : viewingStartup.status === 'PENDING'
                    ? 'bg-orange-150 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {viewingStartup.status}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewingStartup(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Close
                </button>

                {!viewingStartup.isApproved && !isRejecting && (
                  <>
                    <button
                      onClick={() => setIsRejecting(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      ✗ Reject Claim
                    </button>

                    <button
                      onClick={() => {
                        setConfirmAction({
                          title: 'Approve Startup Claim',
                          message: `Approve claim and listing for "${viewingStartup.name}"?`,
                          variant: 'warning',
                          confirmLabel: 'Approve',
                          requireTyping: false,
                          onConfirm: async () => {
                            setActionLoading(true);
                            try {
                              const res = await fetch(`/api/founder/startups/${viewingStartup.id}/approve`, { method: 'POST' });
                              if (res.ok) {
                                notify('Startup approved successfully!');
                                setViewingStartup(null);
                                loadFounder();
                              } else {
                                const data = await res.json();
                                notify(`Failed to approve: ${data.error || 'Unknown error'}`);
                              }
                            } catch (err) {
                              notify('Error approving startup');
                            } finally {
                              setActionLoading(false);
                            }
                            setConfirmAction(null);
                          },
                        });
                      }}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? 'Approving...' : '✓ Approve Claim'}
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
