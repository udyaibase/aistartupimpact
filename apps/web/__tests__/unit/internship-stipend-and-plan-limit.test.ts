import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { draftFromRow, draftToData, emptyDraft, formatSalaryDraft, payPeriodFor, salaryUnit } from '@/lib/jobs/composer';
import { salaryText } from '@/lib/jobs/format';
import { jobPostingSalary } from '@/lib/jobs/public';
import { nextPlan } from '@/lib/employer/plans';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('internship stipend: thousands a month', () => {
  it('internships are monthly, everything else yearly', () => {
    expect(payPeriodFor('INTERNSHIP')).toBe('monthly');
    for (const t of ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', '', null]) expect(payPeriodFor(t)).toBe('yearly');
    expect(salaryUnit('INR', 'monthly')).toEqual({ factor: 1000, suffix: 'K', symbol: '₹' });
    expect(salaryUnit('INR')).toMatchObject({ factor: 100_000, suffix: 'L' });
  });

  it('saves ₹15K–25K as 15,000–25,000 a month and reads it back the same', () => {
    const data = draftToData({ ...emptyDraft(), title: 'ML Intern', employmentType: 'INTERNSHIP', salaryMin: '15', salaryMax: '25' });
    expect(data).toMatchObject({ salaryMin: 15_000, salaryMax: 25_000, salaryPeriod: 'monthly' });
    const back = draftFromRow({ ...data, salaryCurrency: 'INR' });
    expect([back.salaryMin, back.salaryMax]).toEqual(['15', '25']);
  });

  it('a full-time job is still lakh a year', () => {
    expect(draftToData({ ...emptyDraft(), title: 'Engineer', salaryMin: '18', salaryMax: '28' })).toMatchObject({ salaryMin: 1_800_000, salaryMax: 2_800_000, salaryPeriod: 'yearly' });
  });

  it('shows the same text in the preview and on the job', () => {
    expect(salaryText({ salaryMin: 15_000, salaryMax: 25_000, salaryCurrency: 'INR', salaryPeriod: 'monthly' })).toBe('₹15K–25K/month');
    expect(salaryText({ salaryMin: 12_500, salaryMax: null, salaryCurrency: 'INR', salaryPeriod: 'monthly' })).toBe('₹12.5K/month');
    expect(salaryText({ salaryMin: 1000, salaryMax: 2000, salaryCurrency: 'USD', salaryPeriod: 'monthly' })).toBe('$1K–2K/month');
    expect(formatSalaryDraft({ salaryCurrency: 'INR', salaryMin: '15', salaryMax: '25', employmentType: 'INTERNSHIP' })).toBe('₹15K–25K/month');
    expect(formatSalaryDraft({ salaryCurrency: 'INR', salaryMin: '18', salaryMax: '28', employmentType: 'FULL_TIME' })).toBe('₹18–28 L per annum');
  });

  it('tells Google it is a monthly amount', () => {
    expect(jobPostingSalary({ salaryMin: 15_000, salaryMax: 25_000, salaryCurrency: 'INR', salaryPeriod: 'monthly' })?.value.unitText).toBe('MONTH');
    expect(jobPostingSalary({ salaryMin: 1_800_000, salaryMax: null, salaryCurrency: 'INR' })?.value.unitText).toBe('YEAR');
  });

  it('every public job query carries the pay period to salaryText', () => {
    expect(read('lib/jobs/search.ts')).toContain('"salaryPeriod"');
    expect(read('app/(public)/jobs/[slug]/page.tsx')).toContain('"salaryPeriod"');
    expect(read('app/(public)/startups/[slug]/page.tsx')).toContain('salaryPeriod: job.salaryPeriod');
    expect(read('lib/jobs/careers.ts')).toContain('salaryPeriod: true');
    expect(read('lib/jobs/careers-page.ts')).toContain('salaryPeriod: true');
  });
});

describe('open-job limit: the next plan up', () => {
  it('Free → Growth → Pro → Scale, then nothing', () => {
    expect(nextPlan('FREE')?.key).toBe('GROWTH');
    expect(nextPlan('GROWTH')?.key).toBe('PRO');
    expect(nextPlan('PRO')?.key).toBe('SCALE');
    expect(nextPlan('SCALE')).toBeNull();
  });

  it('skips a plan that would not add jobs (an admin-raised limit)', () => {
    expect(nextPlan('FREE', 5)?.key).toBe('PRO');
    expect(nextPlan('GROWTH', 40)).toBeNull();
  });

  it('jobs past their closing date and the general application never use up the allowance', () => {
    const counts = read('lib/employer/counts.ts');
    expect(counts).toContain("isGeneral: false");
    expect(counts).toContain('{ expiresAt: { gt: now } }');
    expect(read('lib/employer/publish.ts')).toContain('countOpenJobs(employerId)');
  });
});
