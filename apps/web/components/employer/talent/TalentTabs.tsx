import Link from 'next/link';

/** Talent pool / Open to opportunities switch (the second only for companies in the pilot). */
export default function TalentTabs({ active }: { active: 'pool' | 'network' }) {
  const tab = (key: 'pool' | 'network', href: string, label: string) => (
    <Link href={href} aria-current={active === key ? 'page' : undefined}
      className={`inline-flex items-center min-h-[40px] px-3.5 rounded-[10px] text-sm font-semibold ${active === key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Talent" className="mt-2 inline-flex gap-1 p-1 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {tab('pool', '/employer/talent', 'Your talent pool')}
      {tab('network', '/employer/talent/network', 'Open to opportunities')}
    </nav>
  );
}
