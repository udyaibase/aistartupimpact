import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getUserSession } from '@/lib/user-session';
import PreferencesClient from './PreferencesClient';
import { getPreferencesForm } from './actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Preferences — Udyaibase',
  robots: { index: false, follow: false },
};

export default async function PreferencesPage() {
  const session = await getUserSession();
  if (!session) redirect('/auth/login');

  const form = await getPreferencesForm();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Preferences</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          What you’re here for, the topics you follow and your city. These shape your “For you” suggestions.
        </p>
      </div>
      <PreferencesClient initialPrefs={form?.prefs ?? null} jobRoles={form?.jobRoles ?? []} />
    </div>
  );
}
