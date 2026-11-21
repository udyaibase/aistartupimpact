import { describe, it, expect } from 'vitest';
import { bodyProblem, prepareBody, STORY_MIN_TEXT } from '@/lib/founder/content-body';
import { articleHtml, plainTextHtml } from '@udyaibase/utils/article-content';

describe('what a founder writes, made ready to store', () => {
  it('keeps the story editor’s formatting', () => {
    const html = '<h2>How we began</h2><p>We <strong>started</strong> in <em>Pune</em>.</p><blockquote><p>Ship it.</p></blockquote><ul><li>One</li><li>Two</li></ul>';
    expect(prepareBody(html).content).toBe(html);
  });

  it('removes anything that isn’t text formatting, whatever the request sent', () => {
    const body = prepareBody('<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe><p style="position:fixed">there</p>');
    expect(body.content).toBe('<p>Hi</p><p>there</p>');
  });

  it('keeps pictures uploaded to our own media, with their description, and drops any other picture', () => {
    const own = '<p>Our team</p><img src="https://media.udyaibase.com/uploads/team.webp" alt="The team in Pune">';
    expect(prepareBody(own).content).toBe(own.replace('">', '" />').replace('Pune">', 'Pune" />'));
    expect(prepareBody('<img src="/uploads/1-abc.png" alt="x">').content).toBe('<img src="/uploads/1-abc.png" alt="x" />');
    const outside = prepareBody('<p>a</p><img src="https://evil.example/x.png"><img src="http://media.udyaibase.com/x.png"><img src="https://media.udyaibase.com.evil.example/x.png"><img src="data:image/png;base64,AAAA">');
    expect(outside.content).toBe('<p>a</p>');
    expect(prepareBody('<img src="https://media.udyaibase.com/x.png" onerror="alert(1)" style="width:1px">').content)
      .toBe('<img src="https://media.udyaibase.com/x.png" />');
  });

  it('keeps web links, makes them open safely, and drops javascript: links', () => {
    const body = prepareBody('<p><a href="https://krishi.example">site</a> <a href="javascript:alert(1)">bad</a></p>');
    expect(body.content).toContain('<a href="https://krishi.example" rel="noopener nofollow ugc" target="_blank">site</a>');
    expect(body.content).not.toContain('javascript:');
  });

  it('counts the words a reader sees, not the tags, and keeps blocks apart', () => {
    const body = prepareBody('<h2>Day one</h2><p>We shipped.</p><p>Then slept.</p>');
    expect(body.text).toBe('Day one We shipped. Then slept.');
    expect(body.words).toBe(6);
    expect(body.readMinutes).toBe(1);
    expect(prepareBody(`<p>${'word '.repeat(450)}</p>`).readMinutes).toBe(3);
  });

  it('leaves a plain-text update as it was typed', () => {
    const body = prepareBody('Line one\n\nLine two with 2 < 3');
    expect(body.content).toBe('Line one\n\nLine two with 2 < 3');
    expect(body.text).toBe('Line one Line two with 2 < 3');
  });

  it('a story needs real text before review; formatting alone does not count', () => {
    expect(bodyProblem('FOUNDER_STORY', prepareBody('<p>too short</p>'))).toMatch(/at least 100/);
    expect(bodyProblem('FOUNDER_STORY', prepareBody(`<p>${'<strong></strong>'.repeat(200)}</p>`))).toBeTruthy();
    expect(bodyProblem('FOUNDER_STORY', prepareBody(`<p>${'a'.repeat(STORY_MIN_TEXT)}</p>`))).toBeNull();
    expect(bodyProblem('FOUNDER_STORY', prepareBody(`<p>${'a'.repeat(50_001)}</p>`))).toMatch(/up to/);
  });

  it('an update needs some text before it is published', () => {
    expect(bodyProblem('STARTUP_UPDATE', prepareBody(''))).toBeTruthy();
    expect(bodyProblem('STARTUP_UPDATE', prepareBody('   \n  '))).toBeTruthy();
    expect(bodyProblem('STARTUP_UPDATE', prepareBody('We launched.'))).toBeNull();
  });
});

describe('showing stored text on the public page', () => {
  it('plain text keeps its paragraphs and line breaks, and web addresses become links', () => {
    expect(plainTextHtml('First paragraph line.\n\nSecond paragraph.\n- bullet one\n- bullet two\nhttps://example.com/link.')).toBe(
      '<p>First paragraph line.</p><p>Second paragraph.<br>- bullet one<br>- bullet two<br><a href="https://example.com/link">https://example.com/link</a>.</p>',
    );
  });

  it('plain text is escaped, so typed angle brackets show as typed', () => {
    expect(plainTextHtml('2 < 3 & 4 > 1')).toBe('<p>2 &lt; 3 &amp; 4 &gt; 1</p>');
  });

  it('formatted text passes through unchanged (it is cleaned separately before display)', () => {
    expect(articleHtml('<h2>Title</h2><p>Body</p>')).toBe('<h2>Title</h2><p>Body</p>');
    expect(articleHtml('One\n\nTwo')).toBe('<p>One</p><p>Two</p>');
  });
});
