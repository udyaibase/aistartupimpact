import { AlertTriangle, Info, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { PortalStatus } from '@/lib/support/portal-status';

const STYLE = {
  info: { cls: 'border-blue-200 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900/50 dark:text-blue-200', Icon: Info, label: 'Notice' },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-200', Icon: AlertTriangle, label: 'Known issue' },
  outage: { cls: 'border-red-200 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-200', Icon: XCircle, label: 'Service problem' },
} as const;

/** Our team's notice about a known problem, on every portal page so nobody has to report it again. */
export default function StatusBanner({ status }: { status: PortalStatus }) {
  const s = STYLE[status.level];
  return (
    <div role={status.level === 'outage' ? 'alert' : 'status'} className={`mb-4 flex items-start gap-2.5 p-3 rounded-[12px] border text-sm font-jakarta ${s.cls}`}>
      <s.Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      <p className="flex-1"><span className="font-semibold">{s.label}:</span> {status.message} {status.level !== 'info' && <Link href="/employer/help" className="font-semibold underline whitespace-nowrap">Help</Link>}</p>
    </div>
  );
}
