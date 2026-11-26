import Link from 'next/link';
import { Compass } from 'lucide-react';

/** A wrong or old admin address: say so inside the admin, with the menu still there and two ways forward. */
export default function AdminNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Compass className="w-7 h-7 text-gray-500" aria-hidden />
      </div>
      <h1 className="portal-title mb-2">This page doesn’t exist</h1>
      <p className="portal-subtitle max-w-md mb-6">The address may be mistyped, or the item was deleted. Press Ctrl+K to search for a section.</p>
      <Link href="/dashboard" className="btn-brand">Back to the dashboard</Link>
    </div>
  );
}
