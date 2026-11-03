import sanitizeHtmlLib from 'sanitize-html';

/**
 * Server-side cleanup of article HTML before it is saved. The website sanitizes again when rendering; this keeps
 * stored articles safe to open in the admin editor too (a writer's article is loaded into an editor-in-chief's
 * browser), and drops anything the editor never produces.
 */
const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'u', 's', 'del', 'sub', 'sup',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
    'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    // class: @-tags ("mention") and the per-link underline setting ("link-underline").
    a: ['href', 'target', 'rel', 'class', 'data-mention-type', 'data-mention-id', 'contenteditable'],
    img: ['src', 'alt', 'title', 'width', 'height'],
  },
  allowedClasses: { a: ['mention', 'link-underline'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    h1: 'h2', h5: 'h4', h6: 'h4', div: 'p',
    a: (tagName, attribs) => {
      // Tags keep contenteditable="false" so the editor treats them as one unit; nothing else may set it.
      const { contenteditable, ...rest } = attribs;
      const isMention = /\bmention\b/.test(rest.class ?? '');
      return { tagName, attribs: { ...rest, ...(isMention && contenteditable === 'false' ? { contenteditable } : {}) } };
    },
  },
};

export function cleanArticleHtml(html: string): string {
  return sanitizeHtmlLib(String(html ?? ''), OPTIONS).replace(/<p>(\s|&nbsp;|<br \/>)*<\/p>/g, '').trim();
}
