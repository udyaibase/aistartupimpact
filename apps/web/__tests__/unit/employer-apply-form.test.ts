import { describe, it, expect } from 'vitest';
import { parseApplyFormConfig, requiredFieldErrors, withoutHiddenFields, DEFAULT_SUBMIT_LABEL } from '@/lib/jobs/apply-form';
import { cleanOptions, publicQuestions } from '@/lib/jobs/composer';

describe('application form settings', () => {
  it('defaults to today’s form when nothing is saved', () => {
    const f = parseApplyFormConfig(null);
    expect(f.fields.phone).toBe('optional');
    expect(f.askSkills).toBe(true);
    expect(f.submitLabel).toBe(DEFAULT_SUBMIT_LABEL);
  });

  it('ignores unknown fields and bad modes', () => {
    const f = parseApplyFormConfig({ fields: { phone: 'nope', fullName: 'hidden', city: 'hidden' } }) as any;
    expect(f.fields.phone).toBe('optional');
    expect(f.fields.city).toBe('hidden');
    expect(f.fields.fullName).toBeUndefined();
  });

  it('never stores a field the employer turned off, even if a client sends it', () => {
    const f = parseApplyFormConfig({ fields: { phone: 'hidden' }, askSkills: false });
    const out = withoutHiddenFields(f, { fullName: 'A', phone: '999', city: 'Pune', confirmedSkills: ['x'] }) as any;
    expect(out.phone).toBeUndefined();
    expect(out.confirmedSkills).toBeUndefined();
    expect(out.fullName).toBe('A');
    expect(out.city).toBe('Pune');
  });

  it('requires the fields the employer marked required, on the server too', () => {
    const f = parseApplyFormConfig({ fields: { phone: 'required', city: 'required' } });
    expect(Object.keys(requiredFieldErrors(f, { phone: '  ', city: 'Pune' }))).toEqual(['phone']);
    // Zero is a real answer (immediately available), not a missing one.
    const g = parseApplyFormConfig({ fields: { noticePeriodDays: 'required' } });
    expect(requiredFieldErrors(g, { noticePeriodDays: '0' })).toEqual({});
  });

  it('caps employer wording', () => {
    const f = parseApplyFormConfig({ intro: 'x'.repeat(500), submitLabel: 'y'.repeat(50) });
    expect(f.intro).toHaveLength(300);
    expect(f.submitLabel).toHaveLength(30);
  });
});

describe('multiple-choice questions', () => {
  it('cleans options', () => {
    expect(cleanOptions([' Pune ', 'Pune', '', 7, 'Remote'])).toEqual(['Pune', 'Remote']);
    expect(cleanOptions(Array.from({ length: 20 }, (_, i) => `o${i}`))).toHaveLength(8);
    expect(cleanOptions('nope')).toEqual([]);
  });

  it('shows options to candidates but never the knockout answer', () => {
    const [choice, yesno] = publicQuestions([
      { id: 'a', question: 'City?', type: 'choice', options: ['Pune', 'Delhi'], required: true },
      { id: 'b', question: 'Office?', type: 'yesno', required: true, knockoutAnswer: 'yes' },
    ]);
    expect(choice.options).toEqual(['Pune', 'Delhi']);
    expect(yesno).not.toHaveProperty('knockoutAnswer');
  });
});
