import { describe, it, expect } from 'vitest';
import { cleanBadgeSettings, proOptionsUsed, DEFAULT_BADGE_SETTINGS } from '@/lib/events/badge-settings';

const own = (u: string) => u.startsWith('https://media.udyaibase.com/');
const proInput = {
  template: 'conference', accent: '#4f46e5', showLogo: false,
  tierColors: { t1: '#dc2626', 'bad id!': '#000000', t2: 'red' },
  fields: { company: false, role: true, tier: true, qr: true },
  questionIds: ['q1', 'q2', 'q3', 'q1'],
  sponsorStrip: true, backgroundUrl: 'https://media.udyaibase.com/covers/a.png', textPosition: 'center', textColor: 'light',
};

describe('badge settings', () => {
  it('falls back to safe defaults for junk', () => {
    expect(cleanBadgeSettings(null, { pro: true, isOwnMedia: own })).toEqual(DEFAULT_BADGE_SETTINGS);
    const s = cleanBadgeSettings({ template: '<script>', accent: 'red;}</style>', textPosition: 'sideways' }, { pro: true, isOwnMedia: own });
    expect(s.template).toBe('classic');
    expect(s.accent).toBe('#FF3131');
    expect(s.textPosition).toBe('top');
  });

  it('Free hosts keep the template, colour and logo choice, and never get Pro options', () => {
    const s = cleanBadgeSettings(proInput, { pro: false, isOwnMedia: own });
    expect(s).toMatchObject({ template: 'conference', accent: '#4F46E5', showLogo: false });
    expect(s.tierColors).toEqual({});
    expect(s.fields).toEqual(DEFAULT_BADGE_SETTINGS.fields);
    expect(s.questionIds).toEqual([]);
    expect(s.sponsorStrip).toBe(false);
    expect(s.backgroundUrl).toBeNull();
    expect(s.textColor).toBe('dark');
  });

  it('Pro hosts get their options, cleaned', () => {
    const s = cleanBadgeSettings(proInput, { pro: true, isOwnMedia: own });
    expect(s.tierColors).toEqual({ t1: '#DC2626' });
    expect(s.fields.company).toBe(false);
    expect(s.questionIds).toEqual(['q1', 'q2']);
    expect(s).toMatchObject({ sponsorStrip: true, backgroundUrl: 'https://media.udyaibase.com/covers/a.png', textPosition: 'center', textColor: 'light' });
  });

  it('background artwork must be our own upload', () => {
    expect(cleanBadgeSettings({ backgroundUrl: 'https://evil.example/x.png' }, { pro: true, isOwnMedia: own }).backgroundUrl).toBeNull();
  });

  it('names the Pro options a request asks for', () => {
    expect(proOptionsUsed({ template: 'bold', accent: '#000000', showLogo: true })).toEqual([]);
    expect(proOptionsUsed(proInput)).toEqual(expect.arrayContaining(['ticket type colours', 'sponsor strip', 'your own background', 'registration answers']));
  });
});
