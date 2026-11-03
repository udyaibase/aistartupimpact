// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { normalizeLinkUrl, sanitizePastedHtml, textToHtml, toggleLinkUnderline } from '@/lib/editor-html';

describe('article editor: pasting', () => {
  it('Google Docs paste keeps meaning (bold, italic, links, headings) and drops its styling wrappers', () => {
    const gdocs = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><h1 style="font-size:26pt"><span style="font-family:Arial;font-weight:400">Funding news</span></h1><p dir="ltr" style="line-height:1.38"><span style="font-size:11pt;font-family:Arial;font-weight:700">NeuralPay</span><span style="font-size:11pt;font-style:italic"> raised </span><a href="https://neuralpay.in" style="text-decoration:none"><span style="color:#1155cc;text-decoration:underline">₹50 crore</span></a></p></b>`;
    const out = sanitizePastedHtml(gdocs);
    expect(out).toBe('<h2>Funding news</h2><p><strong>NeuralPay</strong><em> raised </em><a href="https://neuralpay.in" target="_blank" rel="noopener noreferrer">₹50 crore</a></p>');
  });

  it('nothing that blocks selecting or editing text survives a paste', () => {
    const out = sanitizePastedHtml('<div contenteditable="false" style="user-select:none;position:absolute" class="x" id="y" onclick="alert(1)">Hello <script>alert(1)</script><span style="user-select:none">world</span></div>');
    expect(out).toBe('<p>Hello world</p>');
    expect(out).not.toMatch(/style|contenteditable|onclick|class|script/);
  });

  it('unsafe links are turned into plain text', () => {
    expect(sanitizePastedHtml('<p><a href="javascript:alert(1)">click</a></p>')).toBe('<p>click</p>');
  });

  it('plain text becomes paragraphs and line breaks', () => {
    expect(textToHtml('Line one\nline two\n\nNew <paragraph>')).toBe('<p>Line one<br>line two</p><p>New &lt;paragraph&gt;</p>');
  });
});

describe('article editor: links', () => {
  it('links have no underline unless the editor turns it on', () => {
    expect(sanitizePastedHtml('<p><a href="https://a.in"><u>Accel</u></a> and <u>this</u></p>'))
      .toBe('<p><a href="https://a.in" target="_blank" rel="noopener noreferrer">Accel</a> and <u>this</u></p>');
    const p = document.createElement('p');
    p.innerHTML = '<a href="https://a.in"><u>Accel</u></a>';
    const a = p.querySelector('a')!;
    expect(toggleLinkUnderline(a)).toBe(true);
    expect(p.innerHTML).toBe('<a href="https://a.in" class="link-underline">Accel</a>');
    expect(toggleLinkUnderline(a)).toBe(false);
    expect(p.innerHTML).toBe('<a href="https://a.in">Accel</a>');
  });

  it('adds https:// to bare addresses and refuses unsafe ones', () => {
    expect(normalizeLinkUrl('neuralpay.in')).toBe('https://neuralpay.in');
    expect(normalizeLinkUrl(' neuralpay.in/careers?x=1 ')).toBe('https://neuralpay.in/careers?x=1');
    expect(normalizeLinkUrl('https://udyaibase.com/startups/x')).toBe('https://udyaibase.com/startups/x');
    expect(normalizeLinkUrl('/startups/neuralpay')).toBe('/startups/neuralpay');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('not a link')).toBeNull();
  });
});

describe('article editor: @-tags', () => {
  it('tags link to the public directory page', async () => {
    const { mentionHref } = await import('@/components/useEditorMentions');
    expect(mentionHref({ type: 'startup', slug: 'sarvam-ai' })).toBe('/startups/sarvam-ai');
    expect(mentionHref({ type: 'tool', slug: 'chatgpt' })).toBe('/tools/chatgpt');
  });
});
