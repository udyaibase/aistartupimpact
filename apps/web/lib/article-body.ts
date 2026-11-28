import { articleHtml } from '@udyaibase/utils/article-content';
import { sanitizeHtml } from '@/lib/sanitize';
import { isSponsoredArticle } from '@/lib/seo';

const OUR_HOST = /^https?:\/\/([a-z0-9-]+\.)*udyaibase\.com(?=[/:?#]|$)/i;

/**
 * Links in a paid article must tell search engines they are paid (Google's rule for sponsored content): every
 * link that leaves our site gets rel="sponsored nofollow noopener". Links to our own pages are left alone.
 * Runs on sanitized HTML, where attributes are always double-quoted.
 */
export function markSponsoredLinks(html: string): string {
  return html.replace(/<a\s([^>]*)>/gi, (tag, attrs: string) => {
    const href = /(?:^|\s)href="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    if (!/^https?:\/\//i.test(href) || OUR_HOST.test(href)) return tag;
    const rest = attrs.replace(/(^|\s)rel="[^"]*"/i, '$1').replace(/\s+/g, ' ').trim();
    return `<a ${rest} rel="sponsored nofollow noopener">`;
  });
}

/** An article's body, safe to render: any stored format (including older ones), falling back to its summary. */
export function articleBodyHtml(article: { content?: unknown; excerpt?: string | null; type?: string | null; isSponsored?: boolean | null }): string {
  const html = sanitizeHtml(articleHtml(article.content) || article.excerpt || '');
  return isSponsoredArticle(article) ? markSponsoredLinks(html) : html;
}
