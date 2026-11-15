// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders the widget and opens the first job, like a candidate clicking "View role". */
function openJob(cfg: JobsWidgetConfig, jobs: CareersJob[] = [job]) {
  const el = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(el);
  act(() => { createRoot(el).render(<JobsWidgetView config={cfg} jobs={jobs} />); });
  const view = [...el.querySelectorAll('button')].find((b) => /View role: Software Engineer/.test(b.getAttribute('aria-label') ?? ''))!;
  act(() => { view.click(); });
  const text = (t: string) => [...el.querySelectorAll('*')].find((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim() === t)) ?? null;
  const applyButtons = [...el.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Apply now');
  const tab = (name: string) => [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === name) as HTMLButtonElement | undefined;
  const panel = (name: string) => document.getElementById(tab(name)!.getAttribute('aria-controls')!)!;
  return { el, text, applyButtons, tab, panel };
}
import JobsWidgetView, { type JobsWidgetConfig } from '@/components/embed/JobsWidgetView';
import type { CareersJob } from '@/lib/jobs/careers';

vi.mock('@/components/jobs/apply/JobApplyForm', () => ({ default: () => <input aria-label="Full name" defaultValue="" /> }));

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
});

const job: CareersJob = {
  id: 'j1', slug: 'software-engineer', title: 'Software Engineer', department: 'Engineering', location: null, city: 'Bengaluru',
  country: 'India', workType: 'ONSITE', employmentType: 'FULL_TIME', experienceBand: null, experienceMin: 1, experienceMax: 3,
  category: 'SOFTWARE_ENGINEER', categoryLabel: null, visaSponsorship: false, hiringManagerName: 'Asha Rao', positions: 1,
  salaryMin: 600000, salaryMax: 1200000, salaryCurrency: 'INR', showSalary: true, hasEsops: false,
  skills: ['React', 'TypeScript'], shortDescription: null, description: '## About the team\n\nWe build things.',
  publishedAt: new Date(Date.now() - 3 * 864e5).toISOString(), expiresAt: null, applicationType: 'INTERNAL', applicationUrl: null,
  screeningQuestions: [],
};

const config = {
  id: 'w1', layout: 'list', accentColor: '#A50F15', darkMode: 'light', cornerStyle: 'rounded', buttonText: 'View role',
  heading: null, subheading: null, headingAlign: 'left', headingSize: 'md', fontFamily: 'inherit', textScale: 'md',
  buttonSize: 'md', buttonStyle: 'filled', cardStyle: 'bordered', spacing: 'comfortable', maxJobs: 10, showLogo: true,
  showDepartment: true, showSalary: true, showSkills: true, showPoweredBy: true, design: {}, applyForm: undefined,
  company: { name: 'Udyaibase', logoUrl: null, slug: 'udyaibase', perks: ['Health insurance', 'Laptop and equipment', 'Remote-friendly'] },
} as unknown as JobsWidgetConfig;

describe('jobs widget: job detail', () => {
  it('shows the job like its Udyaibase page, with one Apply button at the end', () => {
    const { text, applyButtons } = openJob(config);

    expect(applyButtons).toHaveLength(1);
    for (const t of ['About the Role', 'Perks & Benefits', 'Required Skills', 'Interested in this role?',
      'Health insurance', 'Laptop and equipment', 'Remote-friendly', 'per annum', '3 days ago', '1–3 years', 'Asha Rao']) {
      expect(text(t), t).not.toBeNull();
    }
    // The candidate is on the company's site: no link sends them off to Udyaibase.
    expect(text('View on Udyaibase')).toBeNull();
    // Apply comes after every content section.
    expect(text('Required Skills')!.compareDocumentPosition(applyButtons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the number of openings only when a role hires more than one person', () => {
    expect(openJob(config).text('openings')).toBeNull();
    const many = openJob(config, [{ ...job, positions: 5 }]);
    expect(many.text('openings')).not.toBeNull();
    expect(many.text('5')).not.toBeNull();
  });

  it('leaves out Perks & Benefits when the company has none', () => {
    const { text } = openJob({ ...config, company: { ...config.company, perks: [] } });
    expect(text('Perks & Benefits')).toBeNull();
    expect(text('About the Role')).not.toBeNull();
  });

  it('has Overview and Apply tabs; Apply now opens the Apply tab', () => {
    const { tab, panel, applyButtons } = openJob(config);
    expect(tab('Overview')!.getAttribute('aria-selected')).toBe('true');
    expect(tab('Apply')!.getAttribute('aria-selected')).toBe('false');
    expect(panel('Apply').hidden).toBe(true);

    act(() => { applyButtons[0].click(); });
    expect(tab('Apply')!.getAttribute('aria-selected')).toBe('true');
    expect(panel('Overview').hidden).toBe(true);
    expect(panel('Apply').querySelector('input[aria-label="Full name"]')).not.toBeNull();
  });

  it('keeps what was typed when switching back to Overview and then to Apply', () => {
    const { tab, panel } = openJob(config);
    act(() => { tab('Apply')!.click(); });
    const input = panel('Apply').querySelector('input') as HTMLInputElement;
    input.value = 'Priya Rao';
    act(() => { tab('Overview')!.click(); });
    expect(panel('Apply').hidden).toBe(true);
    act(() => { tab('Apply')!.click(); });
    expect((panel('Apply').querySelector('input') as HTMLInputElement).value).toBe('Priya Rao');
  });

  it('moves between tabs with the arrow keys', () => {
    const { tab } = openJob(config);
    act(() => { tab('Overview')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(tab('Apply')!.getAttribute('aria-selected')).toBe('true');
  });

  it('has no tabs for a job that takes applications elsewhere, and All jobs returns to the list', () => {
    const external = { ...job, applicationType: 'EXTERNAL' as const, applicationUrl: 'https://example.com/apply' };
    const { el, tab, text } = openJob(config, [external]);
    expect(el.querySelector('[role="tablist"]')).toBeNull();
    expect(tab('Apply')).toBeUndefined();
    const back = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'All jobs')!;
    act(() => { back.click(); });
    expect(text('About the Role')).toBeNull();
  });
});
