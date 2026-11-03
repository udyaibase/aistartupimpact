import { describe, it, expect, vi, beforeEach } from 'vitest';
const sql = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ sql }));
import { cityList, COUNTRIES, inferCityCountry, matchCity, normalizeCountry, searchCityList, splitLegacyLocation } from '@udyaibase/utils/src/locations';
import { CITY_DATABASE } from '@udyaibase/utils/src/cities';
import { checkLocation } from '@/lib/locations';
import { standardJobLocation } from '@/lib/jobs/location';

describe('standard countries', () => {
  it('is the full list with India first and standard names', () => {
    expect(COUNTRIES[0]).toBe('India');
    expect(COUNTRIES.length).toBeGreaterThan(240);
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
    expect(COUNTRIES).toEqual(expect.arrayContaining(['United States', 'United Kingdom', 'United Arab Emirates', 'Singapore']));
  });

  it('maps everyday spellings to the standard name and refuses non-countries', () => {
    expect(['USA', 'us', 'United States of America', ' america '].map(normalizeCountry)).toEqual(Array(4).fill('United States'));
    expect(['UK', 'England', 'Great Britain'].map(normalizeCountry)).toEqual(Array(3).fill('United Kingdom'));
    expect(normalizeCountry('UAE')).toBe('United Arab Emirates');
    expect(normalizeCountry('india')).toBe('India');
    expect(normalizeCountry('Bengaluru')).toBeNull();
    expect(normalizeCountry('')).toBeNull();
    expect(normalizeCountry('__proto__')).toBeNull();
    expect(normalizeCountry('constructor')).toBeNull();
  });

  it('every country in the city list is a standard country', () => {
    for (const c of new Set(CITY_DATABASE.map((e) => e.country))) expect(normalizeCountry(c), c).not.toBeNull();
  });
});

describe('standard cities', () => {
  const list = cityList([{ city: 'Kozhikode Tech Park', state: 'Kerala', country: 'India', aliases: ['ktp'] }]);

  it('cleans messy saved values to the listed city, and refuses unknown places', () => {
    expect(matchCity(list, 'Bengaluru, KA, India')?.city).toBe('Bengaluru');
    expect(matchCity(list, ' Bangalore')?.city).toBe('Bengaluru');
    expect(matchCity(list, 'Gurgaon')?.city).toBe('Gurugram');
    expect(matchCity(list, 'Benguluru')?.city).toBe('Bengaluru');
    expect(matchCity(list, 'Cupertino, USA')).toMatchObject({ city: 'Cupertino', country: 'United States' });
    expect(matchCity(list, 'Tallinn')?.country).toBe('Estonia');
    expect(matchCity(list, 'Wan Chai')).toMatchObject({ city: 'Hong Kong', country: 'Hong Kong' });
    expect(matchCity(list, 'Delhi-NCR')?.city).toBe('Delhi');
    expect(matchCity(list, 'Bengaluru, Karnataka, India; India; India')?.city).toBe('Bengaluru');
    expect(matchCity(list, 'Mumbai (On-site/Hybrid)')?.city).toBe('Mumbai');
    expect(matchCity(list, 'San Francisco')?.country).toBe('United States');
    expect(matchCity(list, 'Atlantis')).toBeNull();
  });

  it('only matches inside the chosen country', () => {
    expect(matchCity(list, 'San Francisco', 'India')).toBeNull();
    expect(matchCity(list, 'San Francisco', 'United States')?.city).toBe('San Francisco');
  });

  it('includes cities added by admins, and search ranks exact and alias matches first', () => {
    expect(matchCity(list, 'ktp')?.city).toBe('Kozhikode Tech Park');
    expect(searchCityList(list, 'bang', 'India')[0].city).toBe('Bengaluru');
    expect(searchCityList(list, '', 'United Kingdom').every((c) => c.country === 'United Kingdom')).toBe(true);
  });
});

describe('cities added on the Cities page (no country column)', () => {
  it('works out the country from the shared list, the state or the coordinates', () => {
    expect(inferCityCountry({ city: 'San Francisco', state: 'California' })).toBe('United States');
    expect(inferCityCountry({ city: 'Casper', state: 'Wyoming' })).toBe('United States');
    expect(inferCityCountry({ city: 'Edinburgh', state: 'Scotland' })).toBe('United Kingdom');
    expect(inferCityCountry({ city: 'Hosur', state: 'Tamil Nadu' })).toBe('India');
    expect(inferCityCountry({ city: 'Somewhere', lat: 19.1, lng: 72.9 })).toBe('India');
    expect(inferCityCountry({ city: 'Nowhere', lat: 60, lng: 10 })).toBeNull();
  });

  it('never turns a foreign city Indian, and keeps the proper spelling', () => {
    const list = cityList([{ city: 'San Francisco', state: 'California', lat: 37.8, lng: -122.4 }, { city: 'sunnyvale', state: 'California' }]);
    expect(list.filter((c) => c.city === 'San Francisco').map((c) => c.country)).toEqual(['United States']);
    expect(list.find((c) => c.city.toLowerCase() === 'sunnyvale')?.city).toBe('Sunnyvale');
  });

  it('moves "Remote" and country names out of the city field', () => {
    expect(splitLegacyLocation('Remote, India', '')).toEqual({ city: '', country: 'India' });
    expect(splitLegacyLocation('Remote', 'India')).toEqual({ city: '', country: 'India' });
    expect(splitLegacyLocation('United Kingdom', '')).toEqual({ city: '', country: 'United Kingdom' });
    expect(splitLegacyLocation('Pune', 'India')).toEqual({ city: 'Pune', country: 'India' });
  });
});

describe('server checks', () => {
  beforeEach(() => { sql.mockReset(); sql.mockResolvedValue([]); });

  it('returns standard spellings, or the field to fix', async () => {
    expect(await checkLocation({ city: 'bangalore', country: 'india' })).toEqual({ ok: true, city: 'Bengaluru', state: 'Karnataka', country: 'India' });
    expect(await checkLocation({ city: 'London', country: 'UK' })).toMatchObject({ ok: true, city: 'London', country: 'United Kingdom' });
    expect(await checkLocation({ city: 'Mars Base', country: 'India' })).toMatchObject({ ok: false, field: 'city' });
    expect(await checkLocation({ city: 'Pune', country: 'Narnia' })).toMatchObject({ ok: false, field: 'country' });
    expect(await checkLocation({ city: '', country: '' }, { countryRequired: true })).toMatchObject({ ok: false, field: 'country' });
  });

  it('job location: label rebuilt from the clean values', async () => {
    const r = await standardJobLocation({ workType: 'HYBRID', city: 'Bengaluru, KA, India', country: 'India' });
    expect(r).toMatchObject({ ok: true, data: { city: 'Bengaluru', country: 'India', location: 'Bengaluru, India' } });
    const remote = await standardJobLocation({ workType: 'REMOTE', city: null, country: 'USA' });
    expect(remote).toMatchObject({ ok: true, data: { country: 'United States', location: 'Remote · United States' } });
  });
});
