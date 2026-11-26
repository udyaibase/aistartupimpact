import { describe, expect, it } from 'vitest';
import { cleanArticleHtml } from '@/lib/article-html';

describe('article picture captions and alt text', () => {
  it('keeps a real caption and the alt text', () => {
    const html = '<figure><img src="https://media.udyaibase.com/a.jpg" alt="Team at the office"><figcaption>Photo: Company handout</figcaption></figure>';
    const out = cleanArticleHtml(html);
    expect(out).toContain('alt="Team at the office"');
    expect(out).toContain('<figcaption>Photo: Company handout</figcaption>');
  });

  it('drops a caption left empty or as the editor placeholder', () => {
    for (const caption of ['', 'Add a caption…', 'Add a caption...', ' <br> ', '&nbsp;']) {
      const out = cleanArticleHtml(`<figure><img src="https://media.udyaibase.com/a.jpg" alt=""><figcaption>${caption}</figcaption></figure>`);
      expect(out, caption).not.toContain('figcaption');
      expect(out, caption).toContain('<img');
    }
  });

  it('does not touch a caption that merely starts with the placeholder words', () => {
    const out = cleanArticleHtml('<figure><img src="https://media.udyaibase.com/a.jpg" alt=""><figcaption>Add a caption… to every chart, says the style guide</figcaption></figure>');
    expect(out).toContain('figcaption');
  });
});
