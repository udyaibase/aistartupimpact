import { Banknote, Building2, Flag, Handshake, Rocket, Target, TrendingUp, Trophy, Users, type LucideIcon } from 'lucide-react';

/** One icon and colour per milestone type, used wherever milestones appear (no emojis). */
const TYPES: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  FUNDING: { icon: Banknote, label: 'Funding', tone: 'text-emerald-600 dark:text-emerald-400' },
  LAUNCH: { icon: Rocket, label: 'Launch', tone: 'text-blue-600 dark:text-blue-400' },
  PARTNERSHIP: { icon: Handshake, label: 'Partnership', tone: 'text-violet-600 dark:text-violet-400' },
  ACQUISITION: { icon: Building2, label: 'Acquisition', tone: 'text-slate-600 dark:text-slate-300' },
  AWARD: { icon: Trophy, label: 'Award', tone: 'text-amber-500 dark:text-amber-400' },
  HIRING: { icon: Users, label: 'Hiring', tone: 'text-cyan-600 dark:text-cyan-400' },
  REVENUE: { icon: TrendingUp, label: 'Revenue', tone: 'text-green-600 dark:text-green-400' },
  USER_MILESTONE: { icon: Target, label: 'Users', tone: 'text-rose-600 dark:text-rose-400' },
};
const OTHER = { icon: Flag, label: 'Milestone', tone: 'text-gray-500 dark:text-gray-400' };

export const milestoneType = (type: string | null | undefined) => TYPES[type ?? ''] ?? OTHER;

/** The milestone type's icon, in its colour. Size it with className (e.g. "w-5 h-5"). */
export function MilestoneIcon({ type, className = 'w-5 h-5' }: { type: string | null | undefined; className?: string }) {
  const t = milestoneType(type);
  const Icon = t.icon;
  return <Icon className={`${t.tone} ${className}`} aria-label={t.label} role="img" />;
}
