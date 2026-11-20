import type { Metadata } from 'next';
import { loadSharedShortlist } from '@/lib/employer/shortlist-share';
import ShortlistVoting from './ShortlistVoting';

export const dynamic = 'force-dynamic';
// The URL is the key: never index it, never send it in Referer headers.
export const metadata: Metadata = { title: 'Shortlist', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function SharedShortlistPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const data = await loadSharedShortlist(token);
  if (!data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center font-jakarta">
        <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">This link isn’t active</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">It expired or the hiring team turned it off. Ask them for a new one.</p>
      </div>
    );
  }
  return <ShortlistVoting token={token} data={data} />;
}
