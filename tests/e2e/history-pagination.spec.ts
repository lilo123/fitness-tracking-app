import { test, expect } from '@playwright/test';

test.describe('RFIX-09 History Pagination Verification', () => {
  test('A user with 151 workouts can reach all 151 distinct sessions from /history', async ({ page }) => {
    // 1. Authenticate as dedicated pagination user
    await page.goto('/login');
    await page.fill('input[type="email"]', 'paginate@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');

    // 2. Navigate to /history
    await page.goto('/history');
    await page.waitForURL('**/history');

    // Wait for initial session list to render
    const initialSession = page.locator('h3:has-text("Paginate Workout")').first();
    await expect(initialSession).toBeVisible({ timeout: 10000 });

    // 3. Repeatedly click "Load More Sessions" until it disappears (with cap to avoid infinite loop)
    const loadMoreBtn = page.locator('[data-testid="load-more-sessions-btn"]');
    const maxClicks = 20;
    let clickCount = 0;

    while (clickCount < maxClicks) {
      const isVisible = await loadMoreBtn.isVisible();
      if (!isVisible) {
        break;
      }
      await loadMoreBtn.click();
      clickCount++;
      // Wait briefly for network fetch and DOM update
      await page.waitForTimeout(400);
    }

    console.log(`[RFIX-09] Total load-more clicks executed: ${clickCount}`);

    // 4. Virtualization-safe distinct session counting:
    // WorkoutSessionHistory virtualizes rows with @tanstack/react-virtual, so
    // only the rows near the viewport exist in the DOM. Scroll through the page
    // and accumulate distinct session identities.
    //
    // Termination must not key off scroll position alone. The previous version
    // stopped after 3 readings where `window.scrollY` had not changed, which
    // fires just as readily when the virtualizer has not yet grown the document
    // as when we have genuinely reached the end — under full-suite load that
    // produced an intermittent 50-of-151 false failure. Stop only when we are
    // demonstrably at the bottom *and* the set has stopped growing.
    const seenSessions = new Set<string>();

    await page.evaluate(() => window.scrollTo(0, 0));

    const maxSteps = 400;
    let lastSize = -1;
    let noGrowthSteps = 0;
    let steps = 0;

    while (steps < maxSteps) {
      steps++;

      const headers = await page.locator('h3').allTextContents();
      for (const h of headers) {
        const title = h.trim();
        if (title.startsWith('Paginate Workout')) {
          seenSessions.add(title);
        }
      }

      if (seenSessions.size === lastSize) {
        noGrowthSteps++;
      } else {
        noGrowthSteps = 0;
        lastSize = seenSessions.size;
      }

      const atBottom = await page.evaluate(
        () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 2
      );

      if (atBottom && noGrowthSteps >= 8) {
        break;
      }

      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(150);
    }

    console.log(`[RFIX-09] Scroll steps taken: ${steps} (cap ${maxSteps})`);

    console.log(`[RFIX-09] Distinct session count reached: ${seenSessions.size}`);
    console.log(`DISTINCT_SESSIONS_COUNT=${seenSessions.size}`);

    // Assert that all 151 seeded workouts are reachable
    expect(seenSessions.size).toBe(151);
  });
});
