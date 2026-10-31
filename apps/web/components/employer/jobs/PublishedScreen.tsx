'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Copy, Check, Linkedin, MessageCircle, Globe, Users, Plus, ExternalLink } from 'lucide-react';

export default function PublishedScreen({ title, slug, companyName, jobId }: { title: string; slug: string; companyName: string; jobId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window === 'undefined' ? 'https://udyaibase.com' : window.location.origin}/jobs/${slug}`;
  const shareText = `${companyName} is hiring: ${title}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked; the link stays visible to copy by hand */ }
  }

  const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800';

  return (
    <div className="max-w-xl mx-auto font-jakarta py-6 sm:py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5 sm:p-7 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" aria-hidden />
        <h1 className="portal-title mt-3" tabIndex={-1} autoFocus>Your job is live</h1>
        <p className="portal-subtitle">{title} is open for applications. Share it to reach people faster.</p>

        <div className="mt-5 flex items-center gap-2 p-1.5 pl-3 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-left">
          <span className="flex-1 min-w-0 truncate text-sm text-gray-700 dark:text-gray-300">{url}</span>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] bg-gray-900 text-white dark:bg-white dark:text-gray-900 text-[13px] font-semibold shrink-0">
            {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>

        <div className="grid sm:grid-cols-2 gap-2 mt-3">
          <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}>
            <Linkedin className="w-4 h-4" aria-hidden /> Share on LinkedIn
          </a>
          <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`}>
            <MessageCircle className="w-4 h-4" aria-hidden /> Share on WhatsApp
          </a>
          <Link className={btn} href="/employer/careers"><Globe className="w-4 h-4" aria-hidden /> Show on your website</Link>
          <a className={btn} href={`/jobs/${slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" aria-hidden /> View job</a>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-2 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
          <Link href={`/employer/applications?job=${jobId}`} className="btn-brand gap-2"><Users className="w-4 h-4" aria-hidden /> Go to candidates</Link>
          <Link href="/employer/jobs/new" className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">
            <Plus className="w-4 h-4" aria-hidden /> Post another job
          </Link>
        </div>
      </div>
    </div>
  );
}
