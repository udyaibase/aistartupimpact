import Link from 'next/link';
import { AlertTriangle, Sparkles } from 'lucide-react';

/**
 * Portal-wide plan notice: a running free trial (days left), or the grace days after a paid plan ended
 * (features still on, renew by the date). Renders nothing otherwise.
 */
export default function PlanBanner({ phase, planName, endsAt, graceEndsAt, billingHref, canRenew, pausedWhatInGrace }: {
  phase: 'free' | 'trial' | 'active' | 'grace';
  planName: string;
  endsAt: Date | null;
  graceEndsAt: Date | null;
  billingHref: string;
  canRenew: boolean;
  /** What stops during grace, e.g. "New AI reviews are paused." */
  pausedWhatInGrace: string;
}) {
  const date = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  if (phase === 'trial' && endsAt) {
    const days = Math.max(1, Math.ceil((endsAt.getTime() - Date.now()) / 864e5));
    return (
      <div role="status" className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-[12px] border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
        <Sparkles className="hidden sm:block w-4 h-4 shrink-0" aria-hidden />
        <p className="flex-1"><span className="font-semibold">Free {planName} trial: {days} day{days === 1 ? '' : 's'} left</span> (until {date(endsAt)}). Choose a plan to keep your jobs featured.</p>
        {canRenew && <Link href={billingHref} className="font-semibold underline whitespace-nowrap">See plans</Link>}
      </div>
    );
  }
  if (phase === 'grace' && graceEndsAt) {
    return (
      <div role="alert" className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-[12px] border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <AlertTriangle className="hidden sm:block w-4 h-4 shrink-0" aria-hidden />
        <p className="flex-1"><span className="font-semibold">Your {planName} plan has ended.</span> Everything keeps working until {date(graceEndsAt)}. {pausedWhatInGrace} {canRenew ? 'Renew to carry on without any change.' : 'Ask a workspace owner to renew.'}</p>
        {canRenew && <Link href={billingHref} className="inline-flex items-center justify-center min-h-[40px] px-3 rounded-[10px] bg-amber-600 hover:bg-amber-700 text-white font-semibold whitespace-nowrap">Renew now</Link>}
      </div>
    );
  }
  return null;
}
