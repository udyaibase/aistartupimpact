import { describe, expect, it, vi } from 'vitest';
import { publicError } from '@/lib/public-error';

describe('error text shown to admins', () => {
  it('passes through messages written for people', () => {
    expect(publicError(new Error('Add a title first'))).toBe('Add a title first');
    expect(publicError(new Error('Unauthorized'))).toBe('Unauthorized');
    expect(publicError('Enter an amount between ₹1 and ₹500.')).toBe('Enter an amount between ₹1 and ₹500.');
  });

  it('hides database, network and code errors, and logs them on the server', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const internal = [
      'Invalid `prisma.user.update()` invocation: Unique constraint failed on the fields: (`email`)',
      'relation "JobBoardEmployer" does not exist',
      'column "planCycle" of relation "EventOrganizer" does not exist',
      'duplicate key value violates unique constraint "User_email_key"',
      'connect ECONNREFUSED 10.0.0.5:5432',
      'fetch failed',
      "Cannot read properties of undefined (reading 'id')",
      'password authentication failed for postgresql://app:hunter2@ep-x.neon.tech/neondb',
      'Unexpected token < in JSON at position 0',
      'first line\nsecond line',
      'x'.repeat(250),
      '',
    ];
    for (const message of internal) expect(publicError(new Error(message)), message).toBe('Something went wrong on our side. Please try again.');
    expect(publicError(new TypeError('boom'))).toBe('Something went wrong on our side. Please try again.');
    expect(publicError(undefined)).toBe('Something went wrong on our side. Please try again.');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('uses the caller\'s fallback when given one', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(publicError(new Error('relation "X" does not exist'), "Couldn't save the article.")).toBe("Couldn't save the article.");
    log.mockRestore();
  });
});
