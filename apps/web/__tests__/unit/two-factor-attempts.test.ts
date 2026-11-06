import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ sql: vi.fn(), sendEmail: vi.fn() }));
vi.mock('@/lib/db', () => ({ sql: db.sql }));
vi.mock('@/lib/email/send', () => ({ sendEmail: db.sendEmail }));

import { MAX_2FA_ATTEMPTS, clearTwoFactorFailures, isTwoFactorLocked, recordTwoFactorFailure } from '@/lib/auth/two-factor-attempts';

const queryText = () => (db.sql.mock.calls[0][0] as string[]).join('?');

describe('2FA attempt limit', () => {
  beforeEach(() => {
    db.sql.mockReset();
    db.sendEmail.mockReset();
    db.sendEmail.mockResolvedValue({ success: true });
  });

  it('reports a lock only while it’s running', async () => {
    db.sql.mockResolvedValueOnce([{ locked: true }]);
    expect(await isTwoFactorLocked('founder', 'f1')).toBe(true);
    db.sql.mockResolvedValueOnce([{ locked: false }]);
    expect(await isTwoFactorLocked('founder', 'f1')).toBe(false);
    db.sql.mockResolvedValueOnce([{ locked: null }]);
    expect(await isTwoFactorLocked('founder', 'f1')).toBe(false);
  });

  it('locks on the fifth wrong code, not before', async () => {
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS - 1 }]);
    expect(await recordTwoFactorFailure('webuser', 'w1')).toBe(false);
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS }]);
    expect(await recordTwoFactorFailure('webuser', 'w1')).toBe(true);
  });

  it('emails the owner when an account locks, and not before', async () => {
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS - 1, email: 'a@b.co', name: 'Asha' }]);
    await recordTwoFactorFailure('founder', 'f1');
    expect(db.sendEmail).not.toHaveBeenCalled();

    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS, email: 'a@b.co', name: 'Asha' }]);
    await recordTwoFactorFailure('founder', 'f1');
    expect(db.sendEmail).toHaveBeenCalledTimes(1);
    const mail = db.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('a@b.co');
    expect(mail.type).toBe('security_alert');
    expect(mail.html).toContain('your password is known to someone else');
    expect(mail.html).toContain('/auth/forgot-password');
  });

  it('still locks when the email can’t be sent', async () => {
    db.sendEmail.mockRejectedValue(new Error('down'));
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS, email: 'a@b.co', name: 'Asha' }]);
    expect(await recordTwoFactorFailure('founder', 'f1')).toBe(true);
  });

  it('escapes the name in the email', async () => {
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS, email: 'a@b.co', name: '<img src=x>' }]);
    await recordTwoFactorFailure('founder', 'f1');
    expect(db.sendEmail.mock.calls[0][0].html).not.toContain('<img src=x>');
  });

  it('writes to the right account table', async () => {
    for (const [account, table] of [['webuser', 'WebUser'], ['founder', 'FounderUser'], ['organizer', 'EventOrganizer']] as const) {
      db.sql.mockReset();
      db.sql.mockResolvedValue([{ attempts: 1 }]);
      await recordTwoFactorFailure(account, 'x');
      expect(queryText()).toContain(`"${table}"`);
      db.sql.mockReset();
      db.sql.mockResolvedValue([]);
      await clearTwoFactorFailures(account, 'x');
      expect(queryText()).toContain(`"${table}"`);
    }
  });

  it('also limits employer accounts, on their own table', async () => {
    db.sql.mockResolvedValueOnce([{ attempts: MAX_2FA_ATTEMPTS, email: 'o@acme.ai', name: 'Acme' }]);
    expect(await recordTwoFactorFailure('employer', 'e1')).toBe(true);
    expect(queryText()).toContain('"JobBoardEmployer"');
    expect(db.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'o@acme.ai' }));
    expect(db.sendEmail.mock.calls[0][0].html).toContain('/employer/login');
  });
});
