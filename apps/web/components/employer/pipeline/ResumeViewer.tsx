'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

/**
 * The candidate's resume inside the page, so recruiters read it without downloading.
 * Wide screens: beside the candidate panel (read the resume and move the candidate at the same time).
 * Smaller screens: full screen over the board.
 *
 * PDFs use the browser's own viewer (zoom, search, print). Where the browser has no built-in PDF viewer (most
 * Android phones) and for Word files, it explains that and offers Download / Open in a new tab instead.
 */
export default function ResumeViewer({ applicationId, name, type, onClose }: {
  applicationId: string;
  name: string;
  type: 'pdf' | 'docx' | 'link';
  onClose: () => void;
}) {
  const base = `/api/employer/applications/${applicationId}/resume`;
  const viewUrl = `${base}?view=1`;
  const [canShow, setCanShow] = useState(true);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // navigator.pdfViewerEnabled is false where PDFs would be downloaded instead of shown (e.g. Android Chrome).
    const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
    setCanShow(type === 'pdf' && nav.pdfViewerEnabled !== false);
  }, [type]);

  useEffect(() => { setLoading(true); }, [applicationId]);

  // Esc closes the resume first (capture phase, before the candidate panel's own Esc handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[aria-labelledby="move-title"], [aria-labelledby="filled-title"]')) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const btn = 'inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] text-sm font-semibold';

  return (
    <section role="region" aria-label={`Resume of ${name}`}
      className="fixed z-modal inset-0 lg:right-[520px] flex flex-col bg-gray-100 dark:bg-gray-900 lg:border-r border-gray-200 dark:border-gray-800 font-jakarta"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex items-center gap-2 px-3 sm:px-4 min-h-[3.5rem] bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <FileText className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
        <p className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-white">{name} · Resume</p>
        <a href={base} download className={`${btn} bg-gray-900 dark:bg-white text-white dark:text-gray-900`}>
          <Download className="w-4 h-4" aria-hidden /> <span className="hidden min-[420px]:inline">Download</span>
        </a>
        {type === 'pdf' && (
          <a href={viewUrl} target="_blank" rel="noopener" className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800`}
            aria-label="Open the resume in a new tab">
            <ExternalLink className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">New tab</span>
          </a>
        )}
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close resume"
          className="w-10 h-10 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="w-5 h-5" aria-hidden />
        </button>
      </header>

      {canShow ? (
        <div className="relative flex-1 min-h-0">
          {loading && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading resume…</p>}
          <iframe
            key={applicationId}
            src={`${viewUrl}#view=FitH`}
            title={`Resume of ${name}`}
            onLoad={() => setLoading(false)}
            className="relative w-full h-full bg-white"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden />
            <p className="portal-item-title">
              {type === 'docx' ? 'Word files can’t be shown in the browser' : type === 'link' ? 'This resume is a link from an older application' : 'This browser can’t show PDFs inside the page'}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {type === 'pdf' ? 'Open it in a new tab to read it, or download it.' : 'Download it to read it.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {type === 'pdf' && <a href={viewUrl} target="_blank" rel="noopener" className={`${btn} border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200`}><ExternalLink className="w-4 h-4" aria-hidden /> Open in new tab</a>}
              <a href={base} {...(type === 'link' ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })} className={`${btn} bg-gray-900 dark:bg-white text-white dark:text-gray-900`}>
                <Download className="w-4 h-4" aria-hidden /> {type === 'link' ? 'Open resume' : 'Download'}
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
