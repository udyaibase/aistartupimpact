'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Briefcase, CheckCircle2 } from 'lucide-react';
import { appliedOn, useAppliedJobs } from '@/hooks/useAppliedJobs';
import SaveJobButton from './SaveJobButton';
import ShareMenu from '@/components/shared/ShareMenu';

interface JobActionsProps {
  applyUrl: string;
  isExternal: boolean;
  jobTitle: string;
  jobUrl: string;
  companyName: string;
  jobSlug: string;
  jobId: string;
  /** 'button': only the Apply button (the job header); 'card': Apply, save and share in a card;
   *  'bar': phones only, pinned above the bottom tab bar while the page's own Apply buttons are off screen. */
  variant?: 'card' | 'button' | 'bar';
}

export default function JobActions({ applyUrl, isExternal, jobTitle, jobUrl, companyName, jobSlug, jobId, variant = 'card' }: JobActionsProps) {
  const shareText = `${jobTitle} at ${companyName} — Apply now on Udyaibase`;
  const [href, setHref] = useState(applyUrl);

  // Carry where the candidate came from (widget, startup profile, Google, UTM) into the apply form.
  useEffect(() => {
    if (isExternal) return;
    const keep = new URLSearchParams();
    const here = new URLSearchParams(window.location.search);
    for (const k of ['source', 'w', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'rc']) {
      const v = here.get(k);
      if (v) keep.set(k, v);
    }
    if (!keep.has('ref') && document.referrer && !document.referrer.startsWith(window.location.origin)) keep.set('ref', document.referrer);
    const q = keep.toString();
    setHref(q ? `${applyUrl}?${q}` : applyUrl);
  }, [applyUrl, isExternal]);

  // Signed in and already applied: say so and link to the application, instead of offering Apply again
  // (a second application to the same job is refused anyway).
  const applied = useAppliedJobs().get(jobSlug);
  const appliedHref = applied ? `/my-applications/${applied.id}` : '';
  const appliedText = applied ? `${applied.withdrawn ? 'You withdrew' : 'Applied'} · ${appliedOn(applied.appliedAt)}` : '';

  // The phone bar shows only while neither Apply button on the page (marked data-apply-anchor) is visible.
  const [anchorsVisible, setAnchorsVisible] = useState(true);
  useEffect(() => {
    if (variant !== 'bar') return;
    const anchors = Array.from(document.querySelectorAll('[data-apply-anchor]'));
    if (!anchors.length) { setAnchorsVisible(false); return; }
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); }
      setAnchorsVisible(seen.size > 0);
    });
    anchors.forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, [variant]);

  if (variant === 'bar') {
    const done = !!applied && !isExternal;
    return (
      <div aria-hidden={anchorsVisible || undefined} inert={anchorsVisible || undefined}
        style={{ bottom: 'var(--bottom-nav-h, 0px)', transform: anchorsVisible ? 'translate3d(0, calc(100% + var(--bottom-nav-h, 0px) + 8px), 0)' : 'translate3d(0, 0, 0)', transition: 'transform 250ms ease, bottom 300ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        className="sm:hidden fixed left-0 right-0 z-sticky shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.2)] border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md px-4 py-2.5 motion-reduce:!transition-none">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{jobTitle}</p>
            <p className={`text-xs truncate ${done ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>{done ? appliedText : companyName}</p>
          </div>
          {done ? (
            <a href={appliedHref} className="shrink-0 inline-flex items-center min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white">View application</a>
          ) : (
            <a href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}
              className="btn-brand !rounded-[10px] shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-5 text-sm">
              {isExternal ? 'Apply' : 'Apply now'}
              {isExternal && <><ExternalLink className="w-4 h-4" aria-hidden /><span className="sr-only"> on the company site (opens in a new tab)</span></>}
            </a>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'button' && applied && !isExternal) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" aria-hidden /> {appliedText}
        </span>
        <a href={appliedHref} className="inline-flex items-center justify-center w-full sm:w-auto min-h-[44px] px-5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
          View application
        </a>
      </div>
    );
  }

  if (variant === 'button') {
    return (
      <a href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined}
        className="btn-brand !rounded-[10px] inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-[44px] px-6 text-sm">
        {isExternal ? 'Apply on company site' : 'Apply now'}
        {isExternal ? <><ExternalLink className="w-4 h-4" aria-hidden /><span className="sr-only"> (opens in a new tab)</span></> : <Briefcase className="w-4 h-4" aria-hidden />}
      </a>
    );
  }

  return (
    <div className="card p-5 sm:p-6">
      <p className="font-sora font-bold text-base text-navy dark:text-white mb-1">
        {applied && !isExternal ? 'You’ve applied for this role' : 'Interested in this role?'}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
        {applied && !isExternal ? `${appliedText}. Track it in My applications.` : 'Apply now or save it for later.'}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {applied && !isExternal ? (
          <a href={appliedHref} className="inline-flex items-center gap-1.5 h-10 sm:h-auto px-5 sm:px-6 sm:py-3 rounded-md border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">
            <CheckCircle2 className="w-4 h-4 text-green-700 dark:text-green-400" aria-hidden /> View application
          </a>
        ) : (
        <a
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="btn-brand !rounded-md inline-flex items-center gap-1.5 sm:gap-2 h-10 sm:h-auto px-5 sm:px-6 sm:py-3 text-sm justify-center"
        >
          {/* The arrow icon says it opens another site, so the words can stay short. */}
          Apply now
          {isExternal ? (
            <><ExternalLink className="w-4 h-4" aria-hidden /><span className="sr-only"> (opens the company site in a new tab)</span></>
          ) : (
            <Briefcase className="w-4 h-4" aria-hidden />
          )}
        </a>
        )}

        <SaveJobButton slug={jobSlug} />

        <ShareMenu
          url={jobUrl}
          title={shareText}
          utmCampaign="job_share"
          variant="icon"
          entityType="JOB"
          entityId={jobId}
        />
      </div>
    </div>
  );
}
