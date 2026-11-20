import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { salaryText } from '@/lib/jobs/format';
import { candidateView } from '@/lib/jobs/candidate-status';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('salaryText: one way to write a salary', () => {
  it('writes INR in lakh', () => {
    expect(salaryText({ salaryMin: 1600000, salaryMax: 2900000, salaryCurrency: 'INR' })).toBe('₹16–29 L');
    expect(salaryText({ salaryMin: 850000, salaryMax: 1250000, salaryCurrency: 'INR' })).toBe('₹8.5–12.5 L');
    expect(salaryText({ salaryMin: 1800000, salaryMax: 1800000, salaryCurrency: null })).toBe('₹18 L');
  });

  it('shows the one end it has, never "–0L"', () => {
    expect(salaryText({ salaryMin: 800000, salaryMax: null, salaryCurrency: 'INR' })).toBe('₹8 L');
    expect(salaryText({ salaryMin: null, salaryMax: 4000000, salaryCurrency: 'INR' })).toBe('₹40 L');
  });

  it('uses each currency’s own sign, in thousands', () => {
    expect(salaryText({ salaryMin: 90000, salaryMax: 120000, salaryCurrency: 'USD' })).toBe('$90K–120K');
    expect(salaryText({ salaryMin: 60000, salaryMax: null, salaryCurrency: 'GBP' })).toBe('£60K');
    expect(salaryText({ salaryMin: 70000, salaryMax: 90000, salaryCurrency: 'SGD' })).toBe('S$70K–90K');
    expect(salaryText({ salaryMin: 200000, salaryMax: 300000, salaryCurrency: 'AED' })).toBe('AED 200K–300K');
  });

  it('is nothing when there is no salary to show (a hidden one arrives as null)', () => {
    expect(salaryText({ salaryMin: null, salaryMax: null, salaryCurrency: 'INR' })).toBeNull();
    expect(salaryText({})).toBeNull();
  });

  it('no job page formats salary by hand any more', () => {
    for (const p of ['app/(public)/jobs/JobListClient.tsx', 'app/(public)/jobs/[slug]/page.tsx', 'app/(public)/page.tsx']) {
      expect(read(p)).not.toMatch(/salaryM(in|ax) \/ 1000/);
      expect(read(p)).toContain('salaryText(');
    }
  });
});

describe('job list order', () => {
  const search = read('lib/jobs/search.ts');
  it('"Highest salary" and "Most viewed" are plain sorts; only the default spreads companies out', () => {
    const order = search.slice(search.indexOf('ORDER BY ${sort ==='), search.indexOf('LIMIT ${pageSize}'));
    const [salary, rest] = order.split(": sort === 'views'");
    const [views, fallback] = rest.split(': sql`');
    expect(salary).toContain('"salaryMax" DESC NULLS LAST');
    expect(salary).not.toContain('company_rank');
    expect(views).toContain('"viewsCount" DESC');
    expect(views).not.toContain('company_rank');
    expect(fallback).toContain('company_rank');
  });
});

describe('what a candidate sees', () => {
  it('an application nobody has opened is "Received", not "Under review"', () => {
    const v = candidateView({ status: 'APPLIED', outcome: null, withdrawnAt: null });
    expect(v.stage.label).toBe('Received');
    expect(v.steps[v.step]).toBe('Applied');
  });

  it('once someone opens it, it is under review', () => {
    const v = candidateView({ status: 'REVIEWED', outcome: null, withdrawnAt: null });
    expect(v.stage.label).toBe('Under review');
    expect(v.steps[v.step]).toBe('Under review');
  });

  it('the public job page no longer shows the employer’s view and application counts', () => {
    const page = read('app/(public)/jobs/[slug]/page.tsx');
    expect(page).not.toContain('Applications:</strong>');
    expect(page).not.toContain('Views:</strong>');
  });
});

describe('the composer preview and the job page write salary the same way', () => {
  it('for every currency and shape of range', async () => {
    const { formatSalaryDraft, salaryUnit } = await import('@/lib/jobs/composer');
    const cases: [string, string, string][] = [
      ['INR', '3', '4.8'], ['INR', '16', '29'], ['INR', '18', ''], ['INR', '', '40'], ['INR', '12', '12'],
      ['USD', '90', '120'], ['GBP', '60', ''], ['EUR', '70', '85'], ['SGD', '70', '90'], ['AED', '200', '300'],
    ];
    for (const [currency, min, max] of cases) {
      const { factor } = salaryUnit(currency);
      const onPage = salaryText({ salaryMin: min ? Number(min) * factor : null, salaryMax: max ? Number(max) * factor : null, salaryCurrency: currency });
      expect(formatSalaryDraft({ salaryCurrency: currency, salaryMin: min, salaryMax: max })).toBe(`${onPage} per annum`);
    }
    expect(formatSalaryDraft({ salaryCurrency: 'INR', salaryMin: '', salaryMax: '' })).toBeNull();
    expect(formatSalaryDraft({ salaryCurrency: 'INR', salaryMin: 'abc', salaryMax: '0' })).toBeNull();
  });
});

describe('a job that closes by itself', () => {
  it('reads as such in the activity log, unlike one someone closed', async () => {
    const { describeWorkspaceActivity } = await import('@udyaibase/utils/src/workspace-activity');
    const title = (meta: Record<string, string>) => describeWorkspaceActivity('EMPLOYER', 'job_status_changed', meta).title;
    expect(title({ title: 'ML Intern', status: 'CLOSED', reason: 'filled' })).toBe('The job “ML Intern” closed by itself: every opening is filled');
    expect(title({ title: 'ML Intern', status: 'CLOSED' })).toBe('Closed the job “ML Intern”');
    expect(title({ title: 'ML Intern', status: 'PAUSED' })).toBe('Paused the job “ML Intern”');
  });
});
