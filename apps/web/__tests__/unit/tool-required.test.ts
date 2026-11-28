import { describe, it, expect } from 'vitest';
import { toolProblems, toolRequiredError, toolEditError, toolMissingList, isLinkedinUrl } from '@udyaibase/utils/tool-required';

const NOW = new Date('2026-11-27T00:00:00Z');
const complete = {
  logoUrl: 'https://media.udyaibase.com/l.png', description: 'What it does.', linkedinUrl: 'https://www.linkedin.com/company/acme',
  features: ['Fast'], useCases: ['Support teams'], launchYear: 2023, headquartersCountry: 'India',
};

describe('what a tool listing must have', () => {
  it('a complete listing has no problems', () => {
    expect(toolProblems(complete, NOW)).toEqual([]);
    expect(toolRequiredError(complete, NOW)).toBeNull();
  });
  it('names every missing detail', () => {
    const fields = toolProblems({}, NOW).map((p) => p.field);
    expect(fields).toEqual(['logoUrl', 'description', 'linkedinUrl', 'features', 'useCases', 'launchYear', 'headquartersCountry']);
    expect(toolRequiredError({}, NOW)).toMatch(/^7 details are missing/);
  });
  it('blank lines and spaces do not count as features or use cases', () => {
    expect(toolProblems({ ...complete, features: ['  ', ''], useCases: [] }, NOW).map((p) => p.field)).toEqual(['features', 'useCases']);
  });
  it('the LinkedIn link must really be LinkedIn', () => {
    expect(isLinkedinUrl('https://linkedin.com/company/acme')).toBe(true);
    expect(isLinkedinUrl('https://in.linkedin.com/company/acme')).toBe(true);
    expect(isLinkedinUrl('http://linkedin.com/company/acme')).toBe(false);
    expect(isLinkedinUrl('https://linkedin.com.evil.example/acme')).toBe(false);
    expect(isLinkedinUrl('https://notlinkedin.com/acme')).toBe(false);
    expect(isLinkedinUrl('https://linkedin.com/')).toBe(false);
    expect(toolRequiredError({ ...complete, linkedinUrl: 'https://x.com/acme' }, NOW)).toMatch(/linkedin\.com address/);
  });
  it('the launch year is a real year, not in the future', () => {
    expect(toolRequiredError({ ...complete, launchYear: 2027 }, NOW)).toMatch(/between 1950 and 2026/);
    expect(toolRequiredError({ ...complete, launchYear: 1800 }, NOW)).toMatch(/between 1950 and 2026/);
    expect(toolRequiredError({ ...complete, launchYear: null }, NOW)).toBe('Add the launch year.');
    expect(toolRequiredError({ ...complete, launchYear: '2020' }, NOW)).toBeNull();
  });
  it('an old tool can be edited with details that were already missing, but cannot lose one it has', () => {
    const old = { ...complete, linkedinUrl: null, features: [], logoUrl: '' };
    expect(toolEditError({ ...old, description: 'Fixed a typo.' }, old, NOW)).toBeNull();
    expect(toolEditError({ ...old, description: '' }, old, NOW)).toBe('Add a description.');
    expect(toolEditError({ ...complete, useCases: [] }, complete, NOW)).toBe('Add at least one use case.');
    expect(toolEditError({ ...old, linkedinUrl: 'https://www.linkedin.com/company/acme' }, old, NOW)).toBeNull();
    expect(toolMissingList(old, NOW)).toEqual(['logo', 'LinkedIn page', 'key features']);
  });
});

describe('founder portal: LinkedIn and headquarters on every save', () => {
  it('asks for both, and the LinkedIn link must be real', async () => {
    const { founderMustHaveError } = await import('@udyaibase/utils/tool-required');
    expect(founderMustHaveError({ linkedinUrl: '', headquarters: 'Bengaluru' })).toBe('Add your LinkedIn page.');
    expect(founderMustHaveError({ linkedinUrl: 'https://x.com/acme', headquarters: 'Bengaluru' })).toMatch(/linkedin\.com address/);
    expect(founderMustHaveError({ linkedinUrl: 'https://www.linkedin.com/company/acme', headquarters: ' ' })).toBe('Choose your headquarters.');
    expect(founderMustHaveError({ linkedinUrl: 'https://www.linkedin.com/company/acme', headquarters: 'Bengaluru' })).toBeNull();
  });
});
