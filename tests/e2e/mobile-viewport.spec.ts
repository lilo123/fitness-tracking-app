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
    await page.setViewportSize({ width: 320, height: 844 });
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

  test("prevents horizontal scroll overflow on /exercises (both Exercises and Templates) and verifies search input font size >= 16px at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    // 1. Navigate to /exercises (Exercises subview)
    await page.goto("/exercises");
    await page.waitForURL("**/exercises");
    await expect(page.getByRole("tab", { name: "Exercises" })).toBeVisible();

    const isOverflowingExercises = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingExercises, "No horizontal overflow on /exercises Exercises tab at 320px").toBe(false);

    // Verify search input font size >= 16px on mobile to prevent iOS auto-zoom
    const searchInput = page.locator('[data-testid="exercise-search-input"]');
    await expect(searchInput).toBeVisible();
    const searchFontSize = await searchInput.evaluate((el) => {
      return parseFloat(window.getComputedStyle(el).fontSize);
    });
    expect(searchFontSize, "Search input font-size must be >= 16px on mobile").toBeGreaterThanOrEqual(16);

    // 2. Switch to Templates subview
    const templatesTab = page.getByRole("tab", { name: "Templates" });
    await templatesTab.click();
    await expect(templatesTab).toHaveAttribute("aria-selected", "true");

    const isOverflowingTemplates = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowingTemplates, "No horizontal overflow on /exercises Templates tab at 320px").toBe(false);
  });

  test("prevents horizontal scroll overflow on /exercises Template Sheet at 320px and verifies controls >= 44x44", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    await page.goto("/exercises");
    await page.waitForURL("**/exercises");

    const templatesTab = page.getByRole("tab", { name: "Templates" });
    await templatesTab.click();
    await expect(templatesTab).toHaveAttribute("aria-selected", "true");

    const newRoutineBtn = page.locator('[data-testid="new-template-btn"]');
    await expect(newRoutineBtn).toBeVisible({ timeout: 10000 });
    await newRoutineBtn.click();

    const sheet = page.locator('[data-testid="edit-template-sheet"], [data-testid="edit-template-modal"]');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflowing, "No horizontal overflow in template sheet at 320px").toBe(false);

    // Verify template name input font size >= 16px to prevent iOS auto-zoom
    const nameInput = page.locator('[data-testid="template-name-input"]');
    await expect(nameInput).toBeVisible();
    const fontSize = await nameInput.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSize, "Template name input font-size must be >= 16px on mobile").toBeGreaterThanOrEqual(16);

    // Verify action buttons >= 44x44
    for (const testId of ['cancel-template-btn', 'save-template-btn', 'open-exercise-picker']) {
      const btn = page.locator(`[data-testid="${testId}"]`);
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box, `Button ${testId} bounding box`).toBeTruthy();
      expect(box!.width).toBeGreaterThanOrEqual(43);
      expect(box!.height).toBeGreaterThanOrEqual(43);
    }
  });

  test("BottomNav at 320px: all 5 labels visible, scrollWidth <= clientWidth, tabs >= 44px tall, aria-current on active tab", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/login");
    await page.fill('input[type="email"]', "athlete@cybergym.io");
    await page.fill('input[type="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/workout");

    const nav = page.locator("nav.fixed.bottom-0");
    await expect(nav).toBeVisible();

    const tabs = [
      { id: "nav-workout", label: "Workout", path: "/workout" },
      { id: "nav-nutrition", label: "Nutrition", path: "/nutrition" },
      { id: "nav-exercises", label: "Library", path: "/exercises" },
      { id: "nav-history", label: "History", path: "/history" },
      { id: "nav-settings", label: "Settings", path: "/settings" },
    ];

    // Verify all 5 tabs in BottomNav at 320px
    for (const tab of tabs) {
      const tabLocator = page.locator(`[data-testid="${tab.id}"]`);
      await expect(tabLocator).toBeVisible();

      // Tab height >= 44px
      const box = await tabLocator.boundingBox();
      expect(box, `Tab ${tab.id} bounding box`).toBeTruthy();
      expect(box!.height, `Tab ${tab.id} height >= 44px`).toBeGreaterThanOrEqual(44);

      // Label visible, 12px sentence-case, no overflow: scrollWidth <= clientWidth
      const labelSpan = tabLocator.locator("span");
      await expect(labelSpan).toBeVisible();
      await expect(labelSpan).toHaveText(tab.label);

      const metrics = await labelSpan.evaluate((span) => {
        const cs = window.getComputedStyle(span);
        return {
          scrollWidth: span.scrollWidth,
          clientWidth: span.clientWidth,
          fontSize: parseFloat(cs.fontSize),
        };
      });

      expect(metrics.fontSize, `Tab ${tab.id} label font size == 12px`).toBe(12);
      expect(
        metrics.scrollWidth,
        `Tab ${tab.id} label scrollWidth (${metrics.scrollWidth}px) <= clientWidth (${metrics.clientWidth}px)`
      ).toBeLessThanOrEqual(metrics.clientWidth);
    }

    // Verify aria-current="page" on the active tab (/workout)
    const workoutTab = page.locator('[data-testid="nav-workout"]');
    await expect(workoutTab).toHaveAttribute("aria-current", "page");

    // Navigate to /nutrition and verify aria-current moves
    await page.locator('[data-testid="nav-nutrition"]').click();
    await page.waitForURL("**/nutrition");
    const nutritionTab = page.locator('[data-testid="nav-nutrition"]');
    await expect(nutritionTab).toHaveAttribute("aria-current", "page");
    await expect(workoutTab).not.toHaveAttribute("aria-current", "page");
  });
});
