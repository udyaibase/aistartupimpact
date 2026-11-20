import Link from 'next/link';

export const metadata = { title: 'Page not found' };

/** A wrong address inside the hiring portal: say so and offer the way back, instead of the bare site-wide 404. */
export default function EmployerNotFound() {
  return (
    <div className="max-w-md mx-auto text-center py-16 px-4 font-jakarta">
      <p className="text-sm font-semibold text-gray-500">404</p>
      <h1 className="portal-title mt-1">We can’t find that page</h1>
      <p className="portal-subtitle mt-2">The link may be old, or the job or candidate may have been removed.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/employer/dashboard" className="btn-brand">Go to Home</Link>
        <Link href="/employer/help" className="inline-flex items-center min-h-[40px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white">Get help</Link>
      </div>
    </div>
  );
}
