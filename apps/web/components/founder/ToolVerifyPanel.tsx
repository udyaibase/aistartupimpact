'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Loader2 } from 'lucide-react';
import { StatusNote } from './Guidance';

type Setup = { domain: string; dnsRecord: string };

/** Walks a founder through proving they own their tool's domain with a DNS TXT record. */
export default function ToolVerifyPanel({ toolId }: { toolId: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const url = `/api/founder/tools/${toolId}/verify`;

  const start = async () => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.status === 401) { setMessage('Your session has ended. Please sign in again to continue.'); return; }
      if (!res.ok) { setMessage('Couldn’t load the steps. Please try again.'); return; }
      if (data.verified) { router.refresh(); return; }
      if (!data.domain) { setMessage('Add your tool’s website above and save, then come back to verify.'); return; }
      setSetup({ domain: data.domain, dnsRecord: data.dnsRecord });
    } catch { setMessage('Couldn’t load the steps. Check your connection and try again.'); } finally { setBusy(false); }
  };

  const check = async () => {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.status === 401) { setMessage('Your session has ended. Please sign in again to continue.'); return; }
      const data = await res.json();
      if (data.verified) { router.refresh(); return; }
      setMessage(data.message || 'Couldn’t check right now. Please try again.');
    } catch { setMessage('Couldn’t check right now. Check your connection and try again.'); } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!setup) return;
    try { await navigator.clipboard.writeText(setup.dnsRecord); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the record stays visible to copy by hand */ }
  };

  const button = 'inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0 px-3.5 py-2 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60';

  if (!setup) {
    return (
      <div className="space-y-2">
        <StatusNote
          tone="info"
          title="Your tool isn’t verified yet"
          action={<button onClick={start} disabled={busy} className={button}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Verify now</button>}
        >
          Verifying proves you own this tool and adds the Verified badge to your listing. It takes a few minutes if you can edit your domain’s DNS.
        </StatusNote>
        {message && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{message}</p>}
      </div>
    );
  }

  return (
    <section aria-labelledby="verify-tool-title" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 sm:p-5 font-jakarta">
      <h2 id="verify-tool-title" className="portal-section-title">Verify {setup.domain}</h2>
      <ol className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300 list-decimal pl-5">
        <li>Open the DNS settings where {setup.domain} is managed (for example GoDaddy, Cloudflare or Namecheap).</li>
        <li>
          Add a TXT record. Set the host or name to <code className="font-mono">@</code> and paste this as the value:
          <span className="mt-2 flex items-center gap-2">
            <code className="flex-1 min-w-0 break-all font-mono text-[13px] bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">{setup.dnsRecord}</code>
            <button onClick={copy} aria-label="Copy TXT record value" className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300">
              {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
            </button>
          </span>
        </li>
        <li>Wait a few minutes for the record to take effect, then check it below.</li>
      </ol>
      <button onClick={check} disabled={busy} className={`${button} mt-4`}>{busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Check my record</button>
      {message && <p role="status" className="text-sm text-gray-700 dark:text-gray-300 mt-3">{message}</p>}
    </section>
  );
}
