'use client';

import { TYPE_LABEL } from './article-types';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { getArticlesAction, updateArticleStatusAction, deleteArticleAction, duplicateArticleAction } from './actions';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import { ask } from '@/components/Ask';
import { notify } from '@/components/Toast';

interface Article {
  id: string; title: string; slug: string; status: string; type: string; authorId?: string;
  author: string; category: string; publishedAt: string | null; scheduledAt?: string | null; updatedAt?: string; views: number;
}

const fmtDate = (iso?: string | null, time = false) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) })
  : '';

const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', IN_REVIEW: 'In review', SCHEDULED: 'Scheduled', PUBLISHED: 'Published', ARCHIVED: 'Archived' };
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  IN_REVIEW: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  SCHEDULED: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
  PUBLISHED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  ARCHIVED: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};
/** The date that matters for an article's current state, for sorting and display. */
const dateOf = (a: Article) => a.publishedAt || a.scheduledAt || a.updatedAt || null;

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ id: string; canPublish: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const json = await getArticlesAction();
        if (json.success && json.data) {
          setArticles(json.data.map((a: any) => ({
            id: a.id, title: a.title, slug: a.slug, status: a.status, type: a.type, authorId: a.authorId,
            author: a.author?.name || 'Unknown', category: a.category?.name || 'Uncategorized',
            publishedAt: a.publishedAt, scheduledAt: a.scheduledAt, updatedAt: a.updatedAt, views: a.viewCount || 0,
          })));
          setViewer(json.viewer ?? null);
        } else {
          notify(`${json.error || "Couldn't load articles."} If this keeps happening, sign out and back in.`, 'error');
        }
      } catch {
        notify("Couldn't load articles. Check your connection and refresh.", 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const changeStatus = async (a: Article, next: string) => {
    const res = await updateArticleStatusAction(a.id, next);
    if (!res.success) { notify(res.error || "Couldn't change the status. Try again.", 'error'); return; }
    setArticles((list) => list.map((x) => (x.id === a.id ? { ...x, status: next, publishedAt: next === 'PUBLISHED' ? x.publishedAt || new Date().toISOString() : x.publishedAt } : x)));
    notify(`“${a.title}” is now ${STATUS_LABEL[next]?.toLowerCase() ?? next}.`, 'success');
  };

  const remove = async (a: Article) => {
    if (!(await ask({ title: 'Delete article', message: `Delete “${a.title}”? The article and everything attached to it is removed for good.${a.status === 'PUBLISHED' ? ' It is live on the website now.' : ''}`, confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await deleteArticleAction(a.id);
      if (res.success) { setArticles((list) => list.filter((x) => x.id !== a.id)); notify('Article deleted.', 'success'); }
      else notify(res.error || "Couldn't delete the article.", 'error');
    } catch {
      notify("Couldn't delete. Check your connection and try again.", 'error');
    }
  };

  const duplicate = async (a: Article) => {
    const res = await duplicateArticleAction(a.id);
    if (res.success && res.data) { setArticles((list) => [res.data as Article, ...list]); notify('Copy created as a draft.', 'success'); }
    else notify((res as { error?: string }).error || "Couldn't duplicate the article. Try again.", 'error');
  };

  /** The one next step this person may take for an article, or nothing. */
  const nextStep = (a: Article): { label: string; to: string } | null => {
    const canPublish = !!viewer?.canPublish;
    if (a.status === 'DRAFT' && (canPublish || a.authorId === viewer?.id)) return { label: 'Send for review', to: 'IN_REVIEW' };
    if (a.status === 'IN_REVIEW' && canPublish) return { label: 'Publish', to: 'PUBLISHED' };
    if (a.status === 'PUBLISHED' && canPublish) return { label: 'Archive', to: 'ARCHIVED' };
    if (a.status === 'ARCHIVED' && canPublish) return { label: 'Back to draft', to: 'DRAFT' };
    return null;
  };

  const columns = useMemo<Column<Article>[]>(() => [
    {
      key: 'article', header: 'Article', sortValue: (a) => a.title, searchValue: (a) => `${a.title} ${a.author}`,
      cell: (a) => (
        <div className="min-w-[220px] max-w-md">
          <Link href={`/articles/${a.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline line-clamp-1">{a.title || 'Untitled'}</Link>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{TYPE_LABEL[a.type] ?? a.type} · by {a.author}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', sortValue: (a) => a.status,
      cell: (a) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[a.status] ?? STATUS_STYLE.DRAFT}`}>{STATUS_LABEL[a.status] ?? a.status}</span>,
    },
    { key: 'category', header: 'Category', sortValue: (a) => a.category, cell: (a) => a.category },
    { key: 'views', header: 'Views', align: 'right', sortValue: (a) => a.views, cell: (a) => <span className="tabular-nums">{a.views > 0 ? a.views.toLocaleString('en-IN') : '–'}</span> },
    {
      key: 'date', header: 'Date', sortValue: (a) => (dateOf(a) ? new Date(dateOf(a)!) : null),
      cell: (a) => (
        <span className="text-xs whitespace-nowrap">
          {a.status === 'SCHEDULED' && a.scheduledAt ? `Goes live ${fmtDate(a.scheduledAt, true)}` : a.publishedAt ? `Published ${fmtDate(a.publishedAt)}` : `Edited ${fmtDate(a.updatedAt)}`}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (a) => {
        const step = nextStep(a);
        return (
          <div className="flex items-center justify-end gap-1">
            {step && (
              <button onClick={() => changeStatus(a, step.to)} aria-label={`${step.label}: ${a.title}`}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap">{step.label}</button>
            )}
            <button onClick={() => duplicate(a)} aria-label={`Duplicate ${a.title}`} title="Duplicate as a draft" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><Copy className="w-4 h-4" aria-hidden /></button>
            <button onClick={() => remove(a)} aria-label={`Delete ${a.title}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers; what the viewer may do changes the buttons
  ], [viewer]);

  const filters = useMemo<TableFilter<Article>[]>(() => {
    const count = (pick: (a: Article) => string, v: string) => articles.filter((a) => pick(a) === v).length;
    const unique = (pick: (a: Article) => string) => [...new Set(articles.map(pick).filter(Boolean))].sort();
    return [
      { key: 'status', label: 'Status', options: Object.keys(STATUS_LABEL).map((v) => ({ value: v, label: `${STATUS_LABEL[v]} (${count((a) => a.status, v)})` })), matches: (a, v) => a.status === v },
      { key: 'type', label: 'Type', options: unique((a) => a.type).map((v) => ({ value: v, label: `${TYPE_LABEL[v] ?? v} (${count((a) => a.type, v)})` })), matches: (a, v) => a.type === v },
      { key: 'category', label: 'Category', options: unique((a) => a.category).map((v) => ({ value: v, label: v })), matches: (a, v) => a.category === v },
      { key: 'author', label: 'Author', options: unique((a) => a.author).map((v) => ({ value: v, label: v })), matches: (a, v) => a.author === v },
    ];
  }, [articles]);

  const inReview = articles.filter((a) => a.status === 'IN_REVIEW').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Articles</h1>
          <p className="portal-subtitle">
            {articles.length.toLocaleString('en-IN')} articles across news, stories, opinion and guides{inReview > 0 ? `; ${inReview} waiting for review` : ''}.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {viewer?.canPublish && <Link href="/articles/categories" className="btn-outline text-sm">Categories</Link>}
          <Link href="/articles/new" className="btn-brand text-sm gap-2"><Plus className="w-4 h-4" aria-hidden /> New article</Link>
        </div>
      </div>

      <DataTable
        tableId="articles"
        noun="articles"
        rows={articles}
        rowKey={(a) => a.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search title or author"
        empty={{ title: 'No articles yet', description: 'Write the first one with New article.' }}
      />
    </div>
  );
}
