import { describe, it, expect } from 'vitest';
import { LIMITS, orderFor, parseCareersContent, plain, visibleSections } from '@/lib/jobs/careers-content';

const profile = { name: 'Acme AI', headline: 'AI for farmers', description: 'We build things.', perks: ['Health insurance'] };

describe('parseCareersContent', () => {
  it('starts a company with Intro and Perks when nothing is saved', () => {
    const c = parseCareersContent(null);
    expect(c.sections.map((s) => s.type)).toEqual(['intro', 'perks']);
    expect(c.template).toBe('startup');
  });

  it('drops unknown types and extra copies, and enforces per-type limits', () => {
    const c = parseCareersContent({
      sections: [
        { type: 'mission', statement: 'One', id: 'aaaa1111' },
        { type: 'mission', statement: 'Two' }, // only one mission allowed
        { type: 'html', body: '<script>alert(1)</script>' },
        { type: 'values', items: Array.from({ length: 9 }, (_, i) => ({ name: `V${i}`, text: 'x' })) },
        { type: 'text', title: 'A', body: 'a' }, { type: 'text', title: 'B', body: 'b' },
        { type: 'text', title: 'C', body: 'c' }, { type: 'text', title: 'D', body: 'd' },
      ],
      template: 'classic',
    });
    expect(c.sections.map((s) => s.type)).toEqual(['mission', 'values', 'text', 'text', 'text']);
    expect(c.template).toBe('classic');
    expect(c.sections[1].type === 'values' && c.sections[1].items).toHaveLength(LIMITS.values);
  });

  it('keeps text plain and clipped, and replaces bad or duplicate ids', () => {
    const c = parseCareersContent({
      sections: [
        { type: 'text', id: 'x"><img', title: 'T\u0000itle', body: 'a'.repeat(5000) },
        { type: 'mission', id: 'same1234', statement: 's' },
        { type: 'values', id: 'same1234', items: [] },
      ],
    });
    // Sorted into the template's order: mission, values, then custom text.
    const [mission, values, text] = c.sections;
    expect(text.id).toMatch(/^[a-z0-9]{4,16}$/i);
    expect(text.type === 'text' && text.body.length).toBe(LIMITS.body);
    expect(text.type === 'text' && text.title).toBe('T itle');
    expect(mission.id).toBe('same1234');
    expect(values.id).not.toBe('same1234');
  });

  it('plain() keeps paragraph breaks only where asked', () => {
    expect(plain('a\n\n\n\nb', 100, true)).toBe('a\n\nb');
    expect(plain('a\nb', 100)).toBe('a b');
    expect(plain(42, 10)).toBe('');
  });
});

describe('templates', () => {
  it('orders sections by the template and falls back to Startup for unknown templates', () => {
    const raw = { sections: [{ type: 'perks' }, { type: 'values', items: [] }, { type: 'mission' }, { type: 'intro' }] };
    expect(parseCareersContent({ ...raw, template: 'startup' }).sections.map((s) => s.type)).toEqual(['intro', 'mission', 'values', 'perks']);
    expect(parseCareersContent({ ...raw, template: 'minimal' }).sections.map((s) => s.type)).toEqual(['intro', 'perks', 'mission', 'values']);
    expect(parseCareersContent({ ...raw, template: 'fancy' }).template).toBe('startup');
  });
  it('keeps Custom text sections in their own order', () => {
    const c = parseCareersContent({ sections: [{ type: 'text', title: 'B', body: 'b' }, { type: 'intro' }, { type: 'text', title: 'A', body: 'a' }] });
    expect(orderFor('classic', c.sections).map((s) => (s.type === 'text' ? s.title : s.type))).toEqual(['intro', 'B', 'A']);
  });
});

describe('visibleSections', () => {
  it('shows filled, enabled sections in order, using the company profile for Intro and Perks', () => {
    const c = parseCareersContent({
      sections: [
        { type: 'perks', title: '' },
        { type: 'intro' },
        { type: 'values', items: [{ name: 'Ship weekly', text: '' }, { name: '', text: 'ignored' }] },
        { type: 'mission', statement: '', body: '' }, // empty: hidden
        { type: 'process', enabled: false, items: [{ name: 'Call', text: '' }] }, // switched off
        { type: 'voices', quotes: [{ name: 'Asha', role: 'ML engineer', quote: 'Great team' }, { name: '', role: '', quote: 'no name' }] },
      ],
    });
    const v = visibleSections(c, profile);
    // Startup template order, whatever order they were saved in.
    expect(v.map((s) => s.type)).toEqual(['intro', 'values', 'perks', 'voices']);
    expect(v[0]).toMatchObject({ title: 'About Acme AI', headline: 'AI for farmers' });
    expect(v[2]).toMatchObject({ title: 'Perks & benefits', perks: ['Health insurance'] });
    expect(v[1].type === 'values' && v[1].items).toHaveLength(1);
    expect(v[3].type === 'voices' && v[3].quotes).toHaveLength(1);
  });

  it('hides Intro and Perks when the profile has nothing to show', () => {
    const v = visibleSections(parseCareersContent(null), { name: 'X', headline: null, description: null, perks: [] });
    expect(v).toEqual([]);
  });
});

describe('starter content', () => {
  it('fills only empty Mission, Values and Hiring process, and never invents perks or quotes', async () => {
    const { withStarter, isStarter } = await import('@/lib/jobs/careers-content');
    const c = parseCareersContent({
      template: 'bold',
      sections: [{ type: 'intro' }, { type: 'mission', statement: 'Our own mission' }, { type: 'perks' }, { type: 'voices', quotes: [] }],
    });
    const s = withStarter(c, 'Acme AI');
    const mission = s.sections.find((x) => x.type === 'mission');
    expect(mission?.type === 'mission' && mission.statement).toBe('Our own mission'); // kept
    expect(s.sections.find((x) => x.type === 'values')).toBeTruthy(); // added
    expect(s.sections.find((x) => x.type === 'process')).toBeTruthy(); // added
    const voices = s.sections.find((x) => x.type === 'voices');
    expect(voices?.type === 'voices' && voices.quotes).toEqual([]); // no made-up quotes
    expect(isStarter(s.sections.find((x) => x.type === 'values')!, 'Acme AI')).toBe(true);
    expect(isStarter(mission!, 'Acme AI')).toBe(false);
    expect(s.sections.map((x) => x.type)).toEqual(['intro', 'values', 'perks', 'mission', 'process', 'voices']); // Bold order
  });

  it('knows all six templates and the branding switch', () => {
    expect(parseCareersContent({ template: 'editorial' }).template).toBe('editorial');
    expect(parseCareersContent({ template: 'split', hideBranding: true }).hideBranding).toBe(true);
    expect(parseCareersContent(null).hideBranding).toBe(false);
  });
});
