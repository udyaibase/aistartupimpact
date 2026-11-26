/**
 * The loading state for every signed-in portal page (founder, employer, organizer): a quiet outline of the page
 * (heading, summary cards, a list) in place of a spinner, so the layout doesn't jump when the page arrives.
 * The sidebar and header stay on screen; this fills only the content area.
 */
const bar = 'rounded bg-gray-200 dark:bg-gray-800';

export default function PortalLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse motion-reduce:animate-none space-y-6">
      <span className="sr-only">Loading</span>
      <div className="space-y-2" aria-hidden>
        <div className={`h-7 w-48 ${bar}`} />
        <div className={`h-4 w-80 max-w-full ${bar}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
            <div className={`h-3 w-20 ${bar}`} />
            <div className={`h-6 w-14 ${bar}`} />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className={`h-9 w-9 rounded-lg shrink-0 ${bar}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 w-1/3 ${bar}`} />
              <div className={`h-3 w-1/2 ${bar}`} />
            </div>
            <div className={`h-6 w-16 hidden sm:block ${bar}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
