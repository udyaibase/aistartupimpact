import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Row { id: string; title: string; company: string; appliedAt: string; stage: string; detail: string }

const STAGE_TONE: Record<string, string> = {
  Shortlisted: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  Assessment: 'bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200',
  Interview: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  Offer: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  Hired: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200',
};

const QUIET = new Set(['Under review', 'Withdrawn', 'Closed']);

/** Their applications; each opens its status page (progress, the job, withdraw and delete). */
export default function MyApplicationsList({ rows }: { rows: Row[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/my-applications/${r.id}`}
            className="group flex items-start gap-3 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
            <span className="flex-1 min-w-0">
              <span className="flex items-start gap-3">
                <span className="flex-1 min-w-0 block text-[15px] font-semibold text-gray-900 dark:text-white group-hover:underline">{r.title}</span>
                <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${STAGE_TONE[r.stage] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>{r.stage}</span>
              </span>
              {/* Full width under the title, so the date is never cut off next to the badge on phones. */}
              <span className="block mt-0.5 text-sm text-gray-600 dark:text-gray-400">{r.company} · applied {new Date(r.appliedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {/* The badge already says these; the line only adds something for later stages (assessment, interview, offer…). */}
              {!QUIET.has(r.stage) && <span className="block mt-2 text-[13px] text-gray-700 dark:text-gray-300">{r.detail}</span>}
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">View status <ChevronRight className="w-4 h-4" aria-hidden /></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
