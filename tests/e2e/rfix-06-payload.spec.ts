import { test, expect } from '@playwright/test';

test.describe('RFIX-06 Payload & Cache Key Disambiguation Verification', () => {
  test.describe.configure({ mode: 'serial' });

  test('Order A: Cold navigation directly to /workout measures <= 51,200 B and asserts limit=100 & order', async ({ page }) => {
    const workoutTplPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/routine_templates') &&
        res.request().method() === 'GET' &&
        res.status() === 200 &&
        !res.url().includes('template_exercises') &&
        res.url().includes('limit=100'),
      { timeout: 10000 }
    );

    await page.goto('/login');
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');

    const response = await workoutTplPromise;
    const body = await response.body();
    const url = response.url();
    const parsedUrl = new URL(url);

    console.log(`[RFIX-06 Order A: Cold /workout]`);
    console.log(`URL: ${url}`);
    console.log(`HTTP Status: ${response.status()}`);
    console.log(`Limit: ${parsedUrl.searchParams.get('limit')}`);
    console.log(`Order: ${parsedUrl.searchParams.get('order')}`);
    console.log(`Select: ${parsedUrl.searchParams.get('select')}`);
    console.log(`Payload Bytes: ${body.length}`);

    expect(response.status()).toBe(200);
    expect(parsedUrl.searchParams.get('limit')).toBe('100');
    expect(parsedUrl.searchParams.get('order')).toBe('created_at.desc');
    expect(parsedUrl.searchParams.get('select')).toBe('id,user_id,name,is_master,assigned_to,days_of_week,created_at');

    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(51200);

    console.log(`VERIFICATION_ORDER_A_BYTES=${body.length}`);
    console.log(`VERIFICATION_ORDER_A_LIMIT=${parsedUrl.searchParams.get('limit')}`);
    console.log(`VERIFICATION_ORDER_A_STATUS=PASS`);
  });

  /**
   * NOTE ON REWRITE (RFIX-22a & P1-6d):
   * Directive RFIX-22 correctly bounded the /exercises routine_templates query with limit(100).
   * P1-6d restored full row coverage on /workout with limit(100) and narrow projection
   * (no nested template_exercises embed on cold paint).
   *
   * This test proves that /workout and /exercises use distinct React Query cache keys
   * (['routine_templates', targetUserId, 'workout'] vs ['routine_templates', targetUserId, 'exercises']).
   * Arriving at /workout from /exercises via client-side navigation must trigger /workout's own
   * query rather than silently reusing /exercises's cached entry.
   *
   * Two distinguishable requests (/exercises with template_exercises vs /workout without template_exercises)
   * being issued across the transition proves cache-key disambiguation.
   */
  test('Order B: Client navigation /exercises -> /workout refetches bounded query <= 51,200 B and asserts projection & order', async ({ page }) => {
    // 1. Authenticate session
    await page.goto('/login');
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');

    // 2. Open /exercises with fresh client cache
    const exercisesTplPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/routine_templates') &&
        res.request().method() === 'GET' &&
        res.status() === 200 &&
        res.url().includes('template_exercises') &&
        res.url().includes('limit=100'),
      { timeout: 10000 }
    );
    await page.goto('/exercises');
    await page.waitForURL('**/exercises');
    const exercisesRes = await exercisesTplPromise;
    const exercisesBody = await exercisesRes.body();
    const exercisesUrl = exercisesRes.url();
    const parsedExercisesUrl = new URL(exercisesUrl);
    const exercisesLimit = parsedExercisesUrl.searchParams.get('limit');
    const exercisesOrder = parsedExercisesUrl.searchParams.get('order');
    const exercisesSelect = parsedExercisesUrl.searchParams.get('select');

    console.log(`[RFIX-06 Order B Step 1: /exercises]`);
    console.log(`URL: ${exercisesUrl}`);
    console.log(`HTTP Status: ${exercisesRes.status()}`);
    console.log(`Limit: ${exercisesLimit}`);
    console.log(`Order: ${exercisesOrder}`);
    console.log(`Payload Bytes: ${exercisesBody.length}`);

    expect(exercisesRes.status()).toBe(200);
    expect(exercisesLimit).toBe('100');
    expect(exercisesOrder).toBe('created_at.desc');
    expect(exercisesSelect).toContain('template_exercises');
    expect(exercisesBody.length).toBeGreaterThan(51200);
    console.log(`VERIFICATION_ORDER_B_EXERCISES_BYTES=${exercisesBody.length}`);

    // Wait for bottom navigation
    await expect(page.locator('[data-testid="nav-workout"]')).toBeVisible();

    // 3. Navigate client-side to /workout
    // Because cache keys are disambiguated, /workout MUST issue its own bounded request
    // and cannot silently swallow or inherit the /exercises cache entry.
    const workoutTplPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/routine_templates') &&
        res.request().method() === 'GET' &&
        res.status() === 200 &&
        !res.url().includes('template_exercises') &&
        res.url().includes('limit=100'),
      { timeout: 6000 }
    );

    await page.click('[data-testid="nav-workout"]');
    await page.waitForURL('**/workout');

    const workoutRes = await workoutTplPromise;
    const workoutBody = await workoutRes.body();
    const workoutUrl = workoutRes.url();
    const parsedWorkoutUrl = new URL(workoutUrl);
    const workoutLimit = parsedWorkoutUrl.searchParams.get('limit');
    const workoutOrder = parsedWorkoutUrl.searchParams.get('order');
    const workoutSelect = parsedWorkoutUrl.searchParams.get('select');

    console.log(`[RFIX-06 Order B Step 2: /exercises -> /workout]`);
    console.log(`URL: ${workoutUrl}`);
    console.log(`HTTP Status: ${workoutRes.status()}`);
    console.log(`Limit: ${workoutLimit}`);
    console.log(`Order: ${workoutOrder}`);
    console.log(`Payload Bytes: ${workoutBody.length}`);

    expect(workoutRes.status()).toBe(200);
    expect(workoutLimit).toBe('100');
    expect(workoutOrder).toBe('created_at.desc');
    expect(workoutSelect).toBe('id,user_id,name,is_master,assigned_to,days_of_week,created_at');

    expect(workoutBody.length).toBeGreaterThan(0);
    expect(workoutBody.length).toBeLessThanOrEqual(51200);

    // 4 & 5. Explicitly assert the two requests are distinguishable
    // /exercises requested nested template_exercises and /workout requested narrow projection
    expect(exercisesSelect).not.toBe(workoutSelect);
    expect(exercisesSelect).toContain('template_exercises');
    expect(workoutSelect).not.toContain('template_exercises');

    console.log(`VERIFICATION_ORDER_B_EXERCISES_LIMIT=${exercisesLimit}`);
    console.log(`VERIFICATION_ORDER_B_WORKOUT_LIMIT=${workoutLimit}`);
    console.log(`VERIFICATION_ORDER_B_WORKOUT_BYTES=${workoutBody.length}`);
    console.log(`VERIFICATION_ORDER_B_STATUS=PASS`);
  });
});
