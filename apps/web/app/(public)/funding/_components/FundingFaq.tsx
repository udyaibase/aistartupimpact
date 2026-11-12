import type { Faq } from '@/lib/funding/insights';

/** Visible FAQ. Its text is the same as the FAQPage structured data, as Google requires. */
export default function FundingFaq({ id, title, faq }: { id: string; title: string; faq: Faq[] }) {
  if (!faq.length) return null;
  return (
    <section aria-labelledby={id} className="card p-4 sm:p-6">
      <h2 id={id} className="font-sora font-bold text-base sm:text-xl text-navy dark:text-white mb-2">{title}</h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {faq.map((f, i) => (
          <details key={f.q} className="group py-3" open={i === 0}>
            <summary className="cursor-pointer list-none flex items-start justify-between gap-4 font-sora font-semibold text-sm sm:text-base text-navy dark:text-white">
              <h3 className="font-sora font-semibold text-sm sm:text-base">{f.q}</h3>
              <span aria-hidden className="text-brand transition-transform group-open:rotate-45 text-lg leading-none">+</span>
            </summary>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 font-jakarta leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
