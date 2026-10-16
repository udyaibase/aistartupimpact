'use client';

import { useState } from 'react';
import { ExternalLink, Briefcase, Share2, Check, Link2, Twitter, Linkedin, Mail } from 'lucide-react';
import SaveJobButton from './SaveJobButton';

interface JobActionsProps {
  applyUrl: string;
  isExternal: boolean;
  jobTitle: string;
  jobUrl: string;
  companyName: string;
  jobSlug: string;
}

export default function JobActions({ applyUrl, isExternal, jobTitle, jobUrl, companyName, jobSlug }: JobActionsProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareText = `${jobTitle} at ${companyName}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(jobUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, url: jobUrl });
      } catch {}
    } else {
      setShareOpen(!shareOpen);
    }
  };

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
          href={applyUrl}
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

        <div className="relative">
          <button
            onClick={handleNativeShare}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 hover:text-brand hover:border-brand/30 transition-colors"
            title="Share job"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {shareOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-2">
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Link2 className="w-3.5 h-3.5" />}
                {copied ? 'Link copied!' : 'Copy link'}
              </button>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(jobUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Twitter className="w-3.5 h-3.5" />
                Share on X
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Linkedin className="w-3.5 h-3.5" />
                Share on LinkedIn
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`Check out this job: ${jobUrl}`)}`}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Share via Email
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
