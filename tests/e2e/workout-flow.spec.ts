import { test, expect } from '@playwright/test';

test.describe('Workout Flow E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Demo Athlete")');
    await page.waitForURL('**/workout');
  });

  test('loads workout engine with sticky rest timer and exercise routines', async ({ page }) => {
    // Assert routine button and date input
    await expect(page.locator('[data-testid="routine-select-btn"]')).toBeVisible();

    // Verify date input is present
    const dateInput = page.locator('[data-testid="workout-date-input"]');
    await expect(dateInput).toBeVisible();

    // Verify rest timer launcher button exists
    const timerBtn = page.locator('[data-testid="rest-timer-btn"]');
    await expect(timerBtn).toBeVisible();
  });

  test('allows toggling rest timer presets and controls', async ({ page }) => {
    // Click rest timer button to launch timer
    const restTimerButton = page.locator('[data-testid="rest-timer-btn"]');
    await restTimerButton.click();

    // Verify floating bottom rest timer pill appears
    const timerPill = page.locator('[data-testid="rest-timer-pill"]');
    await expect(timerPill).toBeVisible();

    const timerDisplay = page.locator('[data-testid="rest-timer-display"]');
    await expect(timerDisplay).toBeVisible();

    // Test +90s button
    const add90Btn = timerPill.locator('button:has-text("+90s")');
    await expect(add90Btn).toBeVisible();
    await add90Btn.click();

    // Test stop timer button
    const stopBtn = timerPill.locator('button[title="Stop timer"]');
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();
    await expect(timerPill).not.toBeVisible();
  });

  test('interacts with workout sets, draft inputs, and commit action', async ({ page }) => {
    const commitBtn = page.locator('button[title*="Commit Set"]').first();
    const deleteBtn = page.locator('button[title*="Delete set"]').first();

    if (await commitBtn.isVisible()) {
      const weightInput = page.locator('input[inputmode="decimal"]').first();
      const repsInput = page.locator('input[inputmode="numeric"]').first();
      if (await weightInput.isVisible() && (await repsInput.isVisible())) {
        await weightInput.fill('135');
        await repsInput.fill('10');
        await commitBtn.click();
        await expect(page.locator('[data-testid="rest-timer-pill"]')).toBeVisible();
      }
    } else if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page.locator('button[title*="Commit Set"]').first()).toBeVisible();
    }

    // Verify navigating to History view
    await page.goto('/history');
    await expect(page.locator('text=Workout History')).toBeVisible();
  });
});


