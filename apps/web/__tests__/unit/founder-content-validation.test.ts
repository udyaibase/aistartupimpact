import { describe, it, expect } from 'vitest';
import {
  checkContentFields, checkMilestoneAmount, checkMilestoneCurrency, checkMilestoneDate, coverImageProblem, CONTENT_BODY_MAX,
} from '@/lib/founder/content-validation';

describe('update and story fields', () => {
  it('create needs a title of 3 to 200 characters', () => {
    expect(checkContentFields({}, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: 'ab' }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: '   ab   ' }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: 'x'.repeat(201) }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: 42 }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: '  We launched  ' }, 'create')).toEqual({ ok: true, data: { title: 'We launched' } });
  });

  it('edit checks only what was sent', () => {
    expect(checkContentFields({}, 'edit')).toEqual({ ok: true, data: {} });
    expect(checkContentFields({ excerpt: 'Short' }, 'edit')).toEqual({ ok: true, data: { excerpt: 'Short' } });
    expect(checkContentFields({ title: 'ab' }, 'edit')).toMatchObject({ ok: false });
  });

  it('content must be text, up to the limit', () => {
    expect(checkContentFields({ title: 'Launch', content: { evil: [1, 2] } }, 'create')).toEqual({ ok: false, error: 'Content must be text' });
    expect(checkContentFields({ title: 'Launch', content: 'y'.repeat(CONTENT_BODY_MAX + 1) }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: 'Launch', content: 'y'.repeat(600_000) }, 'create')).toMatchObject({ ok: false });
    expect(checkContentFields({ title: 'Launch', content: 'y'.repeat(CONTENT_BODY_MAX) }, 'create')).toMatchObject({ ok: true });
  });

  it('summary is capped at 500 characters; empty clears it', () => {
    expect(checkContentFields({ excerpt: 'e'.repeat(501) }, 'edit')).toMatchObject({ ok: false });
    expect(checkContentFields({ excerpt: '' }, 'edit')).toEqual({ ok: true, data: { excerpt: null } });
    expect(checkContentFields({ excerpt: null }, 'edit')).toEqual({ ok: true, data: { excerpt: null } });
  });

  it.each([
    'javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://example.com/a.png', '//example.com/a.png', '/local.png',
    'https://localhost/a.png', 'https://10.0.0.5/a.png', 'https://user:pw@example.com/a.png', 'not a url', 42, {},
  ])('cover image %s is refused', (value) => {
    expect(coverImageProblem(value)).toBeTruthy();
    expect(checkContentFields({ coverImage: value }, 'edit')).toMatchObject({ ok: false });
  });

  it('a full https address is accepted; empty clears the cover', () => {
    expect(coverImageProblem('https://media.udyaibase.com/covers/a.png')).toBeNull();
    expect(checkContentFields({ coverImage: 'https://cdn.example.com/a.png' }, 'edit')).toEqual({ ok: true, data: { coverImage: 'https://cdn.example.com/a.png' } });
    expect(checkContentFields({ coverImage: '' }, 'edit')).toEqual({ ok: true, data: { coverImage: null } });
  });
});

describe('milestone fields', () => {
  const now = new Date('2026-11-20T10:00:00Z');

  it('the date must be real, not before 1990, and at most a year ahead', () => {
    expect(checkMilestoneDate('not-a-date', now)).toEqual({ ok: false, error: 'Enter a valid date' });
    expect(checkMilestoneDate(undefined, now)).toMatchObject({ ok: false });
    expect(checkMilestoneDate({}, now)).toMatchObject({ ok: false });
    expect(checkMilestoneDate('2999-01-01', now)).toMatchObject({ ok: false });
    expect(checkMilestoneDate('1899-01-01', now)).toMatchObject({ ok: false });
    expect(checkMilestoneDate('2027-11-21', now)).toMatchObject({ ok: false });
    expect(checkMilestoneDate('2027-11-19', now)).toMatchObject({ ok: true });
    expect(checkMilestoneDate('2024-03-01', now)).toMatchObject({ ok: true });
  });

  it('the amount is empty or a number from zero up', () => {
    expect(checkMilestoneAmount(null)).toEqual({ ok: true, data: null });
    expect(checkMilestoneAmount('')).toEqual({ ok: true, data: null });
    expect(checkMilestoneAmount('2500000')).toEqual({ ok: true, data: 2500000 });
    expect(checkMilestoneAmount(0)).toEqual({ ok: true, data: 0 });
    expect(checkMilestoneAmount(-5)).toMatchObject({ ok: false });
    expect(checkMilestoneAmount('abc')).toMatchObject({ ok: false });
    expect(checkMilestoneAmount(Infinity)).toMatchObject({ ok: false });
    expect(checkMilestoneAmount(1e16)).toMatchObject({ ok: false });
  });

  it('the currency is one the form offers', () => {
    expect(checkMilestoneCurrency(undefined)).toEqual({ ok: true, data: 'INR' });
    expect(checkMilestoneCurrency('USD')).toEqual({ ok: true, data: 'USD' });
    expect(checkMilestoneCurrency('EUR')).toEqual({ ok: true, data: 'EUR' });
    expect(checkMilestoneCurrency('DOGE')).toMatchObject({ ok: false });
  });
});
