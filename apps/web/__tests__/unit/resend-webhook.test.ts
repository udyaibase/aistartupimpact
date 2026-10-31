import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { resendSignatureValid, suppressionReason } from '@/lib/email/resend-webhook';

const secret = 'whsec_' + Buffer.from('test-signing-key-0123456789').toString('base64');
const sign = (id: string, ts: string, body: string) =>
  crypto.createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');

describe('Resend (Svix) webhook signature', () => {
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.com'] } });
  const now = 1_800_000_000;
  const ts = String(now);

  it('accepts a correctly signed request, including among rotated signatures', () => {
    expect(resendSignatureValid(body, { id: 'msg_1', timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` }, secret, now)).toBe(true);
    expect(resendSignatureValid(body, { id: 'msg_1', timestamp: ts, signature: `v1,AAAA v1,${sign('msg_1', ts, body)}` }, secret, now)).toBe(true);
  });

  it('rejects a tampered body, wrong id, stale timestamp or missing secret', () => {
    const sig = `v1,${sign('msg_1', ts, body)}`;
    expect(resendSignatureValid(body + ' ', { id: 'msg_1', timestamp: ts, signature: sig }, secret, now)).toBe(false);
    expect(resendSignatureValid(body, { id: 'msg_2', timestamp: ts, signature: sig }, secret, now)).toBe(false);
    expect(resendSignatureValid(body, { id: 'msg_1', timestamp: ts, signature: sig }, secret, now + 301)).toBe(false);
    expect(resendSignatureValid(body, { id: 'msg_1', timestamp: ts, signature: sig }, undefined, now)).toBe(false);
    expect(resendSignatureValid(body, { id: 'msg_1', timestamp: ts, signature: null }, secret, now)).toBe(false);
  });

  it('suppresses hard bounces and complaints only', () => {
    expect(suppressionReason({ type: 'email.complained' })).toBe('complained');
    expect(suppressionReason({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } })).toBe('bounced');
    expect(suppressionReason({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } })).toBeNull();
    expect(suppressionReason({ type: 'email.delivered' })).toBeNull();
  });
});
