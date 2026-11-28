'use client';

import { useState } from 'react';
import { Check, Eye } from 'lucide-react';
import { EMPLOYER_KEYS, HOST_KEYS, HOST_UNLIMITED_EVENTS, type PlanCatalog } from '@udyaibase/utils/catalog';
import { PLANS } from '@udyaibase/utils/employer-plans';
import { HOST_PLANS } from '@udyaibase/utils/host-plans';
import { PACK_KEYS, PACKS } from '@udyaibase/utils/funding-packs';
import { card } from '@/components/billing/parts';
import type { Tab } from '@/components/billing/PlanPricesClient';

const GST = 0.18;
const rs = (paise: number) => (Number.isFinite(paise) ? `₹${Math.round(paise / 100).toLocaleString('en-IN')}` : '₹–');
const n = (v: number | null) => (v === null ? 'Unlimited' : Number.isFinite(v) ? v.toLocaleString('en-IN') : '–');
const withGst = (paise: number) => paise + Math.round(paise * GST);
/** The founding yearly price, rounded to whole rupees the way checkout does it. */
const founding = (yearlyPaise: number, pct: number) => Math.round((yearlyPaise * (1 - pct / 100)) / 100) * 100;

/** A value that differs from what customers see now is marked, so the eye lands on what is changing. */
function Mark({ changed, children }: { changed: boolean; children: React.ReactNode }) {
  return changed ? <mark className="rounded px-0.5 bg-amber-200 text-inherit">{children}</mark> : <>{children}</>;
}

/**
 * How the pricing pages will read with the values in the form: the same cards customers see, redrawn on every
 * keystroke, before anything is saved. Always drawn as the public site's light page, whatever the admin theme.
 * Changed figures are highlighted here only; the real pages show them plainly.
 */
export default function PlanPricingPreview({ catalog: c, inForce: f, tab, valid }: { catalog: PlanCatalog; inForce: PlanCatalog; tab: Tab; valid: boolean }) {
  const [yearly, setYearly] = useState(false);
  const R = c.rules;
  const page = 'rounded-xl bg-[#FBFAF7] text-[#111318] p-4 sm:p-5 border border-gray-200';
  const tile = 'rounded-2xl bg-white border border-gray-200 p-4 flex flex-col';
  const brand = 'text-[#A50F15]';
  const cycle = (
    <div role="group" aria-label="Billing shown in the preview" className="inline-flex rounded-full border border-gray-300 bg-white p-0.5 text-xs font-semibold">
      {[['Monthly', false], ['Yearly', true]].map(([l, y]) => (
        <button key={String(l)} type="button" aria-pressed={yearly === y} onClick={() => setYearly(y as boolean)} className={`px-3 py-1 rounded-full ${yearly === y ? 'bg-[#111318] text-white' : 'text-gray-700'}`}>{l as string}</button>
      ))}
    </div>
  );
  const features = (list: string[], was: string[]) => (
    <ul className="mt-3 space-y-1.5 text-[13px] text-gray-700">
      {list.filter((s) => s.trim()).map((s, i) => (
        <li key={i} className="flex gap-2"><Check className={`w-4 h-4 mt-0.5 shrink-0 ${brand}`} aria-hidden /><span><Mark changed={!was.includes(s)}>{s}</Mark></span></li>
      ))}
    </ul>
  );

  return (
    <section className={`${card} p-4`} aria-labelledby="pricing-preview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pricing-preview" className="portal-section-title inline-flex items-center gap-2"><Eye className="w-4 h-4" aria-hidden /> Preview: what customers will see</h2>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Updates as you type. Highlighted figures differ from what is live now.{!valid ? ' Some values are not complete yet.' : ''}</p>
        </div>
        {(tab === 'employer' || tab === 'host') && cycle}
      </div>

      <div className={`mt-3 ${page}`}>
        {tab === 'employer' && (
          <>
            <p className={`text-xs font-semibold ${brand}`}>Udyaibase AI Jobs</p>
            <p className="font-bold text-xl">Hiring plans and pricing</p>
            {R.employer.trialDays > 0 && (
              <p className="mt-1 text-[13px] text-gray-700">
                Your first published job starts a free <Mark changed={R.employer.trialDays !== f.rules.employer.trialDays}>{n(R.employer.trialDays)}-day</Mark>{' '}
                <Mark changed={R.employer.trialPlan !== f.rules.employer.trialPlan}>{PLANS[R.employer.trialPlan]?.name}</Mark> trial. No card needed.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {EMPLOYER_KEYS.map((k) => {
                const p = c.employer[k], was = f.employer[k];
                const paid = k !== 'FREE';
                const price = yearly ? p.annualPricePaise : p.pricePaise;
                const priceWas = yearly ? was.annualPricePaise : was.pricePaise;
                const fp = founding(p.annualPricePaise, R.employer.foundingDiscountPct);
                return (
                  <div key={k} className={`${tile} ${k === 'PRO' ? 'ring-2 ring-[#A50F15]/70 border-transparent' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold">{PLANS[k].name}</p>
                      {k === 'PRO' && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#A50F15]/10 text-[#A50F15]">Most popular</span>}
                    </div>
                    <p className="mt-2">
                      <span className="text-2xl font-extrabold tabular-nums"><Mark changed={price !== priceWas}>{paid ? rs(price) : '₹0'}</Mark></span>
                      <span className="text-sm text-gray-500">{paid ? (yearly ? ' / year' : ' / month') : ''}</span>
                    </p>
                    {paid && <p className="text-xs text-gray-500">+ 18% GST · {rs(withGst(price))} total{yearly ? ` · ${rs(Math.round(price / 12))}/mo` : ''}</p>}
                    {paid && yearly && R.employer.foundingLimit > 0 && R.employer.foundingDiscountPct > 0 && (
                      <p className="mt-1 text-xs text-gray-700">Founding price: <Mark changed={fp !== founding(was.annualPricePaise, f.rules.employer.foundingDiscountPct)}>{rs(fp)}</Mark> for the first {n(R.employer.foundingLimit)}</p>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[13px]">
                      <dt className="text-gray-500">Open jobs</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.maxActiveJobs !== was.maxActiveJobs}>{n(p.maxActiveJobs)}</Mark></dd>
                      <dt className="text-gray-500">AI reviews / month</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.aiScreensPerPeriod !== was.aiScreensPerPeriod}>{n(p.aiScreensPerPeriod)}</Mark></dd>
                      <dt className="text-gray-500">Team seats</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.maxSeats !== was.maxSeats}>{n(p.maxSeats)}</Mark></dd>
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {([['featured', 'Featured'], ['newsletter', 'Newsletter'], ['customBranding', 'Own branding']] as const).filter(([key]) => p[key]).map(([key, l]) => (
                        <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p[key] !== was[key] ? 'bg-amber-200' : 'bg-gray-100'} text-gray-800`}>{l}</span>
                      ))}
                    </div>
                    {features(p.features, was.features)}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Plans don’t renew by themselves. After a plan ends you get <Mark changed={R.employer.graceDays !== f.rules.employer.graceDays}>{n(R.employer.graceDays)} grace day{R.employer.graceDays === 1 ? '' : 's'}</Mark> to renew without losing anything.
            </p>
          </>
        )}

        {tab === 'host' && (
          <>
            <p className={`text-xs font-semibold ${brand}`}>Udyaibase Events</p>
            <p className="font-bold text-xl">Plans for event hosts</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {HOST_KEYS.map((k) => {
                const p = c.host[k], was = f.host[k];
                const paid = k !== 'FREE';
                const price = yearly ? p.annualPricePaise : p.pricePaise;
                const priceWas = yearly ? was.annualPricePaise : was.pricePaise;
                const fp = founding(p.annualPricePaise, R.host.foundingDiscountPct);
                return (
                  <div key={k} className={`${tile} ${k === 'PRO' ? 'ring-2 ring-[#A50F15]/70 border-transparent' : ''}`}>
                    <p className="font-bold">{HOST_PLANS[k].name}</p>
                    <p className="mt-2">
                      <span className="text-2xl font-extrabold tabular-nums"><Mark changed={price !== priceWas}>{paid ? rs(price) : '₹0'}</Mark></span>
                      <span className="text-sm text-gray-500">{paid ? (yearly ? ' / year' : ' / month') : ''}</span>
                    </p>
                    {paid && <p className="text-xs text-gray-500">+ 18% GST · {rs(withGst(price))} total</p>}
                    {paid && yearly && R.host.foundingLimit > 0 && R.host.foundingDiscountPct > 0 && (
                      <p className="mt-1 text-xs text-gray-700">Founding price: <Mark changed={fp !== founding(was.annualPricePaise, f.rules.host.foundingDiscountPct)}>{rs(fp)}</Mark> for the first {n(R.host.foundingLimit)}</p>
                    )}
                    <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-[13px]">
                      <dt className="text-gray-500">Upcoming events</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.maxUpcomingEvents !== was.maxUpcomingEvents}>{p.maxUpcomingEvents >= HOST_UNLIMITED_EVENTS ? 'Unlimited' : n(p.maxUpcomingEvents)}</Mark></dd>
                      <dt className="text-gray-500">Registrations / event</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.registrationsPerEvent !== was.registrationsPerEvent}>{n(p.registrationsPerEvent)}</Mark></dd>
                      <dt className="text-gray-500">Teammates</dt><dd className="text-right font-semibold tabular-nums"><Mark changed={p.teamMembers !== was.teamMembers}>{n(p.teamMembers)}</Mark></dd>
                    </dl>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {([['featuredEvents', 'Events featured'], ['removeBranding', 'No Udyaibase branding']] as const).filter(([key]) => p[key]).map(([key, l]) => (
                        <span key={key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p[key] !== was[key] ? 'bg-amber-200' : 'bg-gray-100'} text-gray-800`}>{l}</span>
                      ))}
                    </div>
                    {features(p.features, was.features)}
                  </div>
                );
              })}
              <div className={tile}>
                <p className="font-bold">Event Boost</p>
                <p className="mt-2"><span className="text-2xl font-extrabold tabular-nums"><Mark changed={c.boost.pricePaise !== f.boost.pricePaise}>{rs(c.boost.pricePaise)}</Mark></span><span className="text-sm text-gray-500"> one time</span></p>
                <p className="text-xs text-gray-500">+ 18% GST · {rs(withGst(c.boost.pricePaise))} total</p>
                <p className="mt-3 text-[13px] text-gray-700">Up to <Mark changed={c.boost.registrationsPerEvent !== f.boost.registrationsPerEvent}>{n(c.boost.registrationsPerEvent)}</Mark> registrations for this event, featured until it ends.</p>
              </div>
              <div className={tile}>
                <p className="font-bold">Certificates</p>
                <p className="mt-2"><span className="text-2xl font-extrabold tabular-nums"><Mark changed={R.certificatePricePaise !== f.rules.certificatePricePaise}>{rs(R.certificatePricePaise)}</Mark></span><span className="text-sm text-gray-500"> per event</span></p>
                <p className="text-xs text-gray-500">+ 18% GST · {rs(withGst(R.certificatePricePaise))} total</p>
                <p className="mt-3 text-[13px] text-gray-700">Certificates for everyone who attended. Included in Pro.</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Paid tickets: you keep <Mark changed={R.ticketFeePct !== f.rules.ticketFeePct}>{R.ticketFeePct === null ? 'the amount after the platform fee' : `${(100 - R.ticketFeePct).toLocaleString('en-IN')}% of each ticket; the platform fee is ${R.ticketFeePct}%`}</Mark>.
            </p>
          </>
        )}

        {tab === 'funding' && (
          <>
            <p className={`text-xs font-semibold ${brand}`}>Funding data</p>
            <p className="font-bold text-xl">Download the dataset</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {PACK_KEYS.map((k) => {
                const p = c.funding[k], was = f.funding[k];
                return (
                  <div key={k} className={tile}>
                    <p className="font-bold">{PACKS[k].name}</p>
                    <p className="text-xs text-gray-500">{PACKS[k].blurb}</p>
                    <p className="mt-2 text-2xl font-extrabold tabular-nums"><Mark changed={p.totalPaise !== was.totalPaise}>{rs(p.totalPaise)}</Mark></p>
                    <p className="text-xs text-gray-500">GST included</p>
                    <p className="mt-3 text-[13px] text-gray-700"><Mark changed={p.limit !== was.limit}>{p.limit === null ? 'Every startup' : `Up to ${n(p.limit)} startups`}</Mark></p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'rules' && (
          <div className="space-y-3 text-[14px] leading-relaxed">
            <p className="font-bold text-lg">How these rules read to customers</p>
            <p>
              <span className="font-semibold">Is there a free trial?</span>{' '}
              {R.employer.trialDays > 0
                ? <>Yes. Your first published job starts a free <Mark changed={R.employer.trialDays !== f.rules.employer.trialDays}>{n(R.employer.trialDays)}-day</Mark> <Mark changed={R.employer.trialPlan !== f.rules.employer.trialPlan}>{PLANS[R.employer.trialPlan]?.name}</Mark> trial, with AI review for up to <Mark changed={R.employer.trialAiScreens !== f.rules.employer.trialAiScreens}>{n(R.employer.trialAiScreens)}</Mark> candidates. No card is needed.</>
                : <Mark changed={f.rules.employer.trialDays > 0}>There is no free trial. New workspaces start on the Free plan.</Mark>}
            </p>
            <p>
              <span className="font-semibold">Do plans renew automatically?</span> No. We email you before yours ends, and you get{' '}
              <Mark changed={R.employer.graceDays !== f.rules.employer.graceDays}>{n(R.employer.graceDays)} grace day{R.employer.graceDays === 1 ? '' : 's'}</Mark> on hiring plans and{' '}
              <Mark changed={R.host.graceDays !== f.rules.host.graceDays}>{n(R.host.graceDays)}</Mark> on host Pro to renew without losing anything.
            </p>
            {(['employer', 'host'] as const).map((who) => {
              const x = R[who], w = f.rules[who];
              const yearlyPrice = who === 'employer' ? c.employer.PRO.annualPricePaise : c.host.PRO.annualPricePaise;
              return (
                <p key={who}>
                  <span className="font-semibold">{who === 'employer' ? 'Hiring founding price.' : 'Host founding price.'}</span>{' '}
                  {x.foundingLimit > 0 && x.foundingDiscountPct > 0
                    ? <>The first <Mark changed={x.foundingLimit !== w.foundingLimit}>{n(x.foundingLimit)}</Mark> {who === 'employer' ? 'workspaces' : 'hosts'} on a yearly plan get <Mark changed={x.foundingDiscountPct !== w.foundingDiscountPct}>{x.foundingDiscountPct}% off</Mark>, and keep that price on renewals for <Mark changed={x.foundingLockMonths !== w.foundingLockMonths}>{n(x.foundingLockMonths)} months</Mark>. Pro for a year: {rs(founding(yearlyPrice, x.foundingDiscountPct))} instead of {rs(yearlyPrice)}.</>
                    : <Mark changed={w.foundingLimit > 0 && w.foundingDiscountPct > 0}>No founding price is offered to new customers.</Mark>}
                </p>
              );
            })}
            <p><span className="font-semibold">Certificates</span> for one event cost <Mark changed={R.certificatePricePaise !== f.rules.certificatePricePaise}>{rs(R.certificatePricePaise)}</Mark> plus GST for hosts not on Pro.</p>
            <p>
              <span className="font-semibold">Paid tickets.</span>{' '}
              <Mark changed={R.ticketFeePct !== f.rules.ticketFeePct}>{R.ticketFeePct === null ? 'The platform fee is the one set on the server (5% unless it was changed there).' : `The platform fee is ${R.ticketFeePct}% of each ticket. On a ₹1,000 ticket the host receives ₹${(1000 - R.ticketFeePct * 10).toLocaleString('en-IN')}.`}</Mark>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
