import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Small line under the value, e.g. "This month" or "+12% vs last month". */
  sub?: string;
  href?: string;
}

/** Same stat card as the employer and host portals. */
export default function StatCard({ title, value, icon: Icon, sub, href }: StatCardProps) {
  const content = (
    <div className={`h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4 ${href ? 'hover:border-gray-300 dark:hover:border-gray-700 transition-colors' : ''}`}>
      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        <span className="text-[13px] font-medium font-jakarta">{title}</span>
      </div>
      <p className="font-sora font-bold text-2xl text-gray-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs font-jakarta mt-0.5 text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );

  return href ? <Link href={href} className="block h-full">{content}</Link> : content;
}
