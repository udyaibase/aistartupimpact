'use client';

import { useState } from 'react';
import { Flag, X, Loader2, CheckCircle } from 'lucide-react';
import { useHumanCheck } from '@/components/shared/useHumanCheck';

const REPORT_TYPES = [
  { value: 'incorrect_info', label: 'Incorrect information' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'trademark', label: 'Trademark concern' },
  { value: 'copyright', label: 'Copyright concern' },
  { value: 'broken_links', label: 'Broken links' },
  { value: 'spam', label: 'Spam / fake listing' },
  { value: 'other', label: 'Other' },
];

interface ReportButtonProps {
  entityType: 'STARTUP' | 'TOOL' | 'EVENT';
  entityId: string;
  entityName: string;
  entitySlug: string;
}

export default function ReportButton({ entityType, entityId, entityName, entitySlug }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const human = useHumanCheck();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportType || !description) { setError('Please select a type and describe the issue.'); return; }
    if (!human.ready) { setError('Complete the quick security check, then send.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, entityName, entitySlug, reportType, description, reporterEmail: email || null, turnstileToken: human.token }),
      });
      human.reset(); // a check works once
      const d = await res.json();
      if (d.success) { setDone(true); }
      else { setError(d.error || 'Failed to submit report.'); }
    } catch { setError('Network error.'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 font-jakarta transition-colors">
        <Flag className="w-3 h-3" /> Report
      </button>

      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-800 dark:text-white font-sora">Report an Issue</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" aria-label="Close"><X className="w-4 h-4 text-gray-400"/></button>
            </div>

            {done ? (
              <div className="p-6 text-center space-y-3">
                <CheckCircle className="w-10 h-10 text-green-600 mx-auto"/>
                <p className="text-sm font-bold text-gray-800 dark:text-white font-jakarta">Report Submitted</p>
                <p className="text-xs text-gray-500 font-jakarta">Thank you. Our team will review this and take appropriate action.</p>
                <button onClick={() => { setOpen(false); setDone(false); setReportType(''); setDescription(''); }} className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg font-jakarta">Done</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 font-jakarta uppercase">Reporting</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{entityName}</p>
                  <p className="text-xs text-gray-400 font-jakarta">{entityType.toLowerCase()} · /{entitySlug}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Issue Type *</label>
                  <select value={reportType} onChange={e => setReportType(e.target.value)} required className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20">
                    <option value="">Select...</option>
                    {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Description *</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={3} placeholder="Describe what's wrong..." className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20 resize-none" maxLength={1000}/>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Your Email <span className="normal-case">(optional, for follow-up)</span></label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20"/>
                </div>

                {human.widget}
                {error && <p className="text-xs text-red-500 font-jakarta">{error}</p>}

                <button type="submit" disabled={loading} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg font-jakarta disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Flag className="w-4 h-4"/>}
                  Submit Report
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
