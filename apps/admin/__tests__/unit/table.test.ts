import { describe, it, expect } from 'vitest';
import { applyView, EMPTY_VIEW, isDefaultView, matchesSearch, nextSort, pageOf, parseSavedViews, withSavedView, type TableRules } from '@/lib/table';
import { toneOf } from '@/components/Toast';

interface Row { name: string; city: string | null; score: number | null; status: 'OPEN' | 'CLOSED'; at: Date }
const rows: Row[] = [
  { name: 'Zeta Labs', city: 'Pune', score: 10, status: 'OPEN', at: new Date('2026-03-01') },
  { name: 'alpha ai', city: null, score: null, status: 'CLOSED', at: new Date('2026-01-01') },
  { name: 'Beta 9', city: 'Bengaluru', score: 2, status: 'OPEN', at: new Date('2026-02-01') },
  { name: 'Beta 10', city: 'Mumbai', score: 30, status: 'CLOSED', at: new Date('2026-04-01') },
];
const rules: TableRules<Row> = {
  searchText: (r) => `${r.name} ${r.city ?? ''}`,
  filters: { status: (r, v) => r.status === v },
  sortValues: { name: (r) => r.name, score: (r) => r.score, at: (r) => r.at, city: (r) => r.city },
};
const names = (list: Row[]) => list.map((r) => r.name);

describe('table rules', () => {
  it('searches every word, in any order and case', () => {
    expect(matchesSearch('Zeta Labs Pune', 'pune ZETA')).toBe(true);
    expect(matchesSearch('Zeta Labs Pune', 'zeta mumbai')).toBe(false);
    expect(names(applyView(rows, { ...EMPTY_VIEW, search: 'beta' }, rules))).toEqual(['Beta 9', 'Beta 10']);
  });

  it('applies filters together with search, and ignores an unset filter', () => {
    expect(names(applyView(rows, { ...EMPTY_VIEW, filters: { status: 'OPEN' } }, rules))).toEqual(['Zeta Labs', 'Beta 9']);
    expect(names(applyView(rows, { ...EMPTY_VIEW, search: 'beta', filters: { status: 'CLOSED' } }, rules))).toEqual(['Beta 10']);
    expect(applyView(rows, { ...EMPTY_VIEW, filters: { status: '' } }, rules)).toHaveLength(4);
  });

  it('sorts names naturally, numbers as numbers and dates as dates', () => {
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'name' }, rules))).toEqual(['alpha ai', 'Beta 9', 'Beta 10', 'Zeta Labs']);
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'score', sortDir: 'desc' }, rules)).slice(0, 3)).toEqual(['Beta 10', 'Zeta Labs', 'Beta 9']);
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'at' }, rules))[0]).toBe('alpha ai');
  });

  it('keeps blanks last whichever way a column is sorted, and leaves the input untouched', () => {
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'score', sortDir: 'asc' }, rules)).at(-1)).toBe('alpha ai');
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'score', sortDir: 'desc' }, rules)).at(-1)).toBe('alpha ai');
    expect(names(applyView(rows, { ...EMPTY_VIEW, sortKey: 'city', sortDir: 'desc' }, rules)).at(-1)).toBe('alpha ai');
    expect(rows[0].name).toBe('Zeta Labs');
  });

  it('cycles a column: ascending, descending, then the original order', () => {
    const a = { ...EMPTY_VIEW, ...nextSort(EMPTY_VIEW, 'name') };
    expect(a).toMatchObject({ sortKey: 'name', sortDir: 'asc' });
    const b = { ...a, ...nextSort(a, 'name') };
    expect(b.sortDir).toBe('desc');
    expect(nextSort(b, 'name').sortKey).toBeNull();
    expect(nextSort(b, 'score')).toEqual({ sortKey: 'score', sortDir: 'asc' });
  });

  it('pages safely when the page asked for no longer exists', () => {
    expect(pageOf(rows, 1, 3).rows).toHaveLength(3);
    expect(pageOf(rows, 2, 3)).toMatchObject({ page: 2, totalPages: 2 });
    expect(pageOf(rows, 9, 3).page).toBe(2); // a filter shrank the list
    expect(pageOf([], 1, 25)).toEqual({ rows: [], page: 1, totalPages: 1 });
  });

  it('knows when nothing is filtered or sorted', () => {
    expect(isDefaultView(EMPTY_VIEW)).toBe(true);
    expect(isDefaultView({ ...EMPTY_VIEW, search: ' ' })).toBe(true);
    expect(isDefaultView({ ...EMPTY_VIEW, filters: { status: 'OPEN' } })).toBe(false);
  });
});

describe('saved views', () => {
  it('replaces a view saved under the same name and keeps the newest first', () => {
    let list = withSavedView([], 'Open only', { ...EMPTY_VIEW, filters: { status: 'OPEN' } });
    list = withSavedView(list, 'By score', { ...EMPTY_VIEW, sortKey: 'score' });
    list = withSavedView(list, 'open only', { ...EMPTY_VIEW, search: 'beta' });
    expect(list.map((s) => s.name)).toEqual(['open only', 'By score']);
    expect(withSavedView(list, '   ', EMPTY_VIEW)).toBe(list);
  });

  it('drops anything malformed read back from the browser', () => {
    expect(parseSavedViews('not json')).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
    const ok = parseSavedViews(JSON.stringify([{ name: 'A', view: { search: 'x', filters: { s: 'OPEN', bad: 3 }, sortKey: 4, sortDir: 'sideways' } }, { name: '', view: {} }, null]));
    expect(ok).toEqual([{ name: 'A', view: { search: 'x', filters: { s: 'OPEN' }, sortKey: null, sortDir: 'asc' } }]);
  });
});

describe('message tone (what used to be alert pop-ups)', () => {
  it.each([
    ['Testimonial updated!', 'success'],
    ['Startup approved successfully!', 'success'],
    ['Failed to delete testimonial', 'error'],
    ['Error: Failed to create startup', 'error'],
    ["Couldn't update the job.", 'error'],
    ['Tool not found', 'error'],
    ['Name and tagline are required', 'warning'],
    ['Please fill in all required fields', 'warning'],
    ['Maximum 6 screenshots allowed', 'warning'],
    ['Tool saved but some data failed:\nFAQ', 'warning'],
    ['3 tags imported', 'info'],
  ])('%s → %s', (message, tone) => expect(toneOf(message)).toBe(tone));
});
