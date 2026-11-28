import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
  const count = () => vi.fn(async () => 0);
  return {
    article: { count: count() }, startup: { count: count() }, aiTool: { count: count() }, toolReview: { count: count() },
    startupReview: { count: count() }, event: { count: count() }, listingPendingEdit: { count: count() },
    contentReport: { count: count() }, supportTicket: { count: count() }, jobBoardEmployer: { count: count() },
    jobApplication: { count: count() }, eventRegistration: { count: count() },
  };
});
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { ALL_NAV_ITEMS, NAV_GROUPS, activeHref, navFor } from '@/components/nav/nav-config';
import { SECTION_ROLES } from '@/lib/section-access';
import { ATTENTION_QUEUES, attentionText, attentionTotal } from '@/lib/attention-queues';
import { attentionCounterKeys, getAttentionCounts, queuesFor } from '@/lib/attention';
import { searchNav } from '@/components/nav/CommandPalette';

describe('admin menu', () => {
  it('lists every restricted section exactly once, each with its own icon', () => {
    const hrefs = ALL_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(SECTION_ROLES[href], href).toBeDefined();
    const icons = ALL_NAV_ITEMS.map((i) => i.icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(NAV_GROUPS.length).toBeLessThanOrEqual(10);
  });

  it('shows a role only its own sections and drops empty groups', () => {
    const writer = navFor('WRITER');
    expect(writer.flatMap((g) => g.items.map((i) => i.href))).toEqual(['/articles', '/media']);
    expect(navFor('SUPER_ADMIN').flatMap((g) => g.items)).toHaveLength(ALL_NAV_ITEMS.length);
    expect(navFor(undefined)).toEqual([]);
  });

  it('marks the most specific section as the current one', () => {
    expect(activeHref('/events/review')).toBe('/events/review');
    expect(activeHref('/events/123/edit')).toBe('/events');
    expect(activeHref('/advertise/payments')).toBe('/advertise/payments');
    expect(activeHref('/dashboard')).toBeNull();
  });
});

describe('search', () => {
  const rows = ALL_NAV_ITEMS.map((i) => ({ label: i.label, href: i.href, group: i.group, icon: i.icon, words: i.words ?? '', waiting: 0 }));
  it('finds a section by its name, its group or a related word', () => {
    expect(searchNav(rows, 'bill')[0].href).toBe('/billing');
    expect(searchNav(rows, 'refund').map((r) => r.href)).toContain('/billing');
    expect(searchNav(rows, 'india policy')[0].href).toBe('/india-ai/policy');
    expect(searchNav(rows, 'zzzz')).toEqual([]);
    expect(searchNav(rows, '')).toHaveLength(rows.length);
  });
});

describe('needs attention', () => {
  beforeEach(() => { for (const m of Object.values(db)) m.count.mockReset().mockResolvedValue(0); });

  it('has a counter for every queue, and every queue belongs to a real section', () => {
    expect(attentionCounterKeys().sort()).toEqual(ATTENTION_QUEUES.map((q) => q.href).sort());
    for (const q of ATTENTION_QUEUES) expect(SECTION_ROLES[q.href], q.href).toBeDefined();
  });

  it('counts only the queues the role can act on', async () => {
    db.eventRegistration.count.mockResolvedValue(4); // pending refunds: Super Admin only
    db.toolReview.count.mockResolvedValue(2);
    db.article.count.mockResolvedValue(3);

    expect(await getAttentionCounts('WRITER')).toEqual({});
    expect(db.eventRegistration.count).not.toHaveBeenCalled(); // never even asked

    const editor = await getAttentionCounts('EDITOR_IN_CHIEF');
    expect(editor['/billing']).toBeUndefined();
    expect(editor['/tool-reviews']).toBe(2);
    expect(editor['/articles']).toBe(3);

    const admin = await getAttentionCounts('SUPER_ADMIN');
    expect(admin['/billing']).toBe(4);
    expect(queuesFor('SENIOR_WRITER').map((q) => q.href)).not.toContain('/articles'); // reviewing articles is for editors
  });

  it('leaves out empty queues and survives a failing count', async () => {
    db.supportTicket.count.mockRejectedValue(new Error('db down'));
    db.startup.count.mockResolvedValue(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getAttentionCounts('SUPER_ADMIN')).toEqual({ '/startups-dir/review': 1 });
  });

  it('words the count for one and for many', () => {
    const q = ATTENTION_QUEUES.find((x) => x.href === '/reports')!;
    expect(attentionText(q, 1)).toBe('1 report to handle');
    expect(attentionText(q, 12)).toBe('12 reports to handle');
    expect(attentionTotal({ a: 2, b: 5 })).toBe(7);
  });
});
