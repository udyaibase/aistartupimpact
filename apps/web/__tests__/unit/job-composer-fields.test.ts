import { describe, it, expect } from 'vitest';
import { CUSTOM_EXPERIENCE, categoryText, draftFromRow, draftToData, emptyDraft, publishProblems, type JobDraft } from '@/lib/jobs/composer';
import { experienceText } from '@/components/employer/jobs/JobPreview';

const ready = (over: Partial<JobDraft> = {}): JobDraft => ({
  ...emptyDraft(), title: 'Backend Engineer', country: 'India', city: 'Bengaluru', description: 'x'.repeat(120), ...over,
});
const fields = (d: JobDraft) => publishProblems(d).map((p) => p.field);

describe('categories', () => {
  it('new standard categories save as themselves', () => {
    expect(draftToData(ready({ category: 'BACKEND_ENGINEER' })).category).toBe('BACKEND_ENGINEER');
    expect(draftToData(ready({ category: 'NOT_A_CATEGORY' })).category).toBe('OTHER');
  });
  it('a custom category is stored as OTHER with its own name, and comes back the same', () => {
    const data = draftToData(ready({ category: 'OTHER', categoryLabel: '  Hardware Engineer ' }));
    expect(data).toMatchObject({ category: 'OTHER', categoryLabel: 'Hardware Engineer' });
    expect(draftFromRow({ ...data }).categoryLabel).toBe('Hardware Engineer');
    expect(categoryText('OTHER', 'Hardware Engineer')).toBe('Hardware Engineer');
    expect(categoryText('BACKEND_ENGINEER', null)).toBe('Backend Engineer');
  });
  it('a label is dropped when a standard category is picked', () => {
    expect(draftToData(ready({ category: 'DATA_ANALYST', categoryLabel: 'leftover' })).categoryLabel).toBeNull();
  });
});

describe('custom experience', () => {
  it('saves a custom range in order and reloads it as custom', () => {
    const data = draftToData(ready({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '7', experienceMax: '4' }));
    expect(data).toMatchObject({ experienceBand: null, experienceMin: 4, experienceMax: 7 });
    const back = draftFromRow({ ...data });
    expect(back).toMatchObject({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '4', experienceMax: '7' });
  });
  it('a range that matches a standard band reloads as that band', () => {
    expect(draftFromRow({ experienceMin: 3, experienceMax: 5 }).experienceBand).toBe('3-5');
  });
  it('open-ended and capped', () => {
    expect(draftToData(ready({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '6', experienceMax: '' }))).toMatchObject({ experienceMin: 6, experienceMax: null });
    expect(draftToData(ready({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '99' })).experienceMin).toBe(40);
  });
  it('publish checks', () => {
    expect(fields(ready({ experienceBand: CUSTOM_EXPERIENCE }))).toContain('experienceMin');
    expect(fields(ready({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '2', experienceMax: '6' }))).toEqual([]);
  });
  it('reads naturally in the preview', () => {
    expect(experienceText({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '2', experienceMax: '6' })).toBe('2–6 years');
    expect(experienceText({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '4', experienceMax: '' })).toBe('4+ years');
    expect(experienceText({ experienceBand: CUSTOM_EXPERIENCE, experienceMin: '', experienceMax: '2' })).toBe('Up to 2 years');
    expect(experienceText({ experienceBand: '1-3', experienceMin: '', experienceMax: '' })).toBe('1–3 years');
  });
});

describe('how people apply', () => {
  it('Udyaibase keeps applications internal and drops any link or email', () => {
    expect(draftToData(ready({ applyVia: 'udyaibase', applicationUrl: 'https://x.co', applicationEmail: 'a@b.co' })))
      .toMatchObject({ applicationType: 'INTERNAL', applicationUrl: null, applicationEmail: null });
  });
  it('Google Form needs a Google Form link', () => {
    expect(fields(ready({ applyVia: 'google_form', applicationType: 'EXTERNAL', applicationUrl: 'https://example.com/form' }))).toContain('applicationUrl');
    for (const url of ['https://forms.gle/AbC123', 'https://docs.google.com/forms/d/e/1FAIpQ/viewform']) {
      expect(fields(ready({ applyVia: 'google_form', applicationType: 'EXTERNAL', applicationUrl: url }))).toEqual([]);
    }
    const data = draftToData(ready({ applyVia: 'google_form', applicationUrl: 'https://forms.gle/AbC123', applicationEmail: 'a@b.co' }));
    expect(data).toMatchObject({ applicationType: 'EXTERNAL', applicationUrl: 'https://forms.gle/AbC123', applicationEmail: null });
    expect(draftFromRow({ ...data }).applyVia).toBe('google_form');
  });
  it('email only stores the email', () => {
    expect(fields(ready({ applyVia: 'email', applicationType: 'EXTERNAL' }))).toContain('applicationEmail');
    const data = draftToData(ready({ applyVia: 'email', applicationEmail: 'jobs@acme.ai', applicationUrl: 'https://acme.ai' }));
    expect(data).toMatchObject({ applicationType: 'EXTERNAL', applicationEmail: 'jobs@acme.ai', applicationUrl: null });
    expect(draftFromRow({ ...data }).applyVia).toBe('email');
  });
  it('company website needs an https link; older external jobs load as website', () => {
    expect(fields(ready({ applyVia: 'website', applicationType: 'EXTERNAL', applicationUrl: 'acme.ai/jobs' }))).toContain('applicationUrl');
    expect(draftFromRow({ applicationType: 'EXTERNAL', applicationUrl: 'https://acme.ai/jobs' }).applyVia).toBe('website');
  });
});
