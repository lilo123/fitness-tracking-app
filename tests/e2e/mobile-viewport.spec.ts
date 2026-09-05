import { test, expect } from '@playwright/test';

test.describe('Mobile Viewport & Ergonomics', () => {
  test('has correct viewport meta tag with viewport-fit=cover and no user-scalable=no', async ({ page }) => {
    await page.goto('/login');
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1.0, viewport-fit=cover'
    );
  });

  test('prevents horizontal scroll overflow on mobile', async ({ page }) => {
    await page.goto('/login');
    // Quick login via demo athlete
    await page.click('button:has-text("Demo Athlete")');
    await page.waitForURL('**/workout');

    // Check no horizontal scrollbar on workout view
    const isOverflowingWorkout = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingWorkout).toBe(false);

    // Navigate to nutrition view
    await page.goto('/nutrition');
    await page.waitForSelector('text=Today\'s Nutrition');

    const isOverflowingNutrition = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingNutrition).toBe(false);
  });

  test('ensures text inputs have >= 16px font size on mobile to prevent iOS auto-zoom', async ({ page, isMobile }) => {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]');
    const emailFontSize = await emailInput.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });

    if (isMobile) {
      expect(emailFontSize).toBeGreaterThanOrEqual(16);
    }

    // Login and check workout inputs
    await page.click('button:has-text("Demo Athlete")');
    await page.waitForURL('**/workout');

    // Check date input font size
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.isVisible()) {
      const dateFontSize = await dateInput.evaluate((el) => {
        return parseFloat(window.getComputedStyle(el).fontSize);
      });
      if (isMobile) {
        expect(dateFontSize).toBeGreaterThanOrEqual(16);
      }
    }
  });
});
