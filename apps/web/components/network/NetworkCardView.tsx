import { Briefcase, Clock, MapPin, UserRound } from 'lucide-react';
import { yearsText } from '@/lib/jobs/format';
import { WORK_MODES, noticeText, type WorkMode } from '@/lib/network/rules';

/**
 * An anonymous "Open to opportunities" profile, exactly as companies see it. The job seeker's preview uses this same
 * component, so what they approve is what companies get.
 */
export default function NetworkCardView({ card, children, footer }: {
  card: {
    headline: string; experienceYears: number | null; skills: string[]; city: string | null; workMode: WorkMode;
    noticePeriodDays: number | null; currentCompany: string | null;
  };
  /** Extra content beside the headline (e.g. a fit score). */
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const facts = [
    card.experienceYears != null ? yearsText(card.experienceYears) : null,
    card.currentCompany ? `at ${card.currentCompany}` : null,
  ].filter(Boolean).join(' ');
  const notice = noticeText(card.noticePeriodDays);
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-[14px] shadow-sm dark:shadow-none p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 inline-flex items-center justify-center" aria-hidden>
          <UserRound className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{card.headline || 'Your role'}</p>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">{facts || 'Experience not shared'}</p>
        </div>
        {children}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-600 dark:text-gray-400">
        {card.city && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden /> {card.city}</span>}
        <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" aria-hidden /> {WORK_MODES[card.workMode] ?? WORK_MODES.ANY}</span>
        {notice && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden /> {notice}</span>}
      </div>
      {card.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.skills.map((s) => <span key={s} className="text-xs font-medium px-2 py-0.5 rounded-full border border-gray-300 dark:border-transparent bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-300">{s}</span>)}
        </div>
      )}
      {footer}
    </div>
  );
}
