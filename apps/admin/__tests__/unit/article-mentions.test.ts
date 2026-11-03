import { describe, it, expect, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { extractMentions } from '@/lib/article-mentions';
import { cleanArticleHtml } from '@/lib/article-html';

describe('extractMentions', () => {
  it('reads @-tags from the editor (type + id) and survives the save-time sanitizer', () => {
    const html = cleanArticleHtml(
      '<p>Backed by <a href="/startups/neuralpay" class="mention" data-mention-type="startup" data-mention-id="s1" contenteditable="false">@NeuralPay</a>, '
      + 'built with <a href="/tools/vox" class="mention" data-mention-type="tool" data-mention-id="t9" contenteditable="false">@Vox</a>.</p>',
    );
    expect(extractMentions(html)).toEqual({ startupIds: ['s1'], toolIds: ['t9'], startupSlugs: [], toolSlugs: [] });
  });

  it('counts plain links to startup and tool pages on our site, not elsewhere', () => {
    const html = '<p><a href="https://udyaibase.com/startups/Karta/">Karta</a> <a href="/tools/live-ai?ref=x">tool</a> '
      + '<a href="https://evil.com/startups/karta">no</a> <a href="/startups/">no</a> <a href="/news/karta">no</a></p>';
    expect(extractMentions(html)).toEqual({ startupIds: [], toolIds: [], startupSlugs: ['karta'], toolSlugs: ['live-ai'] });
  });

  it('de-duplicates repeated tags and ignores malformed ones', () => {
    const tag = '<a class="mention" data-mention-type="startup" data-mention-id="s1" href="/startups/a">@A</a>';
    expect(extractMentions(`${tag}${tag}<a data-mention-type="person" data-mention-id="p1">x</a>`).startupIds).toEqual(['s1']);
    expect(extractMentions('')).toEqual({ startupIds: [], toolIds: [], startupSlugs: [], toolSlugs: [] });
  });
});
