import { describe, it, expect, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
vi.mock('@/lib/email/send', () => ({ getResend: () => null, sendEmail: vi.fn() }));
vi.mock('@/lib/support/employer-tickets', () => ({ openEmployerTicket: vi.fn(), SUPPORT_INBOUND: () => 'support@in.example', SUPPORT_INBOX: () => 'team@example.com' }));

import { htmlToText, looksLikeEmail, parseAddress } from '@/lib/support/inbound';
import { cleanSourced } from '@/lib/employer/sourcing';

describe('reading a sender address (no regular expression)', () => {
  it('reads the usual shapes', () => {
    expect(parseAddress('"Asha Rao" <ASHA@acme.co>')).toEqual({ email: 'asha@acme.co', name: 'Asha Rao' });
    expect(parseAddress('Asha Rao <asha@acme.co>')).toEqual({ email: 'asha@acme.co', name: 'Asha Rao' });
    expect(parseAddress('  asha@acme.co ')).toEqual({ email: 'asha@acme.co', name: 'asha' });
    expect(parseAddress('<asha@acme.co>')).toEqual({ email: 'asha@acme.co', name: 'asha' });
  });

  it('answers at once on input built to stall a pattern', () => {
    const started = Date.now();
    parseAddress(' '.repeat(200_000) + '<');
    expect(looksLikeEmail('!.'.repeat(100_000) + '@')).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('knows a plausible address from a broken one', () => {
    expect(looksLikeEmail('asha@acme.co')).toBe(true);
    for (const bad of ['', 'asha', '@acme.co', 'asha@acme', 'asha@.co', 'asha@acme.', 'a b@acme.co', 'a@b@acme.co']) expect(looksLikeEmail(bad)).toBe(false);
  });
});

describe('HTML email to plain text', () => {
  it('keeps the words, drops tags, and turns block ends into line breaks', () => {
    expect(htmlToText('<p>Hello <b>team</b>,</p><div>I can&#39;t publish.<br>Thanks</div>')).toBe('Hello team,\nI can\'t publish.\nThanks\n');
  });

  it('drops script and style blocks with their contents, however they are nested or cased', () => {
    const out = htmlToText('a<style>p{color:red}</style>b<SCRIPT type="x">alert(1)</SCRIPT>c<scr<script>x</script>ipt>alert(2)</script>d');
    expect(out).not.toMatch(/alert\(1\)|color:red|<script/i);
    expect(out.startsWith('abc')).toBe(true);
  });

  it('decodes entities once, so an escaped entity stays text', () => {
    expect(htmlToText('5 &lt; 6 &amp;&amp; 7 &gt; 6')).toBe('5 < 6 && 7 > 6');
    expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('stops at an unfinished tag or block instead of leaking it', () => {
    expect(htmlToText('safe<script>never closed')).toBe('safe');
    expect(htmlToText('safe<img src=x')).toBe('safe');
  });
});

describe('a sourced candidate’s LinkedIn link', () => {
  const base = { fullName: 'Asha Rao', email: 'asha@acme.co' };
  const linkedin = (url: string) => { const r = cleanSourced({ ...base, linkedinUrl: url }); return r.ok ? r.data.linkedinUrl : 'error'; };

  it('counts only links on linkedin.com itself', () => {
    expect(linkedin('https://www.linkedin.com/in/asha')).toBe('https://www.linkedin.com/in/asha');
    expect(linkedin('linkedin.com/in/asha')).toBe('https://linkedin.com/in/asha');
    expect(linkedin('https://evil.example/linkedin.com/in/asha')).toBeNull();
    expect(linkedin('https://linkedin.com.evil.example/in/asha')).toBeNull();
    expect(linkedin('https://notlinkedin.com/in/asha')).toBeNull();
  });
});
