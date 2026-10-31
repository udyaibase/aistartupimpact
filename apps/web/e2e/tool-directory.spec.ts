import { test, expect } from '@playwright/test';

test.describe('Tool directory', () => {
  test('search page loads', async ({ page }) => {
    const response = await page.goto('/search', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
  });

  test('startups page loads', async ({ page }) => {
    const response = await page.goto('/startups', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
  });

  test('search page has search input', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    const searchInput = page.getByPlaceholder(/search/i).first();
    const hasSearch = await searchInput.isVisible().catch(() => false);
    expect(hasSearch).toBeTruthy();
  });
});
