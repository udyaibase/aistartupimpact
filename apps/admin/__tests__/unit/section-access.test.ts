import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { canOpen, rolesForPath, sectionRoles, SECTION_ROLES } from '@/lib/section-access';

describe('who may open each admin section', () => {
  it('covers every page under a section, longest match first', () => {
    expect(rolesForPath('/billing')).toEqual(['SUPER_ADMIN']);
    expect(rolesForPath('/tools-dir/123/edit')).toEqual(SECTION_ROLES['/tools-dir']);
    expect(rolesForPath('/events/review')).toEqual(SECTION_ROLES['/events/review']);
    expect(rolesForPath('/india-ai/mission-tracker/new')).toEqual(SECTION_ROLES['/india-ai']);
    expect(rolesForPath('/dashboard')).toBeNull();
    expect(rolesForPath('/billing-notes')).toBeNull(); // a different address, not "under" /billing
  });

  it('keeps roles out of sections they cannot see in the sidebar', () => {
    expect(canOpen('WRITER', '/billing')).toBe(false);
    expect(canOpen('WRITER', '/settings')).toBe(false);
    expect(canOpen('WRITER', '/articles/new')).toBe(true);
    expect(canOpen('SENIOR_WRITER', '/employers')).toBe(false);
    expect(canOpen('EVENT_ORGANIZER', '/events')).toBe(true);
    expect(canOpen('EVENT_ORGANIZER', '/events/review')).toBe(false);
    expect(canOpen('AD_MANAGER', '/sponsors')).toBe(true);
    expect(canOpen(undefined, '/billing')).toBe(false);
    expect(canOpen('SUPER_ADMIN', '/dev-tools')).toBe(true);
  });

  it('lets a Super Admin into every section', () => {
    for (const section of Object.keys(SECTION_ROLES)) expect(canOpen('SUPER_ADMIN', section), section).toBe(true);
  });

  it('gives actions the same roles as the sidebar', () => {
    expect(sectionRoles('/sponsors')).toEqual([...SECTION_ROLES['/sponsors']]);
    expect(() => sectionRoles('/nope')).toThrow();
  });

  it('is the only place the menu and the middleware get roles from', () => {
    const root = join(__dirname, '..', '..');
    const menu = readFileSync(join(root, 'components/nav/nav-config.ts'), 'utf8');
    expect(menu).not.toMatch(/roles:/); // menu items never carry their own role list
    expect(readFileSync(join(root, 'middleware.ts'), 'utf8')).toContain('canOpen(');
  });
});
