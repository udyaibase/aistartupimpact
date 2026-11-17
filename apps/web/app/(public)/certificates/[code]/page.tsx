import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { certificateByCode, linkedInAddUrl, verifyUrl } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your certificate | Udyaibase', robots: { index: false, follow: false } };

/** The attendee's certificate: view, download, add to LinkedIn, share the verification link. */
export default async function CertificatePage(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const c = await certificateByCode(code.toUpperCase());
  if (!c || c.revoked) notFound();
  const pdfUrl = `/api/certificates/${c.code}/pdf`;
  const share = verifyUrl(c.code);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`I got my certificate for ${c.eventTitle}: ${share}`)}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{c.title}</p>
      <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">{c.eventTitle}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{c.recipientName} · {c.date} · {c.hostName}</p>

      <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">
        <object data={`${pdfUrl}#toolbar=0&view=FitH`} type="application/pdf" className="w-full aspect-[842/595]" aria-label="Certificate preview">
          <p className="p-6 text-sm text-gray-600 dark:text-gray-400">Your browser can’t show the PDF here. <a href={pdfUrl} className="underline">Open it</a>.</p>
        </object>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <a href={`${pdfUrl}?download=1`} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
          <Download className="w-4 h-4" aria-hidden /> Download PDF
        </a>
        <a href={linkedInAddUrl(c)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-[#0A66C2] hover:bg-[#004182] text-white text-sm font-semibold">
          Add to LinkedIn <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          Share on WhatsApp
        </a>
      </div>

      <p className="mt-6 flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-600" aria-hidden />
        <span>Anyone can check it’s genuine at <Link href={`/verify/${c.code}`} className="underline break-all">{share.replace(/^https?:\/\//, '')}</Link> or by scanning the QR code.</span>
      </p>
    </div>
  );
}
