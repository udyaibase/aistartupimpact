import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import {
  FOUNDING_DISCOUNT, FOUNDING_LIMIT, FOUNDING_LOCK_MONTHS, GRACE_DAYS, planPrice, PLANS, rupees, TRIAL_DAYS, TRIAL_PLAN, type PlanKey,
} from '@/lib/employer/plans';

export const metadata: Metadata = {
  title: 'Hiring plans and pricing',
  description: 'Post AI jobs from free. Verified company badge, AI screening with identity removed, and a careers widget for your website. Growth, Pro and Scale plans from ₹2,499 a month.',
  alternates: { canonical: 'https://udyaibase.com/hire/pricing' },
};

const KEYS: PlanKey[] = ['FREE', 'GROWTH', 'PRO', 'SCALE'];

const EVERY_PLAN = [
  'Verified company badge on every job',
  'Match score on every candidate',
  'Pipeline, notes with @mentions and stage emails',
  'Bulk actions, talent pool and CSV export',
  'Where each applicant came from',
  'Careers page and website widget',
  '30-day listings with one-click renewal',
  'GST invoice for every payment',
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Are prices inclusive of GST?', a: 'No. Prices are shown before GST; 18% GST is added at checkout and shown separately on your GST invoice. Add your GSTIN in Billing details to claim input tax credit.' },
  { q: 'Is there a free trial?', a: `Yes. Your first published job starts a free ${TRIAL_DAYS}-day ${PLANS[TRIAL_PLAN].name} trial. No card is needed and nothing is charged; when it ends you move to Free unless you choose a plan.` },
  { q: 'Do plans renew automatically?', a: `No. Monthly plans last 30 days and yearly plans 365 days. We email you before yours ends, and you get ${GRACE_DAYS} grace days to renew without losing anything.` },
  { q: 'What happens if I go back to Free?', a: 'Nothing is deleted. Candidates, notes and past AI reviews stay. If more jobs are open than Free allows, your most recent job stays open and the rest are paused until you upgrade.' },
  { q: 'How does AI screening treat candidates?', a: 'Names, emails, phone numbers and links are removed before the AI reads a resume. The AI never scores or ranks people: it quotes evidence from the resume, each quote is checked against the resume, and the match score is calculated by our own code.' },
  { q: 'What is the founding member price?', a: `The first ${FOUNDING_LIMIT} workspaces on a yearly plan get ${Math.round(FOUNDING_DISCOUNT * 100)}% off, and keep that price on renewals for ${FOUNDING_LOCK_MONTHS} months as long as the plan never lapses to Free.` },
  { q: 'Can I get a refund?', a: 'If you haven’t used a paid feature, you can get a full refund within 7 days of paying (14 days for yearly plans). See the Refund Policy for details.' },
];

export default function HirePricingPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 font-jakarta">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-[#A50F15] dark:text-red-300">Udyaibase AI Jobs</p>
        <h1 className="mt-2 font-sora font-extrabold text-3xl sm:text-5xl text-navy dark:text-white">Hiring plans and pricing</h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Start free with one open job and 25 AI screenings a month. Every company is verified, AI reviews never see a candidate&apos;s name, and your careers widget works on any website.
        </p>
      </header>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KEYS.map((k) => {
          const p = PLANS[k];
          const paid = k !== 'FREE';
          const monthly = planPrice(k, 'MONTHLY');
          const yearly = planPrice(k, 'ANNUAL');
          return (
            <section key={k} aria-labelledby={`hp-${k}`} className={`flex flex-col rounded-[14px] border bg-white dark:bg-gray-900 p-5 ${k === 'PRO' ? 'border-transparent ring-2 ring-[#A50F15]/70' : 'border-gray-200 dark:border-gray-800'}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 id={`hp-${k}`} className="text-lg font-bold text-gray-900 dark:text-white">{p.name}</h2>
                {k === 'PRO' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#A50F15]/10 text-[#A50F15] dark:text-red-300">Most popular</span>}
              </div>
              <p className="mt-3">
                <span className="text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums">{paid ? rupees(monthly.amount) : '₹0'}</span>
                <span className="text-sm text-gray-500">{paid ? ' / month' : ''}</span>
              </p>
              <p className="text-xs text-gray-500">
                {paid ? <>+ 18% GST · or {rupees(yearly.amount)} / year (2 months free)</> : 'Free forever'}
              </p>
              <ul className="mt-5 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    {f.startsWith('AI') ? <Sparkles className="w-4 h-4 mt-0.5 text-violet-600 shrink-0" aria-hidden /> : <Check className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden />} {f}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-[13px] text-gray-500"><Check className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden /> Support: {p.support}</li>
              </ul>
              <Link href="/employer/signup" className={`mt-6 inline-flex min-h-[44px] items-center justify-center rounded-[10px] text-sm font-semibold ${k === 'PRO' ? 'bg-[#A50F15] text-white hover:bg-[#8a0c11]' : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900'}`}>
                {paid ? `Start free, upgrade to ${p.name}` : 'Post a job free'}
              </Link>
            </section>
          );
        })}
      </div>

      <p className="mt-6 rounded-[12px] border border-[#A50F15]/20 bg-red-50/50 dark:bg-red-900/10 px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
        <strong className="text-[#A50F15] dark:text-red-300">Founding member price:</strong> the first {FOUNDING_LIMIT} workspaces on a yearly plan get {Math.round(FOUNDING_DISCOUNT * 100)}% off, for {FOUNDING_LOCK_MONTHS} months. For example, Growth yearly is {rupees(planPrice('GROWTH', 'ANNUAL', { founding: true }).amount)} instead of {rupees(planPrice('GROWTH', 'ANNUAL').amount)}.
      </p>

      <section aria-labelledby="every" className="mt-14">
        <h2 id="every" className="font-sora text-2xl font-bold text-navy dark:text-white">Included on every plan, Free too</h2>
        <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {EVERY_PLAN.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><Check className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden /> {f}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq" className="mt-14 max-w-3xl">
        <h2 id="faq" className="font-sora text-2xl font-bold text-navy dark:text-white">Questions</h2>
        <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-800 border-y border-gray-200 dark:border-gray-800">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none font-semibold text-gray-900 dark:text-white flex items-center justify-between gap-4">
                {f.q}<span aria-hidden className="text-gray-400 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Read the <Link href="/terms" className="underline">Terms</Link> and <Link href="/refund" className="underline">Refund Policy</Link>. Questions about billing? Email <a href="mailto:billing@udyaibase.com" className="underline">billing@udyaibase.com</a>.
        </p>
      </section>
    </div>
  );
}
