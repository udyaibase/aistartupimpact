import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  supportTicket: { findUnique: vi.fn(async (..._a: any[]): Promise<any> => null), update: vi.fn() },
  supportTicketMessage: { findUnique: vi.fn(async (..._a: any[]): Promise<any> => null), create: vi.fn() },
  jobBoardTeamMember: { findFirst: vi.fn(async (..._a: any[]): Promise<any> => null) },
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_o: any) => ({ success: true })) }));
const open = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({})));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mail.send, getResend: () => null }));
vi.mock('@/lib/support/employer-tickets', () => ({ openEmployerTicket: open, SUPPORT_INBOUND: () => 'support@in.udyaibase.com', SUPPORT_INBOX: () => 'team@udyaibase.com' }));

import { handleInboundEmail, parseAddress, stripQuoted } from '@/lib/support/inbound';
import { readStatus } from '@/lib/support/portal-status';

beforeEach(() => vi.clearAllMocks());
const ev = (over: Record<string, unknown> = {}) => ({ email_id: 'em1', from: 'Asha Rao <Asha@Acme.co>', to: ['support@in.udyaibase.com'], subject: 'Help please', attachments: [], ...over });
const load = (text: string, headers: Record<string, string> = {}) => async () => ({ text, html: null, headers });

describe('parsing', () => {
  it('reads the sender and keeps only the new part of a reply', () => {
    expect(parseAddress('"Asha Rao" <ASHA@acme.co>')).toEqual({ email: 'asha@acme.co', name: 'Asha Rao' });
    expect(stripQuoted('Thanks, that worked.\n\nOn Wed, 18 Nov 2026 at 10:00, Udyaibase <support@x> wrote:\n> old text')).toBe('Thanks, that worked.');
  });
});

describe('inbound support email', () => {
  it('ignores mail to other addresses, auto-replies and repeats', async () => {
    expect(await handleInboundEmail(ev({ to: ['hello@udyaibase.com'] }), load('x'))).toBe('ignored');
    expect(await handleInboundEmail(ev(), load('Out of office', { 'Auto-Submitted': 'auto-replied' }))).toBe('ignored');
    db.supportTicket.findUnique.mockResolvedValueOnce({ id: 't1' });
    expect(await handleInboundEmail(ev(), load('x'))).toBe('duplicate');
    expect(open).not.toHaveBeenCalled();
  });

  it('a reply with the ticket number from the same person is added and reopens the ticket', async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't9', status: 'AWAITING_USER', portal: 'EMPLOYER', submitterEmail: 'asha@acme.co', submitterId: 'emp1' });
    expect(await handleInboundEmail(ev({ subject: 'Re: We got your message (TKT-00042)', attachments: [{}] }), load('Still broken.\n> quoted'))).toBe('reply');
    expect(db.supportTicketMessage.create.mock.calls[0][0].data).toMatchObject({ ticketId: 't9', senderType: 'USER', externalId: 'em1', isInternal: false });
    expect(db.supportTicketMessage.create.mock.calls[0][0].data.body).toMatch(/^Still broken\.\n\n\[1 attachment not copied/);
    expect(db.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't9' }, data: { status: 'OPEN' } });
  });

  it('someone else quoting a ticket number can’t post into it; a team member gets a new ticket', async () => {
    db.supportTicket.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't9', status: 'OPEN', portal: 'EMPLOYER', submitterEmail: 'ravi@other.co', submitterId: 'emp2' });
    db.jobBoardTeamMember.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ employerId: 'emp1', name: 'Asha' });
    expect(await handleInboundEmail(ev({ subject: 'TKT-00042' }), load('Can you look at my account?'))).toBe('ticket');
    expect(db.supportTicketMessage.create).not.toHaveBeenCalled();
    expect(open.mock.calls[0][0]).toMatchObject({ employerId: 'emp1', email: 'asha@acme.co', viaEmail: { externalId: 'em1' } });
  });

  it('a stranger’s email is forwarded to the team, never auto-answered', async () => {
    expect(await handleInboundEmail(ev(), load('Do you sell ads?'))).toBe('forwarded');
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: 'team@udyaibase.com', replyTo: 'asha@acme.co', type: 'support_inbound_forward' });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
});

describe('status banner', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  it('shows a live message, hides an empty or expired one', () => {
    expect(readStatus({ message: 'Emails delayed', level: 'warning', until: '2026-11-18T12:00:00Z' }, now)).toMatchObject({ message: 'Emails delayed', level: 'warning' });
    expect(readStatus({ message: 'Old', until: '2026-11-18T09:00:00Z' }, now)).toBeNull();
    expect(readStatus({ message: '  ' }, now)).toBeNull();
    expect(readStatus({ message: 'x', level: 'weird' }, now)?.level).toBe('info');
  });
});
