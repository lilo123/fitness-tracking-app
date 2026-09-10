import { test, expect } from '@playwright/test';

test.describe('Coach-Athlete Multi-Tenant Flow E2E', () => {
  test('coach logs in and accesses coach cockpit', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'coach@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/coach');

    // Assert coach cockpit elements
    await expect(page.locator('text=Coach Dashboard')).toBeVisible();
    await expect(page.locator('text=Selected Athlete')).toBeVisible();

    // Verify athlete switcher select
    const athleteSelect = page.locator('select').first();
    await expect(athleteSelect).toBeVisible();
    const optionsCount = await athleteSelect.locator('option').count();
    expect(optionsCount).toBeGreaterThan(0);
  });

  test('coach builds and saves a workout routine template', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'coach@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/coach');

    // Enter template name
    const templateInput = page.locator('input[placeholder*="Hypertrophy Upper Body A"]');
    await templateInput.fill('Playwright Test Coach Routine');

    // Select an exercise if available
    const exerciseSelect = page.locator('[data-testid="template-exercise-select"]');
    const optionsCount = await exerciseSelect.locator('option').count();

    if (optionsCount > 1) {
      await exerciseSelect.selectOption({ index: 1 });
      await page.click('[data-testid="add-template-exercise-btn"]');

      // Verify sequence item added
      await expect(page.locator('text=Exercise Sequence (1):')).toBeVisible();

      // Click save
      const saveBtn = page.locator('[data-testid="save-template-btn"]');
      await expect(saveBtn).toBeEnabled();
      await saveBtn.click();

      // Assert confirmation message or saved template
      await expect(page.locator('text=Template saved')).toBeVisible();
    }
  });
});
