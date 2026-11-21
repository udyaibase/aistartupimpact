import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../app/organizer');
const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const pages = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? pages(p) : n === 'page.tsx' ? [p] : [];
});
const hasTitle = (file: string) => existsSync(file) && /export const metadata\b|export (async )?function generateMetadata/.test(readFileSync(file, 'utf8'));

describe('host portal screens', () => {
  it('every screen names its browser tab, itself or through the layout beside it', () => {
    const all = pages(ROOT);
    expect(all.length).toBeGreaterThan(20);
    const untitled = all.filter((p) => !hasTitle(p) && !hasTitle(join(dirname(p), 'layout.tsx'))).map((p) => relative(ROOT, p));
    expect(untitled).toEqual([]);
  });

  it('the site name stays after the screen name', () => {
    expect(src('app/organizer/layout.tsx')).toContain("template: '%s | Udyaibase'");
  });

  it('a wrong address gets the portal’s own "not found" page', () => {
    expect(existsSync(join(ROOT, 'not-found.tsx'))).toBe(true);
    expect(src('app/organizer/[...missing]/page.tsx')).toContain('notFound()');
  });

  it('only the welcome tour opens by itself', () => {
    expect(src('components/organizer/guide/GuideHost.tsx')).toContain('tour.id !== "home"');
  });

  it('the cookie banner stays out of the signed-in workspaces', () => {
    const banner = src('components/CookieConsent.tsx');
    expect(banner).toContain('(organizer|founder|employer)');
    expect(banner).toContain('if (inPortal && !showPreferences) return null;');
  });

  it('the dashboard shows event times in the event’s time zone and has no dead buttons', () => {
    const page = src('app/organizer/page.tsx');
    expect(page).toContain('const timeZone = cleanTimeZone(e.timezone);');
    expect(page).not.toMatch(/toLocaleTimeString\("en-US", \{ hour: "numeric", minute: "2-digit", hour12: true \}\)/);
    expect(page).not.toContain('MoreHorizontal');
    expect(src('components/organizer/OrganizerHeader.tsx')).not.toContain('<Bell');
  });

  it('fields and checkboxes say what they are', () => {
    const form = src('app/organizer/events/create/OrganizerEventForm.tsx');
    for (const label of ['Event name', 'One-line summary', 'Add a topic', 'Event link']) expect(form).toContain(`aria-label="${label}"`);
    const settings = src('app/organizer/settings/page.tsx');
    for (const label of ['Organization or company name', 'Contact phone', 'Website', 'LinkedIn']) expect(settings).toContain(`aria-label="${label}"`);
    const attendees = src('app/organizer/attendees/page.tsx');
    expect(attendees).toContain('aria-label="Search attendees"');
    expect(attendees).toContain('aria-label={`Select ${r.guestName || r.guestEmail || "guest"}`}');
  });

  it('phones draw the attendee list 25 at a time', () => {
    const attendees = src('app/organizer/attendees/page.tsx');
    expect(attendees).toContain('const PHONE_ROWS = 25;');
    expect(attendees).toContain('filtered.slice(0, phoneRows).map');
  });
});
