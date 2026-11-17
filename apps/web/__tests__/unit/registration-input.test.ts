import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ eventCustomQuestion: { findMany: vi.fn() } }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { cleanPhone, cleanRegistrationInput, RegistrationInputError } from '@/lib/events/registration-input';
import { availableTiers, formatPhone, phoneProblem } from '@/lib/events/registration-fields';

const Q = [
  { id: 'q1', questionText: 'Your role?', questionType: 'TEXT', required: true, options: null },
  { id: 'q2', questionText: 'T-shirt size', questionType: 'SELECT', required: false, options: ['S', 'M', 'L'] },
  { id: 'q3', questionText: 'I agree to the code of conduct', questionType: 'CHECKBOX', required: true, options: null },
  { id: 'q4', questionText: 'Need parking?', questionType: 'CHECKBOX', required: false, options: null },
];
beforeEach(() => db.eventCustomQuestion.findMany.mockResolvedValue(Q));
const base = { eventId: 'e1', email: '  Asha@Example.IN ', answers: [{ questionId: 'q1', answerText: 'Engineer' }, { questionId: 'q3', answerText: 'yes' }] };

describe('one set of registration rules (event page, widget, paid checkout)', () => {
  it('lowercases the email so the same person can’t register twice', async () => {
    expect((await cleanRegistrationInput(base)).email).toBe('asha@example.in');
  });
  it('stores yes/no questions the same way from both forms ("yes" / "Yes" / unticked)', async () => {
    const a = (await cleanRegistrationInput(base)).answers;
    expect(a.find((x) => x.questionId === 'q3')?.answerText).toBe('Yes');
    expect(a.find((x) => x.questionId === 'q4')?.answerText).toBe('No');
  });
  it('enforces required questions on the server, but not for walk-ins', async () => {
    await expect(cleanRegistrationInput({ ...base, answers: [{ questionId: 'q3', answerText: 'Yes' }] })).rejects.toMatchObject({ field: 'q_q1' });
    await expect(cleanRegistrationInput({ ...base, answers: [{ questionId: 'q1', answerText: 'x' }] })).rejects.toMatchObject({ field: 'q_q3' });
    await expect(cleanRegistrationInput({ ...base, answers: [] }, { enforceRequired: false })).resolves.toBeTruthy();
  });
  it('ignores answers to other events’ questions and refuses made-up options', async () => {
    const a = (await cleanRegistrationInput({ ...base, answers: [...base.answers, { questionId: 'other-event-q', answerText: 'x' }] })).answers;
    expect(a.map((x) => x.questionId)).not.toContain('other-event-q');
    await expect(cleanRegistrationInput({ ...base, answers: [...base.answers, { questionId: 'q2', answerText: 'XXL' }] })).rejects.toBeInstanceOf(RegistrationInputError);
    expect((await cleanRegistrationInput({ ...base, answers: [...base.answers, { questionId: 'q2', answerText: 'm' }] })).answers.find((x) => x.questionId === 'q2')?.answerText).toBe('M');
  });
  it('keeps occupation and company optional, matching the list case-insensitively', async () => {
    expect(await cleanRegistrationInput(base)).toMatchObject({ company: null, occupation: null });
    expect((await cleanRegistrationInput({ ...base, occupation: 'student', company: '  IIT  Madras ' }))).toMatchObject({ occupation: 'Student', company: 'IIT Madras' });
  });
});

describe('phone numbers have one stored format', () => {
  it('normalises what both forms and older clients send', () => {
    expect(cleanPhone('+91 98765 43210')).toBe('+91 9876543210');
    expect(cleanPhone('+91-9876543210')).toBe('+91 9876543210');
    expect(cleanPhone('9876543210')).toBe('+91 9876543210');
    expect(cleanPhone('+447700900123')).toBe('+447700900123');
    expect(cleanPhone('')).toBeNull();
    expect(() => cleanPhone('+91 12345')).toThrow(/10-digit/);
    expect(() => cleanPhone('call me')).toThrow(RegistrationInputError);
  });
  it('the forms check and format the same way', () => {
    expect(phoneProblem('+91', '98765 43210')).toBe('');
    expect(phoneProblem('+91', '98765')).toMatch(/10-digit/);
    expect(formatPhone('+91', '98765-43210')).toBe('+91 9876543210');
  });
});

describe('ticket choices', () => {
  it('offers only tickets on sale right now and not sold out', () => {
    const now = Date.now();
    const tiers = [
      { id: 'a', saleStart: null, saleEnd: null, quantity: 10, soldCount: 3 },
      { id: 'sold', saleStart: null, saleEnd: null, quantity: 10, soldCount: 10 },
      { id: 'later', saleStart: new Date(now + 864e5).toISOString(), saleEnd: null, quantity: null, soldCount: 0 },
      { id: 'over', saleStart: null, saleEnd: new Date(now - 864e5).toISOString(), quantity: null, soldCount: 0 },
    ];
    expect(availableTiers(tiers, now).map((t) => t.id)).toEqual(['a']);
  });
});
