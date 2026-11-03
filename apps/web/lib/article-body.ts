import { articleHtml } from '@udyaibase/utils/article-content';
import { sanitizeHtml } from '@/lib/sanitize';

/** An article's body, safe to render: any stored format (including older ones), falling back to its summary. */
export function articleBodyHtml(article: { content?: unknown; excerpt?: string | null }): string {
  return sanitizeHtml(articleHtml(article.content) || article.excerpt || '');
}
