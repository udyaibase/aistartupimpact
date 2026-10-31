import sanitizeHtmlLib from 'sanitize-html';

/**
 * Sanitizes editorial HTML (articles, stories, opinions) from the database before rendering.
 * Strips XSS vectors while preserving safe article markup: images, figures, tables and class names.
 */
export function sanitizeHtml(dirty: string): string {
  return sanitizeHtmlLib(dirty, {
    allowedTags: [
      'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'del',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'a', 'img', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'span', 'div', 'section',
    ],
    allowedAttributes: {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/**
 * Stricter profile for HTML written by outside users (e.g. event hosts' descriptions):
 * text formatting and links only, no images, tables or classes. Links open in a new tab
 * with rel="noopener nofollow ugc".
 */
const USER_HTML_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'del',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'a', 'hr', 'span',
  ],
  allowedAttributes: {
    'a': ['href', 'title'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    'a': sanitizeHtmlLib.simpleTransform('a', {
      rel: 'noopener nofollow ugc',
      target: '_blank',
    }),
  },
};

export function sanitizeUserHtml(dirty: string): string {
  return sanitizeHtmlLib(dirty, USER_HTML_OPTIONS);
}

export function htmlToPlainText(html: string): string {
  return sanitizeHtmlLib(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}
