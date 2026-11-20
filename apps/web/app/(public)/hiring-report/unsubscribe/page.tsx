import type { Metadata } from 'next';
import UnsubscribeButton from './UnsubscribeButton';

export const metadata: Metadata = { title: 'Weekly hiring report', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Linked from the Monday report. A button press (not the link itself) turns it off, so mail scanners can't. */
export default async function Page(props: { searchParams: Promise<{ k?: string; id?: string; t?: string }> }) {
  const sp = await props.searchParams;
  const query = new URLSearchParams({ k: sp.k ?? '', id: sp.id ?? '', t: sp.t ?? '' }).toString();
  return (
    <div className="max-w-md mx-auto px-4 py-16 sm:py-24 text-center font-jakarta">
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">Stop the weekly hiring report?</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">You’ll stop getting the Monday summary of new candidates. You can turn it back on any time in Settings.</p>
      <UnsubscribeButton query={query} />
    </div>
  );
}
