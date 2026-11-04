import { founderFromUnsubscribeToken } from '@/lib/founder/engagement-run';
import UnsubscribeButton from './UnsubscribeButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email preferences', robots: { index: false, follow: false } };

export default async function EmailPreferencesPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? !!(await founderFromUnsubscribeToken(token)) : false;

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950 font-jakarta">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Founder tips and reports</h1>
        {valid ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Stop emails about your profile views and ideas for your listing? We’ll still email you about your account, security and listing reviews.
            </p>
            <UnsubscribeButton token={token!} />
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This link isn’t valid. You can change your email choices in your founder portal, under Settings.
          </p>
        )}
      </div>
    </main>
  );
}
