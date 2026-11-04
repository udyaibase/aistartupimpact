import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  startup: { findFirst: vi.fn(), count: vi.fn() },
  aiTool: { findFirst: vi.fn() },
  founderTeamMember: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { listingAccess } from '@/lib/founder/listing-access';
import { roleForOwner, teamContext, workspaceOwnerIds } from '@/lib/founder/access';

const founderA = { userId: 'founder-a', email: 'A@acme.ai' };
const founderB = { userId: 'founder-b', email: 'b@other.ai' };

describe('who can edit a listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.startup.findFirst.mockResolvedValue({ ownerId: 'founder-a', name: 'Acme' });
    db.founderTeamMember.findFirst.mockResolvedValue(null);
  });

  it('lets the owner edit', async () => {
    expect(await listingAccess(founderA, 'startup', 's1')).toMatchObject({ role: 'OWNER', canEdit: true, ownerId: 'founder-a' });
  });

  it('refuses another founder', async () => {
    expect(await listingAccess(founderB, 'startup', 's1')).toBeNull();
  });

  it('refuses a listing that’s gone, or has no owner', async () => {
    db.startup.findFirst.mockResolvedValue(null);
    expect(await listingAccess(founderA, 'startup', 'gone')).toBeNull();
    db.startup.findFirst.mockResolvedValue({ ownerId: null, name: 'Directory listing' });
    expect(await listingAccess(founderA, 'startup', 'unclaimed')).toBeNull();
  });

  it('gives teammates their role, and only viewers can’t edit', async () => {
    for (const [role, canEdit] of [['ADMIN', true], ['EDITOR', true], ['VIEWER', false]] as const) {
      db.founderTeamMember.findFirst.mockResolvedValue({ role });
      expect(await listingAccess(founderB, 'startup', 's1')).toMatchObject({ role, canEdit });
    }
  });

  it('only counts active members, matched by lowercase email', async () => {
    await roleForOwner({ userId: 'x', email: 'Person@Acme.AI' }, 'founder-a');
    expect(db.founderTeamMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { founderId: 'founder-a', email: 'person@acme.ai', status: 'ACTIVE' },
    }));
  });
});

describe('what someone can see', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows their own listings and their teams’', async () => {
    db.founderTeamMember.findMany.mockResolvedValue([{ founderId: 'founder-a', role: 'EDITOR' }]);
    expect(await workspaceOwnerIds(founderB)).toEqual(['founder-b', 'founder-a']);
  });

  it('shows only their own without a team, and never twice', async () => {
    db.founderTeamMember.findMany.mockResolvedValue([{ founderId: 'founder-a', role: 'ADMIN' }]);
    expect(await workspaceOwnerIds(founderA)).toEqual(['founder-a']);
  });
});

describe('which team someone manages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is their own when they have a listing, even if they’re on another team', async () => {
    db.startup.count.mockResolvedValue(1);
    db.founderTeamMember.count.mockResolvedValue(0);
    db.founderTeamMember.findMany.mockResolvedValue([{ founderId: 'founder-a', role: 'ADMIN' }]);
    expect(await teamContext(founderB)).toEqual({ ownerId: 'founder-b', role: 'OWNER' });
  });

  it('is the team they joined when they have nothing of their own', async () => {
    db.startup.count.mockResolvedValue(0);
    db.founderTeamMember.count.mockResolvedValue(0);
    db.founderTeamMember.findMany.mockResolvedValue([{ founderId: 'founder-a', role: 'EDITOR' }]);
    expect(await teamContext(founderB)).toEqual({ ownerId: 'founder-a', role: 'EDITOR' });
  });

  it('prefers a team where they’re an admin', async () => {
    db.startup.count.mockResolvedValue(0);
    db.founderTeamMember.count.mockResolvedValue(0);
    db.founderTeamMember.findMany.mockResolvedValue([{ founderId: 'c', role: 'VIEWER' }, { founderId: 'founder-a', role: 'ADMIN' }]);
    expect(await teamContext(founderB)).toEqual({ ownerId: 'founder-a', role: 'ADMIN' });
  });
});
