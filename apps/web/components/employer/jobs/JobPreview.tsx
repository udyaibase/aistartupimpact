'use client';

import Image from 'next/image';
import { BadgeCheck, Check, Circle, MapPin, Briefcase, Clock, Wallet } from 'lucide-react';
import JobDescription from '@/components/jobs/JobDescription';
import {
  EMPLOYMENT_TYPES, EXPERIENCE_BANDS, WORK_TYPES, formatSalaryDraft, listingStrength, type JobDraft,
} from '@/lib/jobs/composer';

export interface ComposerCompany {
  name: string;
  logoUrl: string | null;
  verified: boolean;
  hasPerks: boolean;
}

const label = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label;

export function JobPreview({ draft, company }: { draft: JobDraft; company: ComposerCompany }) {
  const place = draft.workType === 'REMOTE'
    ? ['Remote', draft.country].filter(Boolean).join(' · ')
    : [draft.city, draft.country].filter(Boolean).join(', ');
  const salary = draft.showSalary ? formatSalaryDraft(draft) : null;
  const meta = [
    { icon: MapPin, text: [place, draft.workType !== 'REMOTE' ? label(WORK_TYPES, draft.workType) : null].filter(Boolean).join(' · ') },
    { icon: Briefcase, text: label(EMPLOYMENT_TYPES, draft.employmentType) },
    { icon: Clock, text: draft.experienceBand ? `${label(EXPERIENCE_BANDS, draft.experienceBand)} experience` : null },
    { icon: Wallet, text: salary ? `${salary}${draft.hasEsops ? ' + ESOPs' : ''}` : draft.hasEsops ? 'ESOPs offered' : null },
  ].filter((m) => m.text);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] overflow-hidden">
      <p className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 portal-eyebrow">How candidates see it</p>
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-10 h-10 rounded-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center font-sora font-bold text-gray-700 dark:text-gray-200 shrink-0" aria-hidden>
            {company.logoUrl ? <Image src={company.logoUrl} alt="" width={40} height={40} sizes="40px" className="w-full h-full object-cover" /> : company.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
              {company.name}
              {company.verified && <BadgeCheck className="w-4 h-4 text-green-700 dark:text-green-400 shrink-0" aria-label="Verified" />}
            </span>
            {!company.verified && <span className="block text-xs text-gray-500">Unverified company</span>}
          </span>
        </div>
        <h3 className="font-sora font-bold text-lg leading-snug text-gray-900 dark:text-white break-words">
          {draft.title.trim() || <span className="text-gray-400">Job title</span>}
        </h3>
        {meta.length > 0 && (
          <ul className="mt-2 space-y-1">
            {meta.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                <m.icon className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-hidden /> {m.text}
              </li>
            ))}
          </ul>
        )}
        {draft.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {draft.skills.map((s) => (
              <span key={s} className="h-7 inline-flex items-center px-2 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300">{s}</span>
            ))}
          </div>
        )}
        {draft.description.trim() ? (
          <div className="mt-4 max-h-72 overflow-y-auto pr-1 text-sm border-t border-gray-100 dark:border-gray-800 pt-3">
            <JobDescription content={draft.description} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">The job description will appear here.</p>
        )}
        <div className="mt-4 h-11 rounded-[10px] bg-brand text-white text-sm font-bold flex items-center justify-center opacity-90" aria-hidden>
          {draft.applicationType === 'EXTERNAL' ? 'Apply on company site' : 'Apply now'}
        </div>
      </div>
    </div>
  );
}

export function ListingStrength({ draft, company }: { draft: JobDraft; company: ComposerCompany }) {
  const s = listingStrength(draft, { companyHasPerks: company.hasPerks });
  const tone = s.score >= 85 ? 'bg-green-600' : s.score >= 65 ? 'bg-green-500' : s.score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Listing strength</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{s.label} · {s.score}%</p>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.score} aria-label="Listing strength">
        <div className={`h-full rounded-full transition-[width] ${tone}`} style={{ width: `${s.score}%` }} />
      </div>
      <ul className="mt-3 space-y-2">
        {s.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            {c.passed
              ? <Check className="w-4 h-4 mt-0.5 text-green-700 dark:text-green-400 shrink-0" aria-hidden />
              : <Circle className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden />}
            <span className="text-[13px]">
              <span className={c.passed ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-white'}>{c.label}</span>
              <span className="sr-only">{c.passed ? ' — done' : ' — to do'}</span>
              {!c.passed && <span className="block text-gray-500 dark:text-gray-400">{c.tip}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
