// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import DataTable, { type BulkAction, type Column } from '@/components/ui/DataTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row { id: string; name: string; score: number }
const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i + 1}`, name: `Item ${String(i + 1).padStart(2, '0')}`, score: (i * 7) % 30 }));
const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name, searchValue: (r) => r.name },
  { key: 'score', header: 'Score', cell: (r) => String(r.score), sortValue: (r) => r.score, align: 'right' },
];

let el: HTMLDivElement;
function mount(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  el = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(el);
  act(() => { createRoot(el).render(<DataTable<Row> tableId="t" noun="items" rows={rows} rowKey={(r) => r.id} columns={columns} empty={{ title: 'No items yet' }} {...props} />); });
}
const bodyRows = () => [...el.querySelectorAll('tbody tr')];
const firstCells = () => bodyRows().map((tr) => tr.querySelector('td:not(.w-10)')?.textContent ?? tr.textContent);
const button = (name: string) => [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name) as HTMLButtonElement;
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('DataTable', () => {
  beforeEach(() => window.localStorage.clear());

  it('pages the rows, 25 at a time', () => {
    mount();
    expect(bodyRows()).toHaveLength(25);
    act(() => { button('Next page').click(); });
    expect(bodyRows()).toHaveLength(5);
  });

  it('searches as you type and says so when nothing matches', () => {
    mount();
    type(el.querySelector('input[type="search"]') as HTMLInputElement, 'item 07');
    expect(firstCells()).toEqual(['Item 07']);
    type(el.querySelector('input[type="search"]') as HTMLInputElement, 'zzz');
    expect(el.textContent).toContain('No items match');
    act(() => { button('Clear search and filters').click(); });
    expect(bodyRows()).toHaveLength(25);
  });

  it('sorts a column and tells screen readers the direction', () => {
    mount();
    const header = [...el.querySelectorAll('th')].find((th) => th.textContent?.trim() === 'Score')!;
    act(() => { header.querySelector('button')!.click(); });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    act(() => { header.querySelector('button')!.click(); });
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(bodyRows()[0].textContent).toContain('29');
  });

  it('runs a bulk action on the selected rows, asking first when it is destructive', async () => {
    const verify = vi.fn();
    const remove = vi.fn();
    const bulk: BulkAction<Row>[] = [{ label: 'Verify', run: verify }, { label: 'Delete', danger: true, run: remove, confirm: (n) => `Delete ${n} items?` }];
    mount({ bulkActions: bulk });
    const boxes = () => [...el.querySelectorAll('tbody input[type="checkbox"]')] as HTMLInputElement[];
    act(() => { boxes()[0].click(); boxes()[2].click(); });
    expect(el.textContent).toContain('2 selected');

    act(() => { button('Delete').click(); });
    expect(remove).not.toHaveBeenCalled(); // waits for the confirmation
    expect(document.body.textContent).toContain('Delete 2 items?');

    await act(async () => { button('Verify').click(); });
    expect(verify).toHaveBeenCalledWith([rows[0], rows[2]]);
    expect(el.textContent).not.toContain('2 selected'); // selection clears after the action
  });

  it('remembers compact rows and a saved view in this browser', () => {
    mount();
    act(() => { button('Compact rows').click(); });
    expect(window.localStorage.getItem('admin-table-density')).toBe('compact');

    type(el.querySelector('input[type="search"]') as HTMLInputElement, 'item 1');
    act(() => { button('Save view').click(); });
    type(el.querySelector('input[placeholder="Name this view"]') as HTMLInputElement, 'Tens');
    act(() => { button('Save').click(); });
    expect(JSON.parse(window.localStorage.getItem('admin-table-views:t')!)[0]).toMatchObject({ name: 'Tens', view: { search: 'item 1' } });

    act(() => { button('Clear').click(); });
    expect(bodyRows()).toHaveLength(25);
    act(() => { button('Tens').click(); });
    // Both words must appear: "Item" and "1" → 01, 10–19 and 21.
    expect(bodyRows()).toHaveLength(12);
  });

  it('shows the empty message when there is nothing at all', () => {
    mount({ rows: [] });
    expect(el.textContent).toContain('No items yet');
  });

  describe('server-paged mode', () => {
    it('shows the page it was given, asks for other pages, and never filters the rows itself', () => {
      vi.useFakeTimers();
      const onQuery = vi.fn();
      const pageOne = rows.slice(0, 10);
      mount({ rows: pageOne, pageSize: 10, server: { total: 95, onQuery } });
      act(() => { vi.runAllTimers(); });

      // First request: page 1, nothing typed.
      expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 10, search: '' }));
      expect(bodyRows()).toHaveLength(10);
      expect(el.textContent).toContain('95'); // the server's total, not the 10 on screen

      act(() => { button('Next page').click(); });
      act(() => { vi.runAllTimers(); });
      expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

      // Typing sends the words to the server (after a pause) and goes back to page 1; rows on screen are untouched.
      const calls = onQuery.mock.calls.length;
      type(el.querySelector('input[type="search"]') as HTMLInputElement, 'zzz no match');
      expect(onQuery.mock.calls.length).toBe(calls); // not yet: waits for typing to stop
      act(() => { vi.advanceTimersByTime(350); });
      expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz no match', page: 1 }));
      expect(bodyRows()).toHaveLength(10);
      vi.useRealTimers();
    });

    it('says nothing matches when the server returns no rows for a search', () => {
      vi.useFakeTimers();
      const onQuery = vi.fn();
      mount({ rows: [], server: { total: 0, onQuery } });
      type(el.querySelector('input[type="search"]') as HTMLInputElement, 'nobody');
      act(() => { vi.advanceTimersByTime(350); });
      expect(el.textContent).toContain('No items match');
      vi.useRealTimers();
    });
  });
});
