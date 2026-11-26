/**
 * Loading placeholders shaped like the screen that is about to appear, so the page doesn't jump when the data
 * arrives: a list (heading, filters, rows) for section pages and a form for create and edit pages.
 * Server-safe, no motion for people who ask for less (the pulse stops under prefers-reduced-motion).
 */
const bar = 'bg-gray-200 dark:bg-gray-800 rounded';

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-label="Loading">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className={`${bar} h-7 w-48`} />
          <div className={`${bar} h-4 w-64`} />
        </div>
        <div className={`${bar} h-9 w-28`} />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className={`${bar} h-9 w-64`} />
        <div className={`${bar} h-9 w-32`} />
        <div className={`${bar} h-9 w-32`} />
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="flex gap-6 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          {[28, 20, 16, 16, 12].map((w, i) => <div key={i} className={`${bar} h-3`} style={{ width: `${w}%` }} />)}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-4 py-3.5 border-b last:border-b-0 border-gray-100 dark:border-gray-800">
            {[28, 20, 16, 16, 12].map((w, i) => <div key={i} className={`${bar} h-4`} style={{ width: `${w - (r % 3) * 2}%` }} />)}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function FormSkeleton({ fields = 7 }: { fields?: number }) {
  return (
    <div className="animate-pulse space-y-5 max-w-3xl" role="status" aria-label="Loading">
      <div className="space-y-2">
        <div className={`${bar} h-7 w-56`} />
        <div className={`${bar} h-4 w-72`} />
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className={`${bar} h-3.5 w-32`} />
            <div className={`${bar} ${i % 4 === 3 ? 'h-24' : 'h-10'} w-full`} />
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <div className={`${bar} h-9 w-28`} />
          <div className={`${bar} h-9 w-20`} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
