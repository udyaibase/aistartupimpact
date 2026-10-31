'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Briefcase } from 'lucide-react';
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
}

export default function JobActions({ applyUrl, isExternal, jobTitle, jobUrl, companyName, jobSlug, jobId }: JobActionsProps) {
  const shareText = `${jobTitle} at ${companyName} — Apply now on Udyaibase`;
  const [href, setHref] = useState(applyUrl);

  // Carry where the candidate came from (widget, startup profile, Google, UTM) into the apply form.
  useEffect(() => {
    if (isExternal) return;
    const keep = new URLSearchParams();
    const here = new URLSearchParams(window.location.search);
    for (const k of ['source', 'w', 'ref', 'utm_source', 'utm_medium', 'utm_campaign']) {
      const v = here.get(k);
      if (v) keep.set(k, v);
    }
    if (!keep.has('ref') && document.referrer && !document.referrer.startsWith(window.location.origin)) keep.set('ref', document.referrer);
    const q = keep.toString();
    setHref(q ? `${applyUrl}?${q}` : applyUrl);
  }, [applyUrl, isExternal]);

  return (
    <div className="card p-5 sm:p-6">
      <p className="font-sora font-bold text-base text-navy dark:text-white mb-1">
        Interested in this role?
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-4">
        Apply now or save it for later.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="btn-brand inline-flex items-center gap-2 px-6 py-3 text-sm flex-1 sm:flex-none justify-center"
        >
          {isExternal ? (
            <>Apply on Company Site <ExternalLink className="w-4 h-4" /></>
          ) : (
            <>Apply Now <Briefcase className="w-4 h-4" /></>
          )}
        </a>

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
