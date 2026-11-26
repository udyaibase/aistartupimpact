import { test, expect } from '@playwright/test';
import { closeEmployerTestDb, employerSeedPresent, signInAsEmployer } from './employer-sign-in';

/**
 * Signed-in checks of the hiring portal, one seeded account per role (docs/development/TEST_ACCOUNTS.md).
 * They read and open things but never confirm a change. Opening a candidate marks them seen; nothing else is written.
 */
test.describe('Employer portal (signed in)', () => {
  test.beforeAll(async () => {
    test.skip(!(await employerSeedPresent()), 'The seeded hiring team is not in this database (run packages/database/seed-dev.ts).');
  });
  test.afterAll(closeEmployerTestDb);

  test('owner lands on the dashboard', async ({ page }) => {
    expect(await signInAsEmployer(page, 'owner')).toBe('/employer/dashboard');
    await page.goto('/employer/dashboard');
    await expect(page.getByRole('link', { name: 'Team' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Plans & billing' })).toBeVisible();
  });

  test('recruiter has no team, billing or settings pages', async ({ page }) => {
    await signInAsEmployer(page, 'recruiter');
    await page.goto('/employer/billing');
    await page.waitForURL(/\/employer\/dashboard/);
    const invite = await page.request.post('/api/employer/team', { data: { email: 'x@udyaibase.test', role: 'OWNER' }, headers: { Origin: new URL(page.url()).origin } });
    expect(invite.status()).toBe(403);
  });

  test('interviewer sees only their job, including its pipeline settings', async ({ page }) => {
    expect(await signInAsEmployer(page, 'interviewer')).toBe('/employer/applications');
    const { jobs } = await (await page.request.get('/api/employer/jobs')).json();
    expect(jobs).toHaveLength(1);
    expect((await page.request.get(`/api/employer/jobs/${jobs[0].id}/pipeline`)).status()).toBe(200);

    // Another job in the same workspace: sign in as the owner in a second context to learn its id.
    const other = await page.context().browser()!.newContext({ baseURL: new URL(page.url()).origin });
    const ownerPage = await other.newPage();
    await signInAsEmployer(ownerPage, 'owner');
    const all = (await (await ownerPage.request.get('/api/employer/jobs')).json()).jobs as { id: string }[];
    await other.close();
    const outside = all.find((j) => j.id !== jobs[0].id);
    expect(outside).toBeTruthy();
    expect((await page.request.get(`/api/employer/jobs/${outside!.id}/pipeline`)).status()).toBe(404);
  });

  test('moving a candidate from the open panel shows the confirmation above the panel', async ({ page }) => {
    await signInAsEmployer(page, 'owner');
    await page.goto('/employer/applications?view=list');
    await page.getByRole('button', { name: 'Use required cookies only' }).click({ timeout: 3_000 }).catch(() => {});
    // Open the first candidate in the list.
    await page.locator('main table tbody tr').first().locator('td').nth(1).getByRole('button').click();
    const panel = page.locator('[aria-labelledby="cand-title"]');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^(Screening|Interview)/ }).first().click();

    const dialog = page.locator('[aria-labelledby="move-title"]');
    await expect(dialog).toBeVisible();
    // A trial click fails if anything (the panel, the resume viewer) covers the button. Nothing is moved.
    await dialog.getByRole('button', { name: /^Move to / }).click({ trial: true, timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel).toBeVisible();
  });
});
