/**
 * The rules behind every admin table (components/ui/DataTable.tsx): search, filters, sorting and paging.
 * Kept apart from the component so the behaviour is tested without a browser. Works on rows already in the page;
 * a section with more rows than it loads should filter on the server and hand this the result.
 */
export type SortDir = 'asc' | 'desc';
export interface TableView { search: string; filters: Record<string, string>; sortKey: string | null; sortDir: SortDir }
export const EMPTY_VIEW: TableView = { search: '', filters: {}, sortKey: null, sortDir: 'asc' };

export type SortValue = string | number | Date | boolean | null | undefined;

export interface TableRules<T> {
  /** Text a row is searched by (every searchable column, joined). */
  searchText: (row: T) => string;
  /** key → does this row pass when the filter is set to `value`? */
  filters?: Record<string, (row: T, value: string) => boolean>;
  /** key → the value a column sorts by. */
  sortValues?: Record<string, (row: T) => SortValue>;
}

/** Every word typed must appear somewhere in the row (any order, any case). */
export function matchesSearch(text: string, search: string): boolean {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = text.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

function compare(a: SortValue, b: SortValue): number {
  // Blanks always go last, whichever way the column is sorted (handled by the caller for direction).
  const norm = (v: SortValue) => (v instanceof Date ? v.getTime() : typeof v === 'boolean' ? Number(v) : v);
  const x = norm(a), y = norm(b);
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' });
}

const blank = (v: SortValue) => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

export function applyView<T>(rows: readonly T[], view: TableView, rules: TableRules<T>): T[] {
  let out = rows.filter((r) => matchesSearch(rules.searchText(r), view.search));
  for (const [key, value] of Object.entries(view.filters)) {
    const test = rules.filters?.[key];
    if (value && test) out = out.filter((r) => test(r, value));
  }
  const sortBy = view.sortKey ? rules.sortValues?.[view.sortKey] : undefined;
  if (sortBy) {
    const dir = view.sortDir === 'desc' ? -1 : 1;
    // Stable: equal rows keep the order they arrived in.
    out = out
      .map((row, i) => ({ row, i, v: sortBy(row) }))
      .sort((a, b) => {
        const ab = blank(a.v), bb = blank(b.v);
        if (ab || bb) return ab === bb ? a.i - b.i : ab ? 1 : -1;
        return compare(a.v, b.v) * dir || a.i - b.i;
      })
      .map((x) => x.row);
  }
  return out;
}

export function pageOf<T>(rows: readonly T[], page: number, pageSize: number): { rows: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(Math.max(1, page), totalPages);
  return { rows: rows.slice((safe - 1) * pageSize, safe * pageSize), page: safe, totalPages };
}

/** Clicking a column: first ascending, then descending, then back to the original order. */
export function nextSort(view: TableView, key: string): Pick<TableView, 'sortKey' | 'sortDir'> {
  if (view.sortKey !== key) return { sortKey: key, sortDir: 'asc' };
  if (view.sortDir === 'asc') return { sortKey: key, sortDir: 'desc' };
  return { sortKey: null, sortDir: 'asc' };
}

export const isDefaultView = (v: TableView) => !v.search.trim() && !Object.values(v.filters).some(Boolean) && !v.sortKey;

// ── Saved views (this browser) ──────────────────────────────────────────────

export interface SavedView { name: string; view: TableView }
const MAX_SAVED = 12;

/** Reads saved views defensively: anything malformed in storage is dropped rather than trusted. */
export function parseSavedViews(raw: string | null): SavedView[] {
  try {
    const list = JSON.parse(raw ?? '[]');
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && typeof s.name === 'string' && s.name.trim() && s.view && typeof s.view === 'object')
      .slice(0, MAX_SAVED)
      .map((s) => ({
        name: s.name.trim().slice(0, 40),
        view: {
          search: typeof s.view.search === 'string' ? s.view.search.slice(0, 200) : '',
          filters: Object.fromEntries(Object.entries(s.view.filters ?? {}).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, String(v)])),
          sortKey: typeof s.view.sortKey === 'string' ? s.view.sortKey : null,
          sortDir: s.view.sortDir === 'desc' ? 'desc' : 'asc',
        },
      }));
  } catch {
    return [];
  }
}

/** Saving under an existing name replaces it; the newest goes first. */
export function withSavedView(list: SavedView[], name: string, view: TableView): SavedView[] {
  const clean = name.trim().slice(0, 40);
  if (!clean) return list;
  return [{ name: clean, view }, ...list.filter((s) => s.name.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_SAVED);
}
