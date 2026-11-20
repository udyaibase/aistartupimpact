'use client';

import { useEffect, useState } from 'react';

/**
 * Before a job closes: how many people still waiting will get the polite "role closed" email, with a switch to skip it.
 * People in Interview or Offer are never emailed automatically.
 */
export function useClosingPreview(jobId: string | null) {
  const [preview, setPreview] = useState<{ waiting: number; inProgress: number } | null>(null);
  useEffect(() => {
    if (!jobId) { setPreview(null); return; }
    let alive = true;
    fetch(`/api/employer/jobs/${jobId}/status`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && typeof d.waiting === 'number') setPreview(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [jobId]);
  return preview;
}

export default function ClosingNotice({ preview, notify, onNotify }: { preview: { waiting: number; inProgress: number } | null; notify: boolean; onNotify: (v: boolean) => void }) {
  if (!preview) return null;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      {preview.waiting > 0 ? (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" checked={notify} onChange={(e) => onNotify(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#A50F15]" />
          <span className="text-gray-700 dark:text-gray-300">
            Email the <strong>{preview.waiting}</strong> candidate{preview.waiting === 1 ? '' : 's'} still waiting that the role is closed
            <span className="block text-xs text-gray-500">They move to Rejected (reason: position filled or closed). Nobody is emailed twice.</span>
          </span>
        </label>
      ) : (
        <p className="text-gray-600 dark:text-gray-400">Nobody is waiting on this job, so no emails go out.</p>
      )}
      {preview.inProgress > 0 && (
        <p className="text-xs text-gray-500">{preview.inProgress} in Interview or Offer stay where they are; tell them yourself.</p>
      )}
    </div>
  );
}
