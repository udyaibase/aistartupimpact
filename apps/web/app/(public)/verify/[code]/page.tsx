import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, XCircle } from 'lucide-react';
import { certificateByCode } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Verify a certificate | Udyaibase', robots: { index: false, follow: false } };

/** Public check that a certificate is genuine. Shows only the name, event, date and host: nothing else about the person. */
export default async function VerifyCertificatePage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const c = await certificateByCode(code.toUpperCase());

  if (!c || c.revoked) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 text-center">
          <XCircle className="w-10 h-10 mx-auto text-red-600 mb-3" aria-hidden />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{c?.revoked ? 'This certificate was withdrawn' : 'Certificate not found'}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {c?.revoked ? 'The event host withdrew this certificate, so it’s no longer valid.' : 'Check the ID on the certificate. It’s 16 letters and numbers, printed under the QR code.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <BadgeCheck className="w-6 h-6" aria-hidden />
          <p className="text-sm font-semibold">Valid certificate</p>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{c.recipientName}</h1>
        <dl className="mt-5 divide-y divide-gray-100 dark:divide-gray-800 text-sm">
          {[
            ['Certificate', c.title],
            ['Event', c.eventTitle],
            ['Date', c.date],
            ['Issued by', c.hostName],
            ['Certificate ID', c.code],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-3 py-2.5">
              <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="text-gray-900 dark:text-white font-medium break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
          Issued through <Link href={`/events/${c.eventSlug}`} className="underline">Udyaibase Events</Link>. This page confirms the certificate is genuine.
        </p>
      </div>
    </div>
  );
}
