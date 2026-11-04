import { KeyRound, Rocket, Users } from 'lucide-react';
import { describeActivity, describeDevice } from '@/lib/founder/activity-display';

export type ActivityRow = { id: string; action: string; ipAddress: string | null; userAgent: string | null; metadata: unknown; createdAt: Date };

const ICONS = { security: KeyRound, listings: Rocket, team: Users };
const IST = 'Asia/Kolkata';
const day = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: IST });
const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });

/** A founder's account activity, newest first, grouped by day (India time). */
export default function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const days = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const key = day(row.createdAt);
    days.set(key, [...(days.get(key) ?? []), row]);
  }

  return (
    <div className="space-y-6">
      {[...days].map(([label, items]) => (
        <section key={label} aria-label={label}>
          <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{label}</h2>
          <ul className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((row) => {
              const { title, category } = describeActivity(row.action, row.metadata);
              const Icon = ICONS[category];
              const details = [time(row.createdAt), describeDevice(row.userAgent), row.ipAddress && row.ipAddress !== 'unknown' ? `IP ${row.ipAddress}` : null].filter(Boolean);
              return (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="w-8 h-8 rounded-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center shrink-0" aria-hidden>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{title}</p>
                    <p className="text-[13px] text-gray-600 dark:text-gray-400 break-words">{details.join(' · ')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
