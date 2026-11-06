import { describe, it, expect } from 'vitest';
import { candidateEmailUpdate } from '@/lib/email/resend-webhook';

describe('candidate email delivery', () => {
  it('marks a hard bounce as failed, but not a soft one that’s still being retried', () => {
    expect(candidateEmailUpdate({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } })).toBe('FAILED');
    expect(candidateEmailUpdate({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } })).toBeNull();
  });

  it('marks sent and delivered as sent, and ignores everything else', () => {
    expect(candidateEmailUpdate({ type: 'email.delivered' })).toBe('SENT');
    expect(candidateEmailUpdate({ type: 'email.sent' })).toBe('SENT');
    expect(candidateEmailUpdate({ type: 'email.opened' })).toBeNull();
    expect(candidateEmailUpdate({})).toBeNull();
  });
});
