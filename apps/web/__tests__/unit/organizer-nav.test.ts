import { describe, it, expect, vi } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));

import { accessFor, canOpen, filterNav } from '@/lib/organizer-auth/nav';
import { getPermissions } from '@/lib/organizer-auth/permissions';

const as = (role: string) => accessFor(getPermissions(role), true);
const owner = accessFor([], false);

const PAGES = [
  '/organizer', '/organizer/events', '/organizer/events/create', '/organizer/events/import', '/organizer/attendees',
  '/organizer/check-in', '/organizer/on-site', '/organizer/analytics', '/organizer/promote', '/organizer/embed',
  '/organizer/team', '/organizer/organization', '/organizer/billing', '/organizer/settings', '/organizer/activity',
  '/organizer/support',
];
const visible = (a: ReturnType<typeof as>) => PAGES.filter((p) => canOpen(p, a));

describe('organizer menu by role', () => {
  it('owner in their own workspace sees everything', () => {
    expect(visible(owner)).toEqual(PAGES);
  });

  it('admin sees everything except the owner-only organization profile', () => {
    expect(visible(as('ADMIN'))).toEqual(PAGES.filter((p) => p !== '/organizer/organization'));
  });

  it('manager: events and promotion work, no billing, settings-level pages or organization', () => {
    const v = visible(as('MANAGER'));
    expect(v).toEqual(expect.arrayContaining(['/organizer/events/create', '/organizer/promote', '/organizer/embed', '/organizer/team', '/organizer/on-site']));
    for (const p of ['/organizer/billing', '/organizer/activity', '/organizer/organization']) expect(v).not.toContain(p);
  });

  it('staff: view and check-in only', () => {
    expect(visible(as('STAFF'))).toEqual([
      '/organizer', '/organizer/events', '/organizer/attendees', '/organizer/check-in', '/organizer/analytics',
      '/organizer/embed', '/organizer/settings', '/organizer/support',
    ]);
  });

  it('check-in only: home, events, check-in, and their own settings and support', () => {
    expect(visible(as('CHECK_IN'))).toEqual(['/organizer', '/organizer/events', '/organizer/check-in', '/organizer/settings', '/organizer/support']);
  });

  it('matches sub-pages and query strings to their section', () => {
    expect(canOpen('/organizer/billing/invoices?x=1', as('STAFF'))).toBe(false);
    expect(canOpen('/organizer/events/abc', as('CHECK_IN'))).toBe(true);
    expect(canOpen('/organizer/events/create?template=meetup', as('STAFF'))).toBe(false);
  });

  it('drops section headings left empty', () => {
    const items = [
      { label: 'Home', href: '/organizer' },
      { type: 'divider', label: 'Workspace' },
      { label: 'Billing', href: '/organizer/billing' },
      { type: 'divider', label: 'Help' },
      { label: 'Support', href: '/organizer/support' },
    ];
    expect(filterNav(items, as('CHECK_IN')).map((i) => i.label)).toEqual(['Home', 'Help', 'Support']);
    expect(filterNav(items, owner)).toHaveLength(5);
  });
});
