export default function JobsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="h-3 w-10 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-3 w-3 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="h-3 w-14 bg-gray-200 dark:bg-gray-800 rounded" />
      </div>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <div className="h-8 sm:h-9 w-52 bg-gray-200 dark:bg-gray-800 rounded-lg mb-2" />
          <div className="h-4 w-80 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>
      </div>

      {/* Search bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 sm:rounded-lg sm:border sm:border-gray-200 dark:sm:border-gray-800 sm:p-2">
        <div className="flex-1 h-12 bg-gray-100 dark:bg-gray-800 rounded-md" />
        <div className="hidden sm:block h-12 w-56 bg-gray-100 dark:bg-gray-800 rounded-md" />
        <div className="h-12 w-32 bg-gray-200 dark:bg-gray-800 rounded-md shrink-0" />
      </div>

      {/* Main layout: sidebar + jobs */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mt-6">
        {/* Sidebar skeleton - desktop */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="h-5 w-16 bg-gray-200 dark:bg-gray-800 rounded mb-5" />
            {/* Filter section */}
            {[1, 2, 3].map(section => (
              <div key={section} className="mb-5">
                <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
                <div className="space-y-2.5">
                  {[1, 2, 3, 4].map(item => (
                    <div key={item} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 bg-gray-200 dark:bg-gray-800 rounded-full" />
                      <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded" style={{ width: `${60 + item * 12}px` }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Mobile filter row */}
        <div className="lg:hidden flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-800 rounded-full" />
          </div>
          <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
        </div>

        {/* Job listing cards */}
        <div className="flex-1 min-w-0">
          {/* Count + sort bar - desktop */}
          <div className="hidden lg:flex items-center justify-between mb-4">
            <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
            <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </div>

          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5">
                <div className="flex gap-3 sm:gap-4">
                  {/* Company avatar */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gray-200 dark:bg-gray-800 rounded-lg shrink-0" />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="h-4 sm:h-5 w-44 bg-gray-200 dark:bg-gray-800 rounded mb-1.5" />
                        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
                      </div>
                      <div className="w-4 h-4 bg-gray-200 dark:bg-gray-800 rounded shrink-0" />
                    </div>
                    {/* Meta row */}
                    <div className="hidden sm:flex items-center gap-4 mt-2">
                      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
                      <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
                      <div className="h-3 w-14 bg-gray-200 dark:bg-gray-800 rounded" />
                    </div>
                    {/* Mobile badges */}
                    <div className="flex sm:hidden gap-1.5 mt-2">
                      <div className="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded-md" />
                      <div className="h-6 w-14 bg-gray-200 dark:bg-gray-800 rounded-md" />
                      <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-md" />
                    </div>
                    {/* Skills */}
                    <div className="hidden sm:flex gap-1.5 mt-2.5">
                      {[1, 2, 3].map(s => (
                        <div key={s} className="h-5 bg-gray-200 dark:bg-gray-800 rounded-md" style={{ width: `${48 + s * 16}px` }} />
                      ))}
                    </div>
                    {/* Bottom row */}
                    <div className="hidden sm:flex items-center justify-between mt-3">
                      <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-24 bg-gray-200 dark:bg-gray-800 rounded-md" />
                        <div className="h-9 w-20 bg-gray-200 dark:bg-gray-800 rounded-md" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
