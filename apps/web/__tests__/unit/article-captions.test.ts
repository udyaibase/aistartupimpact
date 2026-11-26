import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '@/lib/sanitize';

describe('article picture captions on the website', () => {
  it('shows a real caption and keeps alt text', () => {
    const out = sanitizeHtml('<figure><img src="https://media.udyaibase.com/a.jpg" alt="Team at the office"><figcaption>Photo: Company handout</figcaption></figure>');
    expect(out).toContain('alt="Team at the office"');
    expect(out).toContain('<figcaption>Photo: Company handout</figcaption>');
  });

  it('never shows the editor placeholder or an empty caption', () => {
    for (const caption of ['', 'Add a caption…', 'Add a caption...', '<br>']) {
      const out = sanitizeHtml(`<figure><img src="https://media.udyaibase.com/a.jpg" alt=""><figcaption>${caption}</figcaption></figure>`);
      expect(out, caption).not.toContain('figcaption');
    }
  });
});
