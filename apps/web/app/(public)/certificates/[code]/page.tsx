import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { certificateByCode, linkedInAddUrl, verifyUrl } from '@/lib/events/certificates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your certificate', robots: { index: false, follow: false } };

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
      {(c.description || c.skills.length > 0) && (
        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          {c.description && <p>{c.description}</p>}
          {c.skills.length > 0 && (
            <ul aria-label="Topics covered" className="mt-2 flex flex-wrap gap-1.5">
              {c.skills.map((k) => <li key={k} className="rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-xs font-medium">{k}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-50 dark:bg-gray-900">
        {/* A frame, not <object>: the site's policy forbids plugins (object-src 'none'), which left this box showing
            only its fallback text in every browser. The PDF route allows framing by our own pages. */}
        <iframe src={`${pdfUrl}#toolbar=0&view=FitH`} title="Certificate preview" className="w-full aspect-[842/595] border-0" />
        <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">Can’t see it? <a href={pdfUrl} className="underline">Open the PDF</a>.</p>
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
