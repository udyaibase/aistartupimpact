// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { descriptionFromDoc, descriptionToHtml } from '@/lib/jobs/description-format';

/** Load markup into a real (headless) Tiptap editor and save it back, as the form does. */
function roundTrip(markup: string): string {
  const editor = new Editor({ extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })], content: descriptionToHtml(markup) });
  const out = descriptionFromDoc(editor.getJSON() as never);
  editor.destroy();
  return out;
}

describe('job description format', () => {
  it('keeps headings, bullets, numbers, bold and italic unchanged through the editor', () => {
    const md = [
      '## About the role',
      'We are building **retrieval** for *every* team.',
      '## What you’ll do',
      '- Ship the **ranking** service\n- Own evals',
      '### Steps',
      '1. Intro call\n2. Take-home\n3. Onsite',
    ].join('\n\n');
    expect(roundTrip(md)).toBe(md);
  });

  it('older plain-text jobs load as paragraphs and stay readable', () => {
    expect(roundTrip('Line one\nLine two\n\nLine three')).toBe('Line one\n\nLine two\n\nLine three');
    expect(roundTrip('• first\n• second')).toBe('- first\n- second');
    expect(roundTrip('# Big heading')).toBe('## Big heading');
  });

  it('never writes stray markers around spaces', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'Use ' },
      { type: 'text', text: 'bold words ', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'here' },
    ] }] };
    expect(descriptionFromDoc(doc)).toBe('Use **bold words** here');
  });

  it('escapes HTML typed into a description', () => {
    expect(descriptionToHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('drops empty blocks (like an unfilled section bullet)', () => {
    const doc = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Perks' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      { type: 'paragraph' },
    ] };
    expect(descriptionFromDoc(doc)).toBe('## Perks');
  });
});
