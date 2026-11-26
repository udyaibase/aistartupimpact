import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(__dirname, '..', '..', 'app/globals.css'), 'utf8');
const config = readFileSync(join(__dirname, '..', '..', 'tailwind.config.ts'), 'utf8');

function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (triplet: string) => `#${triplet.trim().split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
const brand = (step: number) => hex(css.match(new RegExp(`:root \\{[^}]*--brand-${step}: ([\\d ]+);`))![1]);

describe('admin look: comfortable for long sessions', () => {
  it('uses a calm accent that white button text is readable on, and keeps the public red for previews only', () => {
    expect(contrast('#ffffff', brand(500))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', brand(600))).toBeGreaterThanOrEqual(4.5);
    expect(config).toContain("rgb(var(--brand-500) / <alpha-value>)");
    expect(css).toMatch(/\.public-preview,\s*\.article-content \{[^}]*--brand-500: 255 49 49;/);
  });

  it('lifts faint grey text to the 4.5:1 reading minimum in both themes', () => {
    const light = css.match(/html:where\(:not\(\.dark\)\) \[class~="text-gray-400"\][^{]*\{ color: (#[0-9a-f]{6})/)![1];
    expect(contrast(light, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light, '#f9fafb')).toBeGreaterThanOrEqual(4.5);
    const card = config.match(/900: '(#[0-9A-Fa-f]{6})'/)![1];
    const dark = css.match(/html\.dark \[class~="dark:text-gray-500"\] \{ color: (#[0-9a-f]{6})/)![1];
    expect(contrast(dark, card)).toBeGreaterThanOrEqual(4.5);
  });

  it('never shows text under 12px, and softens dark mode and motion', () => {
    expect(css).toMatch(/html \[class~="text-\[10px\]"\]/);
    expect(config).toMatch(/xs: \['0\.8125rem'/);
    expect(css).toMatch(/html\.dark \[class~="dark:text-white"\] \{ color: #e8ebf0/);
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('does not restyle utilities by class name, which breaks Tailwind @apply (build error)', () => {
    const comfort = css.slice(css.indexOf('COMFORT'));
    expect(comfort).not.toMatch(/\.dark\\:/);
    expect(comfort).not.toMatch(/(^|[\s,])\.text-(gray|brand|\\\[)/m);
  });
});
