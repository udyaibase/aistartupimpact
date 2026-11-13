import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ workspaceActivityLog: { create: vi.fn() } }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => { throw new Error('outside a request'); }) }));

import { describeWorkspaceActivity, workspaceActionsIn } from '@udyaibase/utils';
import { logEmployerActivity, logOrganizerActivity, paiseLabel } from '@/lib/workspace-activity';

beforeEach(() => { vi.clearAllMocks(); });

describe('wording', () => {
  it('reads naturally for employer and host entries', () => {
    expect(describeWorkspaceActivity('EMPLOYER', 'signed_in', { method: 'founder' }).title).toBe('Signed in with the founder account');
    expect(describeWorkspaceActivity('EMPLOYER', 'job_posted', { title: 'ML Engineer' }).title).toBe('Posted the job “ML Engineer”');
    expect(describeWorkspaceActivity('EMPLOYER', 'job_status_changed', { title: 'ML Engineer', status: 'CLOSED' }).title).toBe('Closed the job “ML Engineer”');
    expect(describeWorkspaceActivity('EMPLOYER', 'team_member_invited', { member: 'pr***@acme.ai', role: 'RECRUITER' }).title).toBe('Invited pr***@acme.ai as recruiter');
    expect(describeWorkspaceActivity('ORGANIZER', 'ticket_refunded', { attendee: 'ra***@x.in', event: 'GenAI Summit' }).title).toBe('Refunded ra***@x.in for “GenAI Summit”');
    expect(describeWorkspaceActivity('ORGANIZER', 'plan_purchased', { plan: 'Pro plan (30 days)', amount: '₹2,359' }).title).toBe('Paid for the Pro plan (30 days) (₹2,359)');
  });
  it('falls back safely for unknown actions and keeps each portal to its own actions', () => {
    expect(describeWorkspaceActivity('EMPLOYER', 'something_new', null)).toEqual({ title: 'Account activity', category: 'security' });
    expect(describeWorkspaceActivity('EMPLOYER', 'ticket_refunded', null).title).toBe('Account activity'); // a host-only action
  });
  it('filters by category', () => {
    expect(workspaceActionsIn('EMPLOYER', 'billing')).toEqual(expect.arrayContaining(['plan_purchased', 'billing_details_changed']));
    expect(workspaceActionsIn('ORGANIZER', 'billing')).toEqual(expect.arrayContaining(['boost_purchased', 'ticket_refunded', 'payout_details_changed']));
    expect(workspaceActionsIn('EMPLOYER', 'work')).not.toContain('event_created');
  });
});

describe('logging', () => {
  it('records who did it with a masked email, scoped to the workspace', async () => {
    await logEmployerActivity('emp1', 'job_deleted', { actor: { name: 'Priya', email: 'priya.rao@acme.ai' }, metadata: { title: 'Data Scientist' } });
    const data = db.workspaceActivityLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ workspace: 'EMPLOYER', workspaceId: 'emp1', action: 'job_deleted', actorName: 'Priya', metadata: { title: 'Data Scientist' } });
    expect(data.actorEmail).not.toBe('priya.rao@acme.ai');
    expect(data.actorEmail).toMatch(/@acme\.ai$/);
  });
  it('takes IP and device from the request', async () => {
    const request = new Request('http://x', { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0', 'x-forwarded-for': '203.0.113.7' } });
    await logOrganizerActivity('org1', 'signed_in', { actor: { email: 'host@events.in' }, request, metadata: { method: 'google' } });
    const data = db.workspaceActivityLog.create.mock.calls[0][0].data;
    expect(data.workspace).toBe('ORGANIZER');
    expect(data.userAgent).toContain('Chrome');
  });
  it('a system entry (payment webhook) has no actor', async () => {
    await logOrganizerActivity('org1', 'boost_purchased', { actor: null, metadata: { event: 'Summit', amount: paiseLabel(1179_00) } });
    expect(db.workspaceActivityLog.create.mock.calls[0][0].data).toMatchObject({ actorName: null, actorEmail: null, ipAddress: null, metadata: { amount: '₹1,179' } });
  });
  it('never breaks the action when the log can’t be written', async () => {
    db.workspaceActivityLog.create.mockRejectedValueOnce(new Error('table missing'));
    await expect(logEmployerActivity('emp1', 'signed_in', { actor: { email: 'a@b.co' } })).resolves.toBeUndefined();
  });
});
