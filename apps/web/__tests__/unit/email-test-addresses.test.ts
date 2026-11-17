import { describe, it, expect, vi } from 'vitest';

const sent = vi.hoisted(() => ({ single: vi.fn(), batch: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (o: unknown) => { sent.single(o); return { data: { id: 'r1' }, error: null }; } };
    batch = { send: async (items: unknown[]) => { sent.batch(items); return { data: { data: items.map((_, i) => ({ id: `b${i}` })) }, error: null }; } };
  },
}));
vi.mock('@udyaibase/database', () => ({ prisma: { $executeRaw: vi.fn(async () => 1) } }));
process.env.RESEND_API_KEY = 're_test_dummy';

import { isTestAddress, sendEmail, sendEmailBatch } from '@/lib/email/send';

describe('reserved test addresses never get emailed', () => {
  it('recognises the dummy-data domains, not real ones', () => {
    for (const a of ['nimbus-owner@udyaibase.test', 'x@foo.invalid', 'a@example.com', 'b@mail.example.org']) expect(isTestAddress(a), a).toBe(true);
    for (const a of ['someone@gmail.com', 'hr@company.in', 'a@notexample.com', 'x@test.com']) expect(isTestAddress(a), a).toBe(false);
  });
  it('skips them but still reports success, so app flows behave normally', async () => {
    expect(await sendEmail({ to: 'cand@udyaibase.test', subject: 'Code', html: '<p>123456</p>' })).toEqual({ success: true });
    expect(sent.single).not.toHaveBeenCalled();
    await sendEmail({ to: 'real@company.in', subject: 'Hi', html: '<p>x</p>' });
    expect(sent.single).toHaveBeenCalledTimes(1);
  });
  it('a batch sends only the real addresses and keeps results in order', async () => {
    const res = await sendEmailBatch([
      { to: 'a@udyaibase.test', subject: 's', html: 'h' }, { to: 'b@company.in', subject: 's', html: 'h' }, { to: 'c@udyaibase.test', subject: 's', html: 'h' },
    ]);
    expect(sent.batch).toHaveBeenCalledTimes(1);
    expect((sent.batch.mock.calls[0][0] as { to: string }[]).map((i) => i.to)).toEqual(['b@company.in']);
    expect(res).toEqual([{ success: true }, { success: true, resendId: 'b0' }, { success: true }]);
  });
});
