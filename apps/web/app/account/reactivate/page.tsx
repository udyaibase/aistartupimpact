import { redirect } from 'next/navigation';
import { founderFromCookies } from '@/lib/founder/account';
import ReactivateButton from './ReactivateButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account', robots: { index: false, follow: false } };

/** Where the founder portal sends an account that's deactivated or suspended. */
export default async function ReactivatePage() {
  const founder = await founderFromCookies();
  if (!founder) redirect('/auth/login');

  const suspended = founder.status === 'SUSPENDED';
  if (!suspended && !founder.deactivatedAt) redirect('/founder/dashboard');

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950 font-jakarta">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-6">
        {suspended ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Your account is suspended</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              You can’t use the founder portal right now. To find out why or to appeal, write to{' '}
              <a href="mailto:support@udyaibase.com" className="font-semibold underline">support@udyaibase.com</a>.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Your account is deactivated</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Your listings are hidden from the public. Reactivate your account to open your dashboard and show them again.
            </p>
            <ReactivateButton />
          </>
        )}
      </div>
    </main>
  );
}
