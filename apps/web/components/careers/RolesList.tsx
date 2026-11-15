'use client';

import { useState } from 'react';
import type { ApplyFormConfig } from '@/lib/jobs/apply-form';
import { applyConsentText } from '@/lib/jobs/consent';
import NotifyForm from './NotifyForm';
import GeneralApplyCard from './GeneralApplyCard';
import type { PageJob } from './CareersPage';

const muted = { color: 'var(--w-muted)' };

/**
 * Open roles on the careers page: team filter chips (when there's more than one team), then rows or cards.
 * With no open roles: "Get notified" and, if turned on, "Apply generally".
 */
export default function RolesList({ jobs, slug, company, general, applyForm, preview, linkQuery, newTab, variant, centered }: {
  jobs: PageJob[];
  slug: string;
  company: string;
  general: { slug: string } | null;
  applyForm: ApplyFormConfig;
  preview: boolean;
  linkQuery: string;
  newTab: boolean;
  /** rows: hairline list (Minimal, Letter); cards: bordered rows (others). */
  variant: 'rows' | 'cards';
  centered?: boolean;
}) {
  const teams = Array.from(new Set(jobs.map((j) => j.team).filter(Boolean))) as string[];
  const [team, setTeam] = useState<string>('all');
  const shown = team === 'all' ? jobs : jobs.filter((j) => j.team === team);

  if (jobs.length === 0) {
    return (
      <div className={`flex flex-col gap-3 ${centered ? 'max-w-2xl mx-auto' : 'max-w-2xl'}`}>
        <p style={muted}>Leave your email and we’ll tell you the moment a role opens.</p>
        <NotifyForm companySlug={slug} companyName={company} source="page" preview={preview} />
        {general && <GeneralApplyCard slug={general.slug} company={company} consentText={applyConsentText(company)} form={applyForm} preview={preview} />}
      </div>
    );
  }

  return (
    <div>
      {teams.length > 1 && (
        <div role="tablist" aria-label="Filter roles by team"
          className={`mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${centered ? 'sm:justify-center' : ''}`}>
          {[{ key: 'all', label: 'All teams', n: jobs.length }, ...teams.map((t) => ({ key: t, label: t, n: jobs.filter((j) => j.team === t).length }))].map((c) => {
            const on = team === c.key;
            return (
              <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => setTeam(c.key)}
                className="shrink-0 snap-start min-h-[40px] px-4 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active:scale-[0.97] [-webkit-tap-highlight-color:transparent]"
                style={{
                  borderColor: on ? 'var(--w-text)' : 'var(--w-border)',
                  background: on ? 'var(--w-text)' : 'transparent',
                  color: on ? 'var(--w-surface)' : 'var(--w-text)',
                }}>
                {c.label} <span style={{ opacity: 0.6 }}>{c.n}</span>
              </button>
            );
          })}
        </div>
      )}
      <ul className={variant === 'rows' ? 'border-t' : 'flex flex-col gap-2.5'} style={variant === 'rows' ? { borderColor: 'var(--w-border)' } : undefined}>
        {shown.map((j) => (
          <li key={j.slug} className={variant === 'rows' ? 'border-b' : ''} style={variant === 'rows' ? { borderColor: 'var(--w-border)' } : undefined}>
            <a href={`/jobs/${j.slug}${linkQuery}`} {...(newTab ? { target: '_blank', rel: 'noopener' } : {})}
              className={`group flex items-center gap-3 sm:gap-4 min-h-[64px] transition-[transform,border-color] active:scale-[0.99] [-webkit-tap-highlight-color:transparent] ${variant === 'rows' ? 'py-4 sm:py-5' : 'border px-4 sm:px-6 py-4 sm:py-5 hover:border-[color:var(--w-text)]'}`}
              style={variant === 'cards' ? { borderColor: 'var(--w-border)', background: 'var(--w-surface)', borderRadius: 'var(--r-card)' } : undefined}>
              <div className="flex-1 min-w-0 sm:flex sm:items-baseline sm:gap-6">
                <p className="font-semibold text-base sm:text-[1.0625rem] leading-snug sm:flex-1 line-clamp-2">{j.title}</p>
                <p className="mt-1 sm:mt-0 text-[0.8125rem] sm:text-sm leading-relaxed sm:text-right sm:shrink-0 flex flex-wrap sm:justify-end gap-x-1.5" style={muted}>
                  {[teams.length > 1 && team === 'all' ? j.team : null, ...j.meta].filter(Boolean).map((m, i, all) => (
                    <span key={i} className="whitespace-nowrap">{m}{i < all.length - 1 && <span aria-hidden className="ml-1.5">·</span>}</span>
                  ))}
                </p>
              </div>
              <span aria-hidden className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-transform group-hover:translate-x-0.5"
                style={{ borderColor: 'var(--w-border)' }}>
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10h10m-4-4 4 4-4 4" /></svg>
              </span>
              <span className="sr-only">View role</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
