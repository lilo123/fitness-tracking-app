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
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
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
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
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

  test("prevents horizontal scroll overflow on /history (both By Session and By Exercise)", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    // 1. Navigate to /history (By Session view)
    await page.goto("/history");
    await page.waitForURL("**/history");
    await expect(page.getByRole("heading", { name: "Workout History" })).toBeVisible();

    const isOverflowingSession = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingSession, "No horizontal overflow on /history By Session").toBe(false);

    // 2. Switch to By Exercise view
    const exerciseTab = page.locator('[data-testid="history-subview-exercise"]');
    await exerciseTab.click();
    await expect(page.locator('[data-testid="all-time-stats-caption"]')).toBeVisible();

    const isOverflowingExercise = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingExercise, "No horizontal overflow on /history By Exercise").toBe(false);
  });

  test("prevents horizontal scroll overflow on /history with open sheets and nutrition timeline", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    await page.goto("/history");
    await page.waitForURL("**/history");
    await expect(page.getByRole("heading", { name: "Workout History" })).toBeVisible();

    // 1. Calendar sheet open
    const openCalendarBtn = page.locator('[data-testid="open-calendar-btn"]');
    await openCalendarBtn.click();
    const calendarSheet = page.locator('[data-testid="history-calendar-sheet"]');
    await expect(calendarSheet).toBeVisible();

    const isOverflowingCalendar = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingCalendar, "No horizontal overflow with Calendar sheet open").toBe(false);

    await page.keyboard.press("Escape");
    await expect(calendarSheet).not.toBeVisible();

    // 2. Exercise sheet open
    const exerciseTab = page.locator('[data-testid="history-subview-exercise"]');
    await exerciseTab.click();
    await expect(page.locator('[data-testid="all-time-stats-caption"]')).toBeVisible();

    const exerciseCard = page.locator('[data-testid^="exercise-card-"]').first();
    await expect(exerciseCard).toBeVisible();
    await exerciseCard.click();

    const exerciseSheet = page.locator('[data-testid="exercise-history-sheet"]');
    await expect(exerciseSheet).toBeVisible();

    const isOverflowingExerciseSheet = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingExerciseSheet, "No horizontal overflow with Exercise sheet open").toBe(false);

    await page.keyboard.press("Escape");
    await expect(exerciseSheet).not.toBeVisible();

    // 3. Nutrition timeline
    const nutritionTab = page.locator('[data-testid="history-tab-nutrition"]');
    await nutritionTab.click();
    await expect(nutritionTab).toHaveAttribute("aria-selected", "true");

    const isOverflowingNutrition = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingNutrition, "No horizontal overflow on /history Nutrition timeline").toBe(false);
  });

  test("prevents horizontal scroll overflow on Settings with WeightUnitCard and /workout in kg mode", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    // 1. Navigate to /settings and verify WeightUnitCard has no horizontal overflow
    await page.goto("/settings");
    await page.waitForURL("**/settings");
    const card = page.locator('fieldset[aria-label="Weight unit"]').locator('xpath=ancestor::div[contains(@class, "rounded-3xl")][1]');
    await expect(card).toBeVisible();

    const isCardOverflowing = await card.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(isCardOverflowing, "WeightUnitCard has no horizontal overflow").toBe(false);

    // Switch to kg
    const kgBtn = page.locator('[data-testid="weight-unit-kg"]');
    await kgBtn.click();
    await expect(kgBtn).toHaveAttribute("aria-pressed", "true");

    try {
      // 2. Navigate to /workout in kg mode and verify no horizontal overflow
      await page.goto("/workout");
      await page.waitForURL("**/workout");

      const isOverflowingWorkoutKg = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowingWorkoutKg, "No horizontal overflow on /workout in kg mode").toBe(false);
    } finally {
      // Revert athlete back to lb
      await page.goto("/settings");
      await page.waitForURL("**/settings");
      const lbBtn = page.locator('[data-testid="weight-unit-lb"]');
      await lbBtn.click();
      await expect(lbBtn).toHaveAttribute("aria-pressed", "true");
    }
  });
});
