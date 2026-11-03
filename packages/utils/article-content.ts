/**
 * Article bodies are stored as { html } by the admin editor. Older articles hold an earlier editor's document
 * ({ type: 'doc', content: [...] }) or a plain list of blocks ([{ type: 'paragraph', content: 'text' }]).
 * Shared by the admin editor (to open them) and the website (to show them), so both read every format the same way.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Node = { type?: string; text?: string; content?: unknown; attrs?: { level?: number }; marks?: { type?: string; attrs?: { href?: string } }[] };

function inline(content: unknown): string {
  if (typeof content === 'string') return esc(content);
  if (!Array.isArray(content)) return '';
  return content.map((n: Node) => {
    if (n?.type === 'hardBreak') return '<br>';
    let out = typeof n?.text === 'string' ? esc(n.text) : inline(n?.content);
    for (const m of n?.marks ?? []) {
      if (m.type === 'bold') out = `<strong>${out}</strong>`;
      else if (m.type === 'italic') out = `<em>${out}</em>`;
      else if (m.type === 'underline') out = `<u>${out}</u>`;
      else if (m.type === 'code') out = `<code>${out}</code>`;
      else if (m.type === 'link' && m.attrs?.href) out = `<a href="${esc(m.attrs.href)}">${out}</a>`;
    }
    return out;
  }).join('');
}

function blocks(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.map((n: Node) => {
    switch (n?.type) {
      case 'heading': {
        const level = Math.min(4, Math.max(2, Number(n.attrs?.level) || 2));
        return `<h${level}>${inline(n.content)}</h${level}>`;
      }
      case 'blockquote': return `<blockquote>${blocks(n.content) || inline(n.content)}</blockquote>`;
      case 'bulletList': return `<ul>${blocks(n.content)}</ul>`;
      case 'orderedList': return `<ol>${blocks(n.content)}</ol>`;
      case 'listItem': return `<li>${blocks(n.content) || inline(n.content)}</li>`;
      case 'codeBlock': return `<pre><code>${inline(n.content)}</code></pre>`;
      case 'horizontalRule': return '<hr>';
      default: {
        const body = inline(n?.content);
        return body ? `<p>${body}</p>` : '';
      }
    }
  }).join('');
}

/** Any stored article body → HTML. Not sanitized: callers sanitize before rendering. */
export function articleHtml(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return blocks(content);
  if (typeof content === 'object') {
    const c = content as { html?: unknown; text?: unknown; type?: unknown; content?: unknown };
    if (typeof c.html === 'string') return c.html;
    if (c.type === 'doc') return blocks(c.content);
    if (typeof c.text === 'string') return `<p>${esc(c.text)}</p>`;
  }
  return '';
}

/** Words in an HTML body (for read time). */
export function htmlWordCount(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}
