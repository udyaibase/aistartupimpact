'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, CheckCircle, Copy, ExternalLink, Loader2, Mail, Server } from 'lucide-react';
import { EmailVerify } from './FounderHiringClient';
import { emailVerificationDomain } from '@/lib/startups/listing-domain';

/** Host of the startup's website, as shown to the founder (www. dropped). */
export function siteHost(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

const PROVIDERS = [
  { name: 'Cloudflare', url: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/' },
  { name: 'GoDaddy', url: 'https://www.godaddy.com/help/add-a-txt-record-19232' },
  { name: 'Namecheap', url: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/' },
  { name: 'AWS Route 53', url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html' },
];

/**
 * Prove control of a startup's domain: a DNS TXT record, or a 6-digit code to a work email on the domain.
 * Shared by the add-startup flow and the claim page; both end in the same verified state.
 * When `workEmailHint` is on the domain, the email method is offered first (it's the quickest).
 */
export default function StartupDomainVerify({ startupId, startupName, websiteUrl, workEmailHint, dnsOnly = false, initialMethod, onVerified }: {
  startupId: string;
  startupName: string;
  websiteUrl: string;
  workEmailHint?: string | null;
  /** Only DNS counts here (e.g. taking over a startup another founder verified by email). */
  dnsOnly?: boolean;
  /** Open on this method (reminder emails link straight to it). */
  initialMethod?: 'email' | 'dns';
  onVerified: () => void;
}) {
  const domain = siteHost(websiteUrl || '');
  // A mailbox on shared hosting (acme.vercel.app) or a big platform proves nothing, so email isn't offered there.
  const mailDomain = emailVerificationDomain(websiteUrl);
  const emailAllowed = !dnsOnly && !!mailDomain;
  const sharedHost = !mailDomain && !!domain;
  const [method, setMethod] = useState<'email' | 'dns'>(emailAllowed && (initialMethod === 'email' || (!initialMethod && workEmailHint)) ? 'email' : 'dns');
  const [dnsRecord, setDnsRecord] = useState('');
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const loadRecord = useCallback(async () => {
    setLoadingRecord(true);
    setError('');
    try {
      const res = await fetch(`/api/founder/startups/${startupId}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not prepare the DNS record.');
      setDnsRecord(data.dnsRecord);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the DNS record.');
    } finally {
      setLoadingRecord(false);
    }
  }, [startupId]);

  useEffect(() => {
    if (method === 'dns' && !dnsRecord && !loadingRecord) loadRecord();
    // Only when the DNS method is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const checkDns = async () => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch(`/api/founder/startups/${startupId}/verify`);
      const data = await res.json().catch(() => ({}));
      if (data.verified) onVerified();
      else setError(data.error || 'DNS record not found yet. It can take 5–30 minutes to show up; try again shortly.');
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  };

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  const tab = (id: 'email' | 'dns', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={method === id}
      onClick={() => { setMethod(id); setError(''); }}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-semibold transition-colors ${
        method === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      {icon}{label}
    </button>
  );

  const row = (label: string, value: string, hint?: string) => (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md font-mono text-[13px] break-all text-gray-900 dark:text-white">{value}</code>
        <button type="button" onClick={() => copy(label, value)} className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label={`Copy ${label}`}>
          {copied === label ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  const emailTab = tab('email', <Mail className="w-4 h-4" aria-hidden />, 'Work email');
  const dnsTab = tab('dns', <Server className="w-4 h-4" aria-hidden />, 'DNS record');

  return (
    <div>
      {emailAllowed ? (
        <div role="tablist" aria-label="Verification method" className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-4">
          {workEmailHint ? <>{emailTab}{dnsTab}</> : <>{dnsTab}{emailTab}</>}
        </div>
      ) : sharedHost && !dnsOnly ? (
        <p className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
          Your website is on a shared platform, so a work email there can’t prove ownership. Use a DNS record if {domain} is your own domain, or{' '}
          <Link href="/founder/support" className="font-semibold underline">contact support</Link>.
        </p>
      ) : null}

      {method === 'email' ? (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            We send a 6-digit code to an email on <strong className="text-gray-900 dark:text-white">{mailDomain}</strong>. Quickest if you have one. Email verification lasts 12 months; we’ll remind you before it ends.
          </p>
          <EmailVerify startupId={startupId} startupName={startupName} domain={mailDomain ?? domain} suggestedEmail={workEmailHint ?? ''} onDone={onVerified} />
        </div>
      ) : loadingRecord || !dnsRecord ? (
        <div className="py-8 text-center">
          {error ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              <button type="button" onClick={loadRecord} className="btn-brand-outline text-sm">Try again</button>
            </div>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Preparing your DNS record…</p>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Add this TXT record in your DNS settings for <strong className="text-gray-900 dark:text-white">{domain}</strong>, then check.
          </p>
          <div className="space-y-3 p-3 sm:p-4 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Type</p>
                <code className="block px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md font-mono text-[13px] text-gray-900 dark:text-white">TXT</code>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">TTL</p>
                <code className="block px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md font-mono text-[13px] text-gray-900 dark:text-white">Auto / 3600</code>
              </div>
            </div>
            {row('Name / Host', '@', `"@" means ${domain} itself. Some providers want it blank or the domain instead.`)}
            {row('Value', dnsRecord)}
          </div>

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-gray-600 dark:text-gray-400 font-medium">Guides for common DNS providers</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {PROVIDERS.map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200">
                  {p.name}<ExternalLink className="w-3.5 h-3.5 text-gray-400" aria-hidden />
                </a>
              ))}
            </div>
          </details>

          {error && (
            <div role="alert" className="flex items-start gap-2 mt-3 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <button type="button" onClick={checkDns} disabled={checking} className="mt-4 w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />}
            {checking ? 'Checking DNS…' : 'Check DNS record'}
          </button>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">DNS changes can take 5–30 minutes to show up. You can leave and come back.</p>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-1"><strong>Keep the record</strong> after verifying: we re-check it weekly and your verification renews itself.</p>
        </div>
      )}
    </div>
  );
}
