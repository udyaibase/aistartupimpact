import { describe, it, expect, vi } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { chooseWorkspace, type TeamMembership } from '@/lib/organizer-auth/workspace';

const team = (organizerId: string): TeamMembership => ({ organizerId, organizerName: organizerId, role: 'MANAGER', teamMemberId: `m-${organizerId}` });

describe('which host workspace a person works in', () => {
  it('is their own when they are on no team', () => {
    expect(chooseWorkspace([], undefined, false)).toBeNull();
    expect(chooseWorkspace([], 'someone-else', false)).toBeNull();
  });

  it('stays their own after joining a team, when they run events themselves', () => {
    expect(chooseWorkspace([team('a')], undefined, true)).toBeNull();
  });

  it('opens the newest team for someone who only joined as a teammate', () => {
    expect(chooseWorkspace([team('newest'), team('older')], undefined, false)?.organizerId).toBe('newest');
  });

  it('follows an explicit choice, including back to their own', () => {
    expect(chooseWorkspace([team('a'), team('b')], 'b', true)?.organizerId).toBe('b');
    expect(chooseWorkspace([team('a')], 'own', false)).toBeNull();
  });

  it('ignores a choice of a team they are no longer on', () => {
    expect(chooseWorkspace([team('a')], 'removed', true)).toBeNull();
    expect(chooseWorkspace([team('a')], 'removed', false)?.organizerId).toBe('a');
  });
});
