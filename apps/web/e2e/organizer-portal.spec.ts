import { test, expect } from '@playwright/test';

test.describe('Organizer portal', () => {
  test('organizer landing page loads', async ({ page }) => {
    const response = await page.goto('/organizer');
    expect(response?.status()).toBeLessThan(500);
  });

  test('organizer events does not return 500', async ({ page }) => {
    const response = await page.goto('/organizer/events');
    expect(response?.status()).toBeLessThan(500);
  });

  test('organizer attendees does not return 500', async ({ page }) => {
    const response = await page.goto('/organizer/attendees');
    expect(response?.status()).toBeLessThan(500);
  });

  test('organizer check-in does not return 500', async ({ page }) => {
    const response = await page.goto('/organizer/check-in');
    expect(response?.status()).toBeLessThan(500);
  });

  test('organizer settings does not return 500', async ({ page }) => {
    const response = await page.goto('/organizer/settings');
    expect(response?.status()).toBeLessThan(500);
  });

  test('organizer login has email field', async ({ page }) => {
    await page.goto('/organizer/login');
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test('organizer login has password field', async ({ page }) => {
    await page.goto('/organizer/login');
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});

test.describe('Organizer portal (signed out)', () => {
  for (const path of ['/organizer/billing', '/organizer/organization', '/organizer/team', '/organizer/promote']) {
    test(`${path} does not return 500`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(500);
    });
  }

  test('payouts, billing and refund APIs refuse anonymous calls', async ({ request }) => {
    expect((await request.get('/api/organizer/payouts')).status()).toBe(401);
    expect((await request.get('/api/organizer/billing/invoice/x')).status()).toBe(401);
    expect([401, 403]).toContain((await request.post('/api/organizer/registrations/x/refund')).status());
  });

  test('ticket checkout rejects a request with no event', async ({ request }) => {
    const res = await request.post('/api/events/tickets/checkout', { data: {} });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
