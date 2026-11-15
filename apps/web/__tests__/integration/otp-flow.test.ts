import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mockPrisma = {
  emailOtp: {
    count: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock('@udyaibase/database', () => ({
  prisma: mockPrisma,
}));

describe('otp-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOtp', () => {
    it('generates a 6-digit OTP and stores hashed version', async () => {
      mockPrisma.emailOtp.count.mockResolvedValue(0);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const { createOtp } = await import('@/lib/otp');
      const result = await createOtp('Test@Example.COM');
      expect(result.otp).toBeTruthy();
      expect(result.otp).toMatch(/^\d{6}$/);
      expect(result.error).toBeUndefined();

      // Verify it lowercased the email
      expect(mockPrisma.emailOtp.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: 'test@example.com' }),
        })
      );

      // Verify it stored a hashed code (not plain)
      const createCall = mockPrisma.emailOtp.create.mock.calls[0][0];
      expect(createCall.data.code).not.toBe(result.otp);
      expect(createCall.data.code).toHaveLength(64); // SHA-256 hex
    });

    it('rate limits at 5 requests per hour', async () => {
      mockPrisma.emailOtp.count.mockResolvedValue(5);

      const { createOtp } = await import('@/lib/otp');
      const result = await createOtp('user@example.com');
      expect(result.otp).toBeNull();
      expect(result.error).toContain('Too many requests');
    });

    it('allows up to 4 requests', async () => {
      mockPrisma.emailOtp.count.mockResolvedValue(4);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const { createOtp } = await import('@/lib/otp');
      const result = await createOtp('user@example.com');
      expect(result.otp).toBeTruthy();
    });

    it('invalidates previous unused OTPs', async () => {
      mockPrisma.emailOtp.count.mockResolvedValue(0);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const { createOtp } = await import('@/lib/otp');
      await createOtp('user@example.com');

      expect(mockPrisma.emailOtp.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ verified: false }),
          data: expect.objectContaining({ verified: true }),
        })
      );
    });

    it('sets expiry to 10 minutes', async () => {
      mockPrisma.emailOtp.count.mockResolvedValue(0);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailOtp.create.mockResolvedValue({ id: 'otp-1' });

      const before = Date.now();
      const { createOtp } = await import('@/lib/otp');
      await createOtp('user@example.com');
      const after = Date.now();

      const createCall = mockPrisma.emailOtp.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt.getTime();
      // Should be ~10 minutes from now
      expect(expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 1000);
    });
  });

  describe('verifyOtp', () => {
    const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

    it('verifies correct code, marks it used once and gives the attempt back', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'otp-1', attempts: 1, code: hash('123456') }]);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 1 });

      const { verifyOtp } = await import('@/lib/otp');
      expect(await verifyOtp('test@example.com', '123456')).toEqual({ valid: true });
      expect(mockPrisma.emailOtp.updateMany).toHaveBeenCalledWith({
        where: { id: 'otp-1', verified: false },
        data: { verified: true, attempts: { decrement: 1 } },
      });
    });

    it('rejects a correct code that was already used by a request sent at the same moment', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'otp-1', attempts: 1, code: hash('123456') }]);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });

      const { verifyOtp } = await import('@/lib/otp');
      expect((await verifyOtp('test@example.com', '123456')).valid).toBe(false);
    });

    it('rejects wrong code and says how many attempts are left', async () => {
      // The attempt was taken in the same statement that read the code: attempts is already 1.
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'otp-1', attempts: 1, code: hash('123456') }]);

      const { verifyOtp } = await import('@/lib/otp');
      const result = await verifyOtp('test@example.com', '000000');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 attempts remaining');
      expect(mockPrisma.emailOtp.updateMany).not.toHaveBeenCalled();
    });

    it('takes the attempt and reads the code in one statement, limited to 3 attempts', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });

      const { verifyOtp } = await import('@/lib/otp');
      await verifyOtp('Test@Example.COM', '123456');
      const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
      const text = (strings as string[]).join('?');
      expect(text).toContain('SET attempts = attempts + 1');
      expect(text).toContain('attempts < ?');
      expect(values).toEqual(['test@example.com', 'signup', 3]); // lowercased email, purpose, limit
    });

    it('locks out after max attempts', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]); // no code with attempts left
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 1 }); // a used-up code was retired

      const { verifyOtp } = await import('@/lib/otp');
      const result = await verifyOtp('test@example.com', '123456');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Too many incorrect attempts');
    });

    it('returns error for expired/not found OTP', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 0 });

      const { verifyOtp } = await import('@/lib/otp');
      const result = await verifyOtp('test@example.com', '123456');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired or not found');
    });
  });
});
