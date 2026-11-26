'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { notify } from '@/components/Toast';
import { syncRazorpayFeesAction } from '@/app/(dashboard)/billing/actions';

/** Fetches Razorpay's fee for payments that don't have it yet. Shows how many are still missing. */
export default function FeeSync({ missing }: { missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = await syncRazorpayFeesAction();
    setBusy(false);
    if (!r.success) { notify(r.error ?? "Couldn't sync fees. Try again.", 'error'); return; }
    if (r.failed > 0) notify(`${r.failed} payment${r.failed === 1 ? '' : 's'} couldn't be read from Razorpay${r.firstError ? ` (${r.firstError})` : ''}.`, 'error');
    notify(r.saved > 0
      ? `Saved Razorpay's fee for ${r.saved} payment${r.saved === 1 ? '' : 's'}.${r.remaining > 0 ? ` ${r.remaining} still to go: sync again.` : ''}`
      : r.remaining > 0 ? `No new fees saved. ${r.remaining} payment${r.remaining === 1 ? '' : 's'} still without a fee.` : 'Every Razorpay payment already has its fee.', r.saved > 0 ? 'success' : undefined);
    router.refresh();
  };

  return (
    <button type="button" onClick={run} disabled={busy} className="btn-outline text-sm gap-2 disabled:opacity-50">
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
      {busy ? 'Reading from Razorpay…' : missing > 0 ? `Sync Razorpay fees (${missing.toLocaleString('en-IN')} missing)` : 'Sync Razorpay fees'}
    </button>
  );
}
