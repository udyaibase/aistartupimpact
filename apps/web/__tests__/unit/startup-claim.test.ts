import { describe, it, expect, beforeAll } from 'vitest';
import { claimToken } from '@/lib/startups/claim';
import { pickRoleInbox } from '../../scripts/collect-claim-contacts';

beforeAll(() => { process.env.FOUNDER_JWT_SECRET = 'test-secret'; });

describe('claimToken', () => {
  const unowned = { id: 's1', ownerId: null, verificationToken: null };

  it('gives each founder their own token, so one founder’s DNS record can’t verify another', () => {
    expect(claimToken(unowned, 'a')).not.toBe(claimToken(unowned, 'b'));
  });

  it('is stable, so a record already added keeps working', () => {
    expect(claimToken(unowned, 'a')).toBe(claimToken(unowned, 'a'));
    expect(claimToken(unowned, 'a')).toMatch(/^ub_[0-9a-f]{32}$/);
  });

  it('differs per startup', () => {
    expect(claimToken({ ...unowned, id: 's2' }, 'a')).not.toBe(claimToken(unowned, 'a'));
  });

  it('keeps an owner’s stored token', () => {
    expect(claimToken({ id: 's1', ownerId: 'a', verificationToken: 'old' }, 'a')).toBe('old');
  });

  it('never hands someone else’s stored token to another founder', () => {
    expect(claimToken({ id: 's1', ownerId: 'a', verificationToken: 'old' }, 'b')).not.toBe('old');
  });
});

describe('pickRoleInbox', () => {
  it('takes a shared inbox on the company’s own domain', () => {
    expect(pickRoleInbox('<a href="mailto:hello@acme.ai">Write to us</a>', 'acme.ai')).toBe('hello@acme.ai');
  });

  it('never takes a person’s address', () => {
    expect(pickRoleInbox('priya.sharma@acme.ai', 'acme.ai')).toBeNull();
  });

  it('never takes another domain or free mail', () => {
    expect(pickRoleInbox('info@gmail.com hello@vendor.com', 'acme.ai')).toBeNull();
  });

  it('prefers founders over support', () => {
    expect(pickRoleInbox('support@acme.ai founders@acme.ai', 'acme.ai')).toBe('founders@acme.ai');
  });
});
