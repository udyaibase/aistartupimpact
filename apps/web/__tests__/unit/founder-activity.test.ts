import { describe, it, expect } from 'vitest';
import { actionsIn, describeActivity, describeDevice } from '@/lib/founder/activity-display';

describe('describeActivity', () => {
  it('says how someone signed in', () => {
    expect(describeActivity('signed_in', { method: 'google' }).title).toBe('Signed in with Google');
    expect(describeActivity('signed_in', null).title).toBe('Signed in');
  });

  it('says why a sign-in failed', () => {
    expect(describeActivity('sign_in_failed', { reason: 'wrong_2fa_code' }).title).toBe('Failed sign-in: wrong 2FA code');
    expect(describeActivity('sign_in_failed', { reason: 'wrong_password' }).title).toBe('Failed sign-in: wrong password');
  });

  it('names the listing that changed', () => {
    expect(describeActivity('startup_updated', { name: 'Acme AI' })).toEqual({ title: 'Edited Acme AI', category: 'listings' });
  });

  it('shows team changes with the masked email it was given', () => {
    const { title, category } = describeActivity('team_member_invited', { member: 'p***@acme.ai', role: 'EDITOR' });
    expect(title).toBe('Invited p***@acme.ai as editor');
    expect(category).toBe('team');
  });

  it('copes with an unknown action, and never reads inherited object properties', () => {
    expect(describeActivity('something_new', null).title).toBe('Account activity');
    expect(describeActivity('__proto__', null).title).toBe('Account activity');
    expect(describeActivity('constructor', null).title).toBe('Account activity');
  });

  it('puts every action in one filter', () => {
    const all = [...actionsIn('security'), ...actionsIn('listings'), ...actionsIn('team')];
    expect(new Set(all).size).toBe(all.length);
    expect(actionsIn('team')).toContain('team_member_removed');
    expect(actionsIn('security')).toContain('signed_in');
  });
});

describe('describeDevice', () => {
  it('reads common browsers', () => {
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Mac');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone or iPad');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows');
  });

  it('shows nothing when unknown', () => {
    expect(describeDevice(null)).toBeNull();
    expect(describeDevice('curl/8.0')).toBeNull();
  });
});
