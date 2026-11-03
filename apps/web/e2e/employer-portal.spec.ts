import { test, expect } from '@playwright/test';
import { passwordSignInOpen } from '../lib/employer/sign-in-policy';

test.describe('Employer portal', () => {
  test('employer landing page loads', async ({ page }) => {
    const response = await page.goto('/employer');
    expect(response?.status()).toBeLessThan(500);
  });

  test('employer dashboard does not return 500', async ({ page }) => {
    const response = await page.goto('/employer/dashboard');
    expect(response?.status()).toBeLessThan(500);
  });

  test('employer jobs does not return 500', async ({ page }) => {
    const response = await page.goto('/employer/jobs');
    expect(response?.status()).toBeLessThan(500);
  });

  test('employer company does not return 500', async ({ page }) => {
    const response = await page.goto('/employer/company');
    expect(response?.status()).toBeLessThan(500);
  });

  test('employer login: email code first, password behind a link while it is still allowed', async ({ page }) => {
    await page.goto('/employer/login');
    // Email-code sign-in comes first; the password form sits behind a link until password sign-in ends.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    const usePassword = page.getByRole('button', { name: 'Use a password instead' });
    // The cookie banner covers the bottom of the page; dismiss it the way a visitor would.
    await page.getByRole('button', { name: 'Reject all cookies' }).click({ timeout: 5_000 }).catch(() => {});
    if (passwordSignInOpen()) {
      await usePassword.click();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    } else {
      await expect(usePassword).toHaveCount(0);
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
    }
  });

  test('employer signup page loads', async ({ page }) => {
    const response = await page.goto('/employer/signup');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('Employer portal (signed out)', () => {
  for (const path of ['/employer/billing', '/employer/careers', '/employer/applications', '/employer/team', '/employer/settings', '/employer/analytics']) {
    test(`${path} sends a signed-out visitor to login`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(500);
      // Pages stream behind loading.tsx, so the redirect lands client-side after hydration.
      await page.waitForURL(/\/employer\/login/, { timeout: 25_000 });
    });
  }

  test('billing and invoice APIs refuse anonymous calls', async ({ request }) => {
    expect((await request.get('/api/employer/billing/invoice/x')).status()).toBe(401);
    expect([401, 403]).toContain((await request.post('/api/employer/billing/checkout', { data: { plan: 'PRO' } })).status());
  });
});
