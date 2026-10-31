import { describe, expect, it } from 'vitest';
import { jsonLd } from '@/lib/json-ld';

describe('jsonLd', () => {
  it('cannot close the script tag', () => {
    const out = jsonLd({ title: '</script><script>alert(1)</script>', note: 'a & b' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(JSON.parse(out)).toEqual({ title: '</script><script>alert(1)</script>', note: 'a & b' });
  });
});
