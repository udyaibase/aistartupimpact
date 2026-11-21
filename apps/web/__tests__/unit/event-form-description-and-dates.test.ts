import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { descriptionForEditor, keepLineBreaks, looksLikeMarkdown, markdownToHtml } from '@/lib/markdown-lite';
import { addMinutes, durationLabel, formatDateLabel, formatTimeLabel, parseDate, parseTimeInput } from '@/components/ui/DateTimeFields';

const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('a description pasted from ChatGPT or Claude (Markdown)', () => {
  it('headings, bold, italic, links and lists become formatting, not symbols', () => {
    const html = markdownToHtml('# AI Builders Meetup\n\nJoin us for **hands-on** building and *fun*.\n\n## Learn\n\n- Prompt design\n- RAG\n\n### Agenda\n\n1. Welcome\n2. Talks\n\nSee [our site](https://example.com).');
    expect(html).toBe('<h2>AI Builders Meetup</h2><p>Join us for <strong>hands-on</strong> building and <em>fun</em>.</p><h2>Learn</h2><ul><li><p>Prompt design</p></li><li><p>RAG</p></li></ul><h3>Agenda</h3><ol><li><p>Welcome</p></li><li><p>Talks</p></li></ol><p>See <a href="https://example.com">our site</a>.</p>');
    expect(html).not.toMatch(/#|\*\*|\]\(/);
  });

  it('lines inside a paragraph stay separate lines', () => {
    expect(markdownToHtml('Line one\nLine two\n\nNext paragraph')).toBe('<p>Line one<br>Line two</p><p>Next paragraph</p>');
  });

  it('quotes, dividers, checklists and other bullet marks', () => {
    expect(markdownToHtml('> Seats are limited\n\n---\n\n* one\n+ two\n• three\n- [x] done')).toBe('<blockquote><p>Seats are limited</p></blockquote><hr><ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li><li><p>done</p></li></ul>');
  });

  it('pasted text can never become markup of its own', () => {
    const html = markdownToHtml('<script>alert(1)</script> **<img src=x onerror=alert(1)>** [x](javascript:alert(1)) [y](data:text/html,x)');
    expect(html).not.toMatch(/<script|<img|javascript:|data:text/);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>');
  });

  it('leaves maths and names with underscores alone', () => {
    expect(markdownToHtml('5 * 3 * 2 and snake_case_name')).toBe('<p>5 * 3 * 2 and snake_case_name</p>');
  });

  it('tells Markdown from ordinary text', () => {
    for (const md of ['# Title', 'a\n- item', '1. first', 'some **bold** text', 'see [x](https://x.co)', '> quote']) expect(looksLikeMarkdown(md), md).toBe(true);
    for (const plain of ['Just a sentence.', 'Price is 5 * 3', 'C# and F# talks', 'email me - soon']) expect(looksLikeMarkdown(plain), plain).toBe(false);
  });
});

describe('formatting survives leaving the step and coming back', () => {
  it('line breaks are stored as <br>, not as raw newlines that vanish when the text is read again', () => {
    expect(keepLineBreaks('<p>one\ntwo</p><p>three</p>')).toBe('<p>one<br>two</p><p>three</p>');
    expect(keepLineBreaks('<p>one</p><pre><code>a\nb</code></pre>')).toBe('<p>one</p><pre><code>a\nb</code></pre>');
    expect(keepLineBreaks('<p>unchanged</p>')).toBe('<p>unchanged</p>');
  });

  it('a description saved as plain text gets its paragraphs back instead of one long paragraph', () => {
    expect(descriptionForEditor('First paragraph.\n\nSecond paragraph.\nSame paragraph.')).toBe('<p>First paragraph.</p><p>Second paragraph.<br>Same paragraph.</p>');
    expect(descriptionForEditor('## About\n\n- one')).toBe('<h2>About</h2><ul><li><p>one</p></li></ul>');
    expect(descriptionForEditor('<p>Already <strong>formatted</strong></p>')).toBe('<p>Already <strong>formatted</strong></p>');
    expect(descriptionForEditor('<p>a\nb</p>')).toBe('<p>a<br>b</p>');
    expect(descriptionForEditor('   ')).toBe('');
  });

  it('the editor uses these on paste, on every change and when it loads', () => {
    const editor = src('components/organizer/RichTextEditor.tsx');
    expect(editor).toContain('insertContent(markdownToHtml(source))');
    expect(editor).toContain('onChange(keepLineBreaks(editor.getHTML()))');
    expect(editor).toContain('content: descriptionForEditor(content)');
    expect(editor).toContain('so the end was left out');
    // The full preview shows the description formatted, not as raw tags.
    expect(src('app/organizer/events/create/EventPreview.tsx')).toContain('dangerouslySetInnerHTML={{ __html: description }}');
  });
});

describe('date and time pickers', () => {
  it('reads what people type as a time', () => {
    const cases: Record<string, string | null> = {
      '6': '06:00', '6pm': '18:00', '6 PM': '18:00', '6:30 pm': '18:30', '6.30pm': '18:30', '18:30': '18:30', '1830': '18:30', '12am': '00:00', '12 pm': '12:00',
      noon: '12:00', midnight: '00:00', '9a': '09:00', '0:05': '00:05', '23:59': '23:59',
      banana: null, '25:00': null, '13pm': null, '6:75': null, '': null, '0pm': null,
    };
    for (const [typed, want] of Object.entries(cases)) expect(parseTimeInput(typed), typed).toBe(want);
  });

  it('shows times and dates the way people say them', () => {
    expect(formatTimeLabel('18:30')).toBe('6:30 PM');
    expect(formatTimeLabel('00:00')).toBe('12:00 AM');
    expect(formatTimeLabel('12:05')).toBe('12:05 PM');
    expect(formatTimeLabel('nope')).toBe('');
    expect(formatDateLabel('2026-11-28')).toMatch(/Sat.*28 Nov.*2026/);
    expect(formatDateLabel('2026-02-30')).toBe('');
  });

  it('only real calendar dates count', () => {
    expect(parseDate('2026-11-28')?.getDate()).toBe(28);
    expect(parseDate('2026-02-30')).toBeNull();
    expect(parseDate('28/11/2026')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('says how long the event is, and nothing when the end is not after the start', () => {
    expect(durationLabel('2026-11-28', '18:30', '2026-11-28', '21:30')).toBe('3 hours');
    expect(durationLabel('2026-11-28', '18:30', '2026-11-28', '20:00')).toBe('1 hour 30 minutes');
    expect(durationLabel('2026-11-28', '10:00', '2026-11-30', '10:00')).toBe('2 days');
    expect(durationLabel('2026-11-28', '10:00', '2026-11-29', '13:30')).toBe('1 day 3 hours 30 minutes');
    expect(durationLabel('2026-11-28', '18:30', '2026-11-28', '17:00')).toBe('');
    expect(durationLabel('2026-11-28', '18:30', '2026-11-28', '18:30')).toBe('');
  });

  it('length shortcuts never run past midnight', () => {
    expect(addMinutes('18:30', 120)).toBe('20:30');
    expect(addMinutes('22:30', 120)).toBeNull();
    expect(addMinutes('bad', 60)).toBeNull();
  });

  it('the event form uses them in place of the browser’s own date and time boxes', () => {
    const form = src('app/organizer/events/create/OrganizerEventForm.tsx');
    expect(form).not.toMatch(/type="(date|time)"/);
    expect(form).toContain('<DateField');
    expect(form).toContain('<TimeField');
    expect(form).toContain('min={todayIso}');
  });
});
