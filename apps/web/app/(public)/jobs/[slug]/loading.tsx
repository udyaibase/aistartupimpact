export default function JobDetailLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-pulse">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header card */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gray-200 dark:bg-gray-800 rounded-lg shrink-0" />
              <div className="flex-1">
                <div className="h-6 sm:h-7 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg mb-2" />
                <div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
              </div>
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="h-6 w-20 bg-gray-200 dark:bg-gray-800 rounded-md" />
              <div className="h-6 w-32 bg-gray-200 dark:bg-gray-800 rounded-md" />
              <div className="h-6 w-24 bg-gray-200 dark:bg-gray-800 rounded-md" />
            </div>

            {/* Apply button */}
            <div className="mt-5">
              <div className="h-11 w-40 bg-gray-200 dark:bg-gray-800 rounded-md" />
            </div>
          </div>

          {/* Description card */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
            <div className="h-5 w-28 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>

          {/* Skills card */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5 sm:p-6">
            <div className="h-5 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
            <div className="flex flex-wrap gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-7 w-20 bg-gray-200 dark:bg-gray-800 rounded-md" />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Company card */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
            <div className="space-y-2 mt-3">
              <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
            <div className="flex gap-2 mt-3">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-lg" />
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>
          </div>

          {/* Other jobs */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
            <div className="h-4 w-36 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-3 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              ))}
            </div>
          </div>

          {/* Job info */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-5">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-28 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
