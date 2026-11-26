'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Rows3, Rows4, Search, X } from 'lucide-react';
import { Pagination } from '@/components/Pagination';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  applyView, EMPTY_VIEW, isDefaultView, nextSort, pageOf, parseSavedViews, withSavedView,
  type SavedView, type SortValue, type TableView,
} from '@/lib/table';

/**
 * The one table for admin lists: search, filters, sortable columns, paging, row selection with bulk actions,
 * comfortable or compact rows, and saved views. A screen describes its columns and gets the rest.
 *
 * Works on the rows it is given (search and sort happen in the page). For lists too long to load at once, filter
 * on the server and pass the result. Row density and saved views are remembered in this browser, per table.
 */
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => SortValue;
  /** Text this column contributes to search. */
  searchValue?: (row: T) => string;
  align?: 'left' | 'right';
  /** Tailwind width class, e.g. "w-40". */
  width?: string;
}

export interface TableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  matches: (row: T, value: string) => boolean;
}

export interface BulkAction<T> {
  label: string;
  run: (rows: T[]) => void | Promise<void>;
  /** Shown in red and confirmed first. */
  danger?: boolean;
  /** Question asked before running, e.g. (n) => `Delete ${n} milestones?` */
  confirm?: (count: number) => string;
  /** Hide the action for a selection it doesn't apply to. */
  available?: (rows: T[]) => boolean;
}

interface DataTableProps<T> {
  /** Unique per table: names the saved views and density in this browser. */
  tableId: string;
  /** What the rows are, for screen readers and counts: "milestones". */
  noun: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  filters?: TableFilter<T>[];
  bulkActions?: BulkAction<T>[];
  searchPlaceholder?: string;
  pageSize?: number;
  loading?: boolean;
  /** Shown when there are no rows at all (not when a search finds nothing). */
  empty: { title: string; description?: string };
  /**
   * For lists too long to load at once. `rows` is then one page that the server already searched, filtered and
   * sorted; the table only asks for a different page or query through `onQuery` and shows `total`.
   * Filters are passed through by key (their `matches` is not used), and a column is sortable when it has a
   * `sortValue` (only its key is sent). Selection and bulk actions cover the rows on screen.
   */
  server?: { total: number; onQuery: (query: ServerQuery) => void };
}

export interface ServerQuery { search: string; filters: Record<string, string>; sortKey: string | null; sortDir: 'asc' | 'desc'; page: number; pageSize: number }

type Density = 'comfortable' | 'compact';
const DENSITY_KEY = 'admin-table-density';

export default function DataTable<T>({
  tableId, noun, rows, rowKey, columns, filters = [], bulkActions = [], searchPlaceholder, pageSize = 25, loading = false, empty, server,
}: DataTableProps<T>) {
  const [view, setView] = useState<TableView>(EMPTY_VIEW);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<Density>('comfortable');
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState<BulkAction<T> | null>(null);
  const [running, setRunning] = useState(false);
  const viewsKey = `admin-table-views:${tableId}`;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DENSITY_KEY) === 'compact') setDensity('compact');
      setSaved(parseSavedViews(window.localStorage.getItem(viewsKey)));
    } catch { /* private window: defaults */ }
  }, [viewsKey]);

  const rules = useMemo(() => ({
    searchText: (row: T) => columns.map((c) => c.searchValue?.(row) ?? '').join(' '),
    filters: Object.fromEntries(filters.map((f) => [f.key, f.matches])),
    sortValues: Object.fromEntries(columns.filter((c) => c.sortValue).map((c) => [c.key, c.sortValue!])),
  }), [columns, filters]);

  const local = useMemo(() => (server ? rows : applyView(rows, view, rules)), [server, rows, view, rules]);
  const shownCount = server ? server.total : local.length;
  const current = server
    ? { rows, page, totalPages: Math.max(1, Math.ceil(server.total / pageSize)) }
    : pageOf(local, page, pageSize);
  const searchable = !!server || columns.some((c) => c.searchValue);

  // Server mode: ask for the page whenever the query changes. Typing waits a moment so each key isn't a request.
  const onQuery = server?.onQuery;
  const lastSearch = useRef(view.search);
  useEffect(() => {
    if (!onQuery) return;
    const typed = lastSearch.current !== view.search;
    lastSearch.current = view.search;
    const timer = setTimeout(() => onQuery({ ...view, page, pageSize }), typed ? 300 : 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onQuery is the caller's; a new function identity must not refetch
  }, [view, page, pageSize]);

  // Selection only ever holds rows that still exist (a row removed by an action drops out).
  const liveKeys = useMemo(() => new Set(rows.map(rowKey)), [rows, rowKey]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(rowKey(r)) && liveKeys.has(rowKey(r))), [rows, selected, rowKey, liveKeys]);
  const pageKeys = current.rows.map(rowKey);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const someOnPage = pageKeys.some((k) => selected.has(k));

  const update = (patch: Partial<TableView>) => { setView((v) => ({ ...v, ...patch })); setPage(1); };
  const toggleRow = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const togglePage = () => setSelected((s) => { const n = new Set(s); for (const k of pageKeys) { if (allOnPage) n.delete(k); else n.add(k); } return n; });

  const setDens = (d: Density) => { setDensity(d); try { window.localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ } };
  const persist = (list: SavedView[]) => { setSaved(list); try { window.localStorage.setItem(viewsKey, JSON.stringify(list)); } catch { /* ignore */ } };
  const saveView = () => { if (!name.trim()) return; persist(withSavedView(saved, name, view)); setName(''); setNaming(false); };

  const runAction = async (action: BulkAction<T>) => {
    setRunning(true);
    try { await action.run(selectedRows); setSelected(new Set()); } finally { setRunning(false); setPending(null); }
  };

  const pad = density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';
  const selectable = bulkActions.length > 0;
  const actions = bulkActions.filter((a) => !a.available || a.available(selectedRows));
  const control = 'h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

  return (
    <div className="space-y-3">
      {/* Search, filters, density, saved views */}
      <div className="flex flex-wrap items-center gap-2">
        {searchable && (
          <label className="relative">
            <span className="sr-only">Search {noun}</span>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={view.search}
              onChange={(e) => update({ search: e.target.value })}
              placeholder={searchPlaceholder ?? `Search ${noun}`}
              className={`${control} w-64 max-w-full pl-9 pr-3 placeholder:text-gray-500`}
            />
          </label>
        )}
        {filters.map((f) => (
          <label key={f.key}>
            <span className="sr-only">{f.label}</span>
            <select value={view.filters[f.key] ?? ''} onChange={(e) => update({ filters: { ...view.filters, [f.key]: e.target.value } })} className={`${control} px-3`}>
              <option value="">{f.label}: all</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        {!isDefaultView(view) && (
          <button type="button" onClick={() => update(EMPTY_VIEW)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-3.5 h-3.5" aria-hidden /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isDefaultView(view) && !naming && (
            <button type="button" onClick={() => setNaming(true)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              <Bookmark className="w-3.5 h-3.5" aria-hidden /> Save view
            </button>
          )}
          {naming && (
            <form onSubmit={(e) => { e.preventDefault(); saveView(); }} className="flex items-center gap-1.5">
              <label><span className="sr-only">Name for this view</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Name this view" className={`${control} w-40 px-3 placeholder:text-gray-500`} />
              </label>
              <button type="submit" disabled={!name.trim()} className="h-9 px-3 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">Save</button>
              <button type="button" onClick={() => { setNaming(false); setName(''); }} aria-label="Cancel" className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
            </form>
          )}
          <div role="group" aria-label="Row height" className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {([['comfortable', Rows3, 'Comfortable rows'], ['compact', Rows4, 'Compact rows']] as const).map(([d, Icon, label]) => (
              <button key={d} type="button" onClick={() => setDens(d)} aria-pressed={density === d} aria-label={label} title={label}
                className={`h-9 w-9 inline-flex items-center justify-center ${density === d ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
                <Icon className="w-4 h-4" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Saved views">
          <span className="text-xs text-gray-600 dark:text-gray-400 mr-1">Saved views</span>
          {saved.map((s) => (
            <span key={s.name} className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 text-sm">
              <button type="button" onClick={() => { setView(s.view); setPage(1); }} className="pl-3 pr-1.5 py-1 rounded-l-full text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">{s.name}</button>
              <button type="button" onClick={() => persist(saved.filter((x) => x.name !== s.name))} aria-label={`Remove saved view ${s.name}`} className="pr-2 pl-1 py-1 rounded-r-full text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-3 h-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {selectable && selectedRows.length > 0 && (
        <div role="region" aria-label="Actions for selected rows" className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 px-3 py-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white mr-1">{selectedRows.length} selected</p>
          {actions.map((a) => (
            <button key={a.label} type="button" disabled={running}
              onClick={() => (a.danger || a.confirm ? setPending(a) : runAction(a))}
              className={`h-8 px-3 rounded-lg text-sm font-medium disabled:opacity-50 ${a.danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto h-8 px-2 text-sm text-gray-700 dark:text-gray-300 hover:underline">Clear selection</button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{noun}{view.sortKey ? `, sorted by ${columns.find((c) => c.key === view.sortKey)?.header} ${view.sortDir === 'asc' ? 'ascending' : 'descending'}` : ''}</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                {selectable && (
                  <th scope="col" className={`${pad} w-10`}>
                    <input type="checkbox" checked={allOnPage} ref={(el) => { if (el) el.indeterminate = !allOnPage && someOnPage; }} onChange={togglePage}
                      aria-label={allOnPage ? 'Deselect every row on this page' : 'Select every row on this page'} className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
                  </th>
                )}
                {columns.map((c) => {
                  const sorted = view.sortKey === c.key ? view.sortDir : null;
                  return (
                    <th key={c.key} scope="col" aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={`${pad} ${c.width ?? ''} font-semibold text-gray-700 dark:text-gray-300 ${c.align === 'right' ? 'text-right' : 'text-left'} whitespace-nowrap`}>
                      {c.sortValue ? (
                        <button type="button" onClick={() => update(nextSort(view, c.key))} className="inline-flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-white">
                          {c.header}
                          {sorted === 'asc' ? <ArrowUp className="w-3.5 h-3.5" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="w-3.5 h-3.5" aria-hidden /> : <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" aria-hidden />}
                        </button>
                      ) : c.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} aria-hidden>
                    {selectable && <td className={pad} />}
                    {columns.map((c) => <td key={c.key} className={pad}><div className="h-4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" style={{ width: `${55 + ((i * 7 + c.key.length * 5) % 40)}%` }} /></td>)}
                  </tr>
                ))
              ) : current.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-14 text-center">
                    {(server ? isDefaultView(view) : rows.length === 0) ? (
                      <>
                        <p className="font-semibold text-gray-900 dark:text-white">{empty.title}</p>
                        {empty.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{empty.description}</p>}
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-gray-900 dark:text-white">No {noun} match</p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Try fewer words or clear the filters.</p>
                        <button type="button" onClick={() => update(EMPTY_VIEW)} className="mt-3 text-sm font-medium text-brand hover:underline">Clear search and filters</button>
                      </>
                    )}
                  </td>
                </tr>
              ) : current.rows.map((row) => {
                const k = rowKey(row);
                const isSelected = selected.has(k);
                return (
                  <tr key={k} className={isSelected ? 'bg-brand/5 dark:bg-brand/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}>
                    {selectable && (
                      <td className={`${pad} w-10`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(k)} aria-label="Select row" className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
                      </td>
                    )}
                    {columns.map((c) => <td key={c.key} className={`${pad} ${c.align === 'right' ? 'text-right' : ''} text-gray-700 dark:text-gray-300`}>{c.cell(row)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(server ? shownCount > 0 : !loading && shownCount > 0) && (
          current.totalPages > 1
            ? <Pagination page={current.page} totalPages={current.totalPages} total={shownCount} pageSize={pageSize} onPageChange={setPage} />
            : <p className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
                {shownCount.toLocaleString('en-IN')} {noun}{!server && shownCount !== rows.length ? ` of ${rows.length.toLocaleString('en-IN')}` : ''}
              </p>
        )}
      </div>

      <ConfirmModal
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && runAction(pending)}
        title={pending?.label ?? ''}
        message={pending?.confirm?.(selectedRows.length) ?? `${pending?.label} for ${selectedRows.length} selected ${noun}?`}
        confirmLabel={pending?.label}
        variant={pending?.danger ? 'danger' : 'warning'}
        loading={running}
      />
    </div>
  );
}
