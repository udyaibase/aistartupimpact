import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle2, Clock, Info } from 'lucide-react';

/**
 * Founder portal guidance. Copy follows one pattern: what's missing or happening, why it matters, and the one thing
 * to do next. Only promise what the product really does.
 */

/** Shown where a list or section has nothing in it yet. */
export function EmptyGuide({ icon: Icon, title, children, action, bare = false }: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** Leave out the card, when the section around it already has one. */
  bare?: boolean;
}) {
  const card = bare ? '' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
  return (
    <div className={`${card} px-4 py-8 text-center font-jakarta`}>
      <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center mx-auto mb-3" aria-hidden>
        <Icon className="w-6 h-6" />
      </span>
      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const TONES = {
  info: { box: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800', text: 'text-blue-900 dark:text-blue-200', icon: Info },
  waiting: { box: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800', text: 'text-amber-900 dark:text-amber-200', icon: Clock },
  error: { box: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800', text: 'text-red-900 dark:text-red-200', icon: AlertCircle },
  success: { box: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800', text: 'text-green-900 dark:text-green-200', icon: CheckCircle2 },
};

/** Explains the state of something the founder is looking at, and what happens next. */
export function StatusNote({ tone, title, children, action }: {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div className={`border rounded-[14px] p-4 flex flex-col sm:flex-row sm:items-center gap-3 font-jakarta ${t.box} ${t.text}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {children && <p className="text-sm mt-0.5 opacity-90">{children}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
