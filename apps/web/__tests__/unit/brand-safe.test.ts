import { describe, it, expect } from 'vitest';
import { safeBrandColor, safeFontName, safeFontUrl } from '@udyaibase/utils/brand-safe';

describe('brand settings written into the page <style> tag', () => {
  it('keeps hex colours and replaces anything else with the default', () => {
    expect(safeBrandColor('#FF3131', '#000')).toBe('#FF3131');
    expect(safeBrandColor(' #abc ', '#000')).toBe('#abc');
    expect(safeBrandColor('red;}</style><script>alert(1)</script>', '#FF3131')).toBe('#FF3131');
    expect(safeBrandColor('rgb(1,2,3)', '#FF3131')).toBe('#FF3131');
    expect(safeBrandColor(undefined, '#FF3131')).toBe('#FF3131');
  });

  it('accepts plain font names only', () => {
    expect(safeFontName('Plus Jakarta Sans')).toBe('Plus Jakarta Sans');
    expect(safeFontName("Inter', sans-serif; } body { display:none")).toBeNull();
    expect(safeFontName('</style>')).toBeNull();
  });

  it('accepts https font links that cannot end a CSS url()', () => {
    expect(safeFontUrl('https://media.udyaibase.com/fonts/a.woff2')).toBe('https://media.udyaibase.com/fonts/a.woff2');
    expect(safeFontUrl("https://x.example/a.woff2') ; } </style>")).toBeNull();
    expect(safeFontUrl('http://x.example/a.woff2')).toBeNull();
    expect(safeFontUrl('javascript:alert(1)')).toBeNull();
  });
});
