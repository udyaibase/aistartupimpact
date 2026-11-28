'use client';

import { reviewStatusOf, REVIEW_STATUS_LABEL } from '@udyaibase/utils/startup-review';
import { notify } from '@/components/Toast';
import { Eye } from 'lucide-react';
import Link from 'next/link';
import type { ConfirmRequest, FounderDetail } from './types';

/** The startups and tools this founder submitted, with the review actions for each. */
export default function FounderSubmissions({ founder, setViewingStartup, setIsRejecting, setRejectReason, setConfirmAction, setRejectingTool, loadFounder }: {
  founder: FounderDetail;
  setViewingStartup: (v: any) => void;
  setIsRejecting: (v: boolean) => void;
  setRejectReason: (v: string) => void;
  setConfirmAction: (v: ConfirmRequest | null) => void;
  setRejectingTool: (v: { id: string; name: string } | null) => void;
  loadFounder: () => void;
}) {
  return (
    <>
      {/* Submissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Startups */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Startups ({founder.startups.length})</h2>
          </div>
          <div className="p-6">
            {founder.startups.length > 0 ? (
              <div className="space-y-3">
                {founder.startups.map((startup) => (
                  <div key={startup.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{startup.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{startup.tagline}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {/* Our review, not ownership: a verified startup can still be waiting for approval. */}
                          {(() => {
                            const review = reviewStatusOf({ ...(startup as { isApproved?: boolean; reviewStatus?: string }), claimStatus: startup.status });
                            const tone = review === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : review === 'IN_REVIEW' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
                            return <span className={`text-xs px-2 py-1 rounded-full font-semibold ${tone}`}>{REVIEW_STATUS_LABEL[review]}</span>;
                          })()}
                          {(startup.status === 'VERIFIED') && <span className="text-xs px-2 py-1 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Owns the website</span>}
                          <span className="text-xs text-gray-400">
                            {new Date(startup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0 justify-center">
                        <button 
                          onClick={() => {
                            setViewingStartup(startup);
                            setIsRejecting(false);
                            setRejectReason('');
                          }}
                          className="text-brand hover:underline text-xs font-bold flex items-center gap-1 justify-center py-1.5 border border-brand/20 bg-brand/5 hover:bg-brand/10 px-3 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8 font-jakarta text-sm">No startups submitted yet</p>
            )}
          </div>
        </div>

        {/* Tools */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">AI Tools ({founder.tools.length})</h2>
          </div>
          <div className="p-6">
            {founder.tools.length > 0 ? (
              <div className="space-y-3">
                {founder.tools.map((tool) => (
                  <div key={tool.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-brand transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{tool.tagline}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                            tool.status === 'APPROVED' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : tool.status === 'PENDING'
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                              : tool.status === 'ARCHIVED'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                          }`}>
                            {tool.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(tool.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {tool.status === 'PENDING' && (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  title: 'Approve Tool',
                                  message: `Approve "${tool.name}"?`,
                                  variant: 'warning',
                                  confirmLabel: 'Approve',
                                  requireTyping: false,
                                  onConfirm: async () => {
                                    try {
                                      const res = await fetch(`/api/admin/tools/${tool.id}/approve`, { method: 'POST' });
                                      if (res.ok) {
                                        notify('Tool approved!');
                                        loadFounder();
                                      } else {
                                        notify('Failed to approve');
                                      }
                                    } catch (err) {
                                      notify('Error approving tool');
                                    }
                                    setConfirmAction(null);
                                  },
                                });
                              }}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => setRejectingTool({ id: tool.id, name: tool.name })}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        )}
                        <Link 
                          href={`/tools-dir?search=${tool.slug}`}
                          className="text-brand hover:underline text-xs font-medium flex items-center gap-1 justify-center py-1"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8 font-jakarta text-sm">No tools submitted yet</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
