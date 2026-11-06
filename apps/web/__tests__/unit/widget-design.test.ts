import { describe, it, expect } from 'vitest';
import { contrastRatio, googleFontHref, parseSiteHint, parseWidgetDesign } from '@/lib/jobs/widget-design';

describe('widget design values', () => {
  it('keeps valid values', () => {
    expect(parseWidgetDesign({ colors: { card: '#ABCDEF' }, font: 'Manrope', radius: 14, showSearch: true, maxWidth: 900 }))
      .toEqual({ colors: { card: '#abcdef' }, font: 'Manrope', radius: 14, showSearch: true, maxWidth: 900 });
  });

  it('refuses anything that could inject CSS or load other files', () => {
    const d = parseWidgetDesign({
      colors: { card: 'red;background:url(https://evil.test)', text: 'url(x)' },
      font: 'Inter"; } body { display:none',
      headingFont: 'x&family=evil',
      radius: 'abc',
      maxWidth: 99999,
      nonsense: true,
    });
    expect(d).toEqual({});
  });

  it('limits corners, and keeps zero as a real choice', () => {
    expect(parseWidgetDesign({ radius: 500 }).radius).toBe(32);
    expect(parseWidgetDesign({ radius: 0 }).radius).toBe(0);
    expect(parseWidgetDesign({ radius: null }).radius).toBeUndefined();
  });

  it('builds a Google Fonts address', () => {
    expect(googleFontHref('Open Sans')).toContain('family=Open+Sans:wght@400');
    expect(googleFontHref('Open Sans', false)).not.toContain('wght');
  });

  it('measures contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});

describe('values read from the host page', () => {
  const hint = (o: unknown) => parseSiteHint(JSON.stringify(o));

  it('keeps sensible values', () => {
    expect(hint({ accent: '#2563EB', background: '#ffffff', text: '#111111', font: 'Manrope', radius: 8 }))
      .toEqual({ accent: '#2563eb', card: '#ffffff', text: '#111111', font: 'Manrope', radius: 8 });
  });

  it('drops anything unsafe or broken, since any page can send this', () => {
    expect(hint({ accent: 'red;x:url(y)', font: '"><script>', radius: 'x', background: 'url(z)' })).toEqual({});
    expect(parseSiteHint('{not json')).toEqual({});
    expect(parseSiteHint(null)).toEqual({});
    expect(parseSiteHint('null')).toEqual({});
  });

  it('leaves out system fonts, which need no loading', () => {
    expect(hint({ font: 'Arial', headingFont: 'system-ui' })).toEqual({});
  });

  it('won’t copy colours people can’t read', () => {
    expect(hint({ background: '#777777', text: '#787878' })).toEqual({});
  });
});
