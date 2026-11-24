import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { prepareBadgeDesign, fillBadgeMarkers, cleanBadgeSvg } from '@/lib/events/badge-custom-server';
import { checkBadgeSvg } from '@/lib/events/badge-custom';

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 420">
  <rect width="298" height="420" fill="#0f172a"/>
  <text x="24" y="40" font-size="12" fill="#c7d2fe" font-weight="700">{{event}}</text>
  <text x="149" y="170" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">{{name}}</text>
  <text x="149" y="196" style="font-size:13px;fill:#e0e7ff;text-anchor:middle">{{role}} at <tspan>{{company}}</tspan></text>
  <rect x="94" y="250" width="110" height="110" id="qr" fill="#ffffff"/>
  <text x="149" y="395" font-size="12" font-weight="bold" fill="#fde68a" text-anchor="middle">{{ticket}}</text>
  <script>alert(1)</script><image href="https://evil.example/x.png" x="0" y="0" width="10" height="10"/>
</svg>`;

describe('own badge design', () => {
  it('takes the person placeholders out as slots, with position, size, alignment, colour and weight', () => {
    const d = prepareBadgeDesign(SAMPLE, { event: 'AI Meetup <41>', date: '6 Nov' })!;
    expect(d.viewBox).toEqual({ x: 0, y: 0, width: 298, height: 420 });
    expect(d.qr).toEqual({ x: 94, y: 250, size: 110 });
    const byText = Object.fromEntries(d.slots.map((s) => [s.template, s]));
    expect(byText['{{name}}']).toMatchObject({ x: 149, y: 170, size: 30, anchor: 'middle', bold: true, color: [1, 1, 1] });
    expect(byText['{{role}} at {{company}}']).toMatchObject({ size: 13, anchor: 'middle', bold: false });
    expect(byText['{{ticket}}']).toMatchObject({ bold: true });
    // Slots are not in the artwork; the event name is filled (escaped); nothing unsafe survives.
    expect(d.background).not.toContain('{{name}}');
    expect(d.background).toContain('AI Meetup &lt;41&gt;');
    expect(d.background).toContain('viewBox="0 0 298 420"');
    expect(d.background).not.toMatch(/script|evil\.example/);
  });

  it('fills values escaped, so a name cannot add markup', () => {
    expect(fillBadgeMarkers('<text>{{name}}</text>', { name: '<b>x</b>' })).toBe('<text>&lt;b&gt;x&lt;/b&gt;</text>');
  });

  it('refuses something that is not a design', () => {
    expect(cleanBadgeSvg('<html><body>hi</body></html>')).toBe('');
    expect(prepareBadgeDesign('<!DOCTYPE svg><svg></svg>', { event: '', date: '' })).toBeNull();
  });

  it('explains problems in plain words', () => {
    expect(checkBadgeSvg('').map((p) => p.level)).toEqual(['error']);
    expect(checkBadgeSvg('<svg viewBox="0 0 10 10"></svg>').some((p) => /\{\{name\}\}/.test(p.message))).toBe(true);
    expect(checkBadgeSvg('<svg viewBox="0 0 298 420"><text>{{name}}</text></svg>').map((p) => p.level)).toEqual(['warning']);
  });
});
