import { describe, it, expect, vi } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));

import { buildIcs } from '@/lib/events/ics';
import { emailLogText, logSafe } from '@/lib/email/send';
import { newCertificateCode, isCertificateCode } from '@/lib/events/after-event';

describe('calendar files escape special characters', () => {
  it('escapes semicolons and commas in text fields', () => {
    const ics = buildIcs([{ uid: 'u1', title: 'Demo; Day, 2026', start: new Date('2026-12-01T10:00:00Z'), end: new Date('2026-12-01T11:00:00Z') }]);
    expect(ics).toContain('SUMMARY:Demo\\; Day\\, 2026');
  });
});

describe('dev email log', () => {
  it('drops style blocks and every tag character', () => {
    const text = emailLogText('<style>p{color:red}</style><p>Hello <b>there</b></p><STYLE>x</STYLE> bye');
    expect(text).toBe('Hello there bye');
    expect(emailLogText('<style<style<style')).not.toMatch(/[<>]/);
  });

  it('is fast on hostile input', () => {
    const t = Date.now();
    emailLogText('<style'.repeat(50_000));
    expect(Date.now() - t).toBeLessThan(500);
  });

  it('keeps a logged value on one line', () => {
    expect(logSafe('a@x.test\n[email:test-inbox] to=fake')).toBe('a@x.test [email:test-inbox] to=fake');
  });
});

describe('certificate codes', () => {
  it('are 16 readable characters', () => {
    for (let i = 0; i < 50; i++) expect(isCertificateCode(newCertificateCode())).toBe(true);
  });
});
