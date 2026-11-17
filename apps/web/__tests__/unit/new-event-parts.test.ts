import { describe, it, expect, vi } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { createEventParts, hasPaidTickets, planAgenda } from '@/lib/events/new-event-parts';

const oneDay = { startAt: new Date('2026-12-01T04:30:00Z'), endAt: new Date('2026-12-01T12:30:00Z'), timezone: 'Asia/Kolkata' };
const twoDays = { ...oneDay, endAt: new Date('2026-12-02T12:30:00Z') };
const speakers = [{ name: 'Asha Rao' }, { name: 'Ravi Kumar' }];

function fakeTx() {
  let n = 0;
  return {
    eventSpeaker: { create: vi.fn(async () => ({ id: `sp${++n}` })) },
    eventTicketTier: { createMany: vi.fn() },
    eventCustomQuestion: { createMany: vi.fn() },
    eventAgendaItem: { createMany: vi.fn() },
  };
}

describe('agenda on create', () => {
  it('keeps valid sessions, links speakers by name, ignores blank rows', () => {
    const r = planAgenda([
      { title: 'Keynote', startTime: '10:00', endTime: '10:45', speaker: 'asha rao' },
      { title: '', startTime: '' },
      { title: 'Panel', startTime: '11:00', speaker: 'Someone else' },
    ], speakers, oneDay);
    expect(r).toEqual({ sessions: [
      expect.objectContaining({ title: 'Keynote', dayNumber: 1, speakerName: 'asha rao' }),
      expect.objectContaining({ title: 'Panel', speakerName: null }),
    ] });
  });
  it('rejects a session that ends before it starts, naming the row', () => {
    expect(planAgenda([{ title: 'A', startTime: '10:00' }, { title: 'B', startTime: '12:00', endTime: '11:00' }], [], oneDay))
      .toEqual({ error: 'Agenda, session 2: “B” ends before it starts.' });
  });
  it('days never go past the event’s last day', () => {
    const r = planAgenda([{ title: 'Late', startTime: '10:00', dayNumber: 5 }], [], twoDays);
    expect('sessions' in r && r.sessions[0].dayNumber).toBe(2);
  });
  it('no agenda is fine', () => {
    expect(planAgenda(undefined, undefined, oneDay)).toEqual({ sessions: [] });
  });
});

describe('saving a new event’s parts', () => {
  it('creates speakers, tickets, questions and agenda, with sessions pointing at the new speakers', async () => {
    const tx = fakeTx();
    const plan = planAgenda([{ title: 'Keynote', startTime: '10:00', speaker: 'Ravi Kumar' }], speakers, oneDay);
    if (!('sessions' in plan)) throw new Error('plan failed');
    await createEventParts(tx as never, 'e1', {
      speakers: [...speakers, { name: '' }, { name: 'asha rao' }],
      ticketTiers: [{ name: 'Early', type: 'EARLY_BIRD', quantity: '50', priceRupees: '499.5' }, { name: '', type: 'HACK', quantity: '', priceRupees: '' }],
      customQuestions: [{ text: 'Company size?', type: 'SELECT', required: true, options: '1-10, 11-50,' }, { text: '  ' }],
    }, plan.sessions);
    expect(tx.eventSpeaker.create).toHaveBeenCalledTimes(2);
    expect(tx.eventTicketTier.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ name: 'Early', tierType: 'EARLY_BIRD', quantity: 50, priceCents: 49950 }),
      expect.objectContaining({ name: 'General', tierType: 'REGULAR', quantity: null, priceCents: 0 }),
    ]);
    expect(tx.eventCustomQuestion.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ questionText: 'Company size?', questionType: 'SELECT', required: true, options: ['1-10', '11-50'] }),
    ]);
    expect(tx.eventAgendaItem.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ title: 'Keynote', speakerId: 'sp2', dayNumber: 1 })]);
  });
  it('spots paid tickets', () => {
    expect(hasPaidTickets([{ priceRupees: '0' }, { priceRupees: '199' }])).toBe(true);
    expect(hasPaidTickets([{ priceRupees: '' }])).toBe(false);
  });
});
