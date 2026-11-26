import { describe, it, expect } from 'vitest';
import { formFields, FormError } from '@/lib/form-fields';

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return formFields(fd); };

describe('formFields', () => {
  it('trims and caps text, and tells empty optional fields apart', () => {
    const f = form({ name: '  Asha  ', note: '', long: 'x'.repeat(50) });
    expect(f.text('name')).toBe('Asha');
    expect(f.optional('note')).toBeNull();
    expect(f.text('long', 10)).toHaveLength(10);
    expect(() => f.required('note')).toThrow(FormError);
    expect(f.text('missing')).toBe('');
  });

  it('accepts only web addresses and site paths as links', () => {
    expect(form({ u: 'https://example.com/a' }).url('u')).toBe('https://example.com/a');
    expect(form({ u: '/startups/acme' }).url('u')).toBe('/startups/acme');
    expect(form({ u: '' }).optionalUrl('u')).toBeNull();
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'not a link']) {
      expect(() => form({ u: bad }).url('u'), bad).toThrow(FormError);
    }
  });

  it('keeps numbers finite and in range', () => {
    expect(form({ n: '12' }).int('n')).toBe(12);
    expect(form({ n: '' }).int('n')).toBe(0);
    expect(form({ n: '' }).intOrNull('n')).toBeNull();
    expect(() => form({ n: 'abc' }).int('n')).toThrow(FormError);
    expect(() => form({ lat: '200' }).number('lat', -90, 90)).toThrow(FormError);
  });

  it('splits lines, drops empties and caps the count', () => {
    expect(form({ l: ' a \n\n b ' }).lines('l')).toEqual(['a', 'b']);
    expect(form({ l: Array.from({ length: 80 }, (_, i) => `x${i}`).join('\n') }).lines('l')).toHaveLength(50);
  });

  it('reads tick boxes and dates', () => {
    expect(form({ on: 'on' }).flag('on')).toBe(true);
    expect(form({}).flag('on')).toBe(false);
    expect(() => form({ d: 'nope' }).date('d')).toThrow(FormError);
  });
});
