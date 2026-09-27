import { test, expect } from '@playwright/test';

test.describe('RFIX-06 Payload & Cache Key Disambiguation Verification', () => {
  test.describe.configure({ mode: 'serial' });

  // P4 (M4): /workout loads routine templates via the paged RPC get_routine_catalog
  // (keyset cursor, server-clamped limit <= 200) instead of GET routine_templates?limit=100.
  // The payload bound and the "no nested template_exercises embed on /workout" contract are kept.
  test('Order A: Cold navigation directly to /workout measures <= 51,200 B via bounded get_routine_catalog page', async ({ page }) => {
    const legacyWorkoutTplGets: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && req.url().includes('/rest/v1/routine_templates') && !req.url().includes('template_exercises')) {
        legacyWorkoutTplGets.push(req.url());
      }
    });
    const workoutTplPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/rpc/get_routine_catalog') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 10000 }
    );

    await page.goto('/login');
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');

    const response = await workoutTplPromise;
    const body = await response.body();
    const reqBody = response.request().postDataJSON() as { p_limit: number; p_user_id: string; p_cursor: string | null };
    const rows = JSON.parse(body.toString()) as Array<Record<string, unknown>>;

    console.log(`[RFIX-06 Order A: Cold /workout]`);
    console.log(`URL: ${response.url()}`);
    console.log(`HTTP Status: ${response.status()}`);
    console.log(`p_limit: ${reqBody.p_limit}  p_cursor: ${reqBody.p_cursor}`);
    console.log(`Rows: ${rows.length}`);
    console.log(`Payload Bytes: ${body.length}`);

    expect(response.status()).toBe(200);
    expect(reqBody.p_limit).toBeGreaterThan(0);
    expect(reqBody.p_limit).toBeLessThanOrEqual(200);
    expect(reqBody.p_cursor).toBeNull();
    expect(typeof reqBody.p_user_id).toBe('string');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(reqBody.p_limit);
    expect(Object.keys(rows[0])).not.toContain('template_exercises');

    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(51200);
    // The RPC succeeded, so the legacy unpaged fallback query must not have been issued.
    expect(legacyWorkoutTplGets).toEqual([]);

    console.log(`VERIFICATION_ORDER_A_BYTES=${body.length}`);
    console.log(`VERIFICATION_ORDER_A_LIMIT=${reqBody.p_limit}`);
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
    // (P4: the paged get_routine_catalog RPC) and cannot silently inherit the /exercises cache entry.
    const workoutTplPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/rpc/get_routine_catalog') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 6000 }
    );

    await page.click('[data-testid="nav-workout"]');
    await page.waitForURL('**/workout');

    const workoutRes = await workoutTplPromise;
    const workoutBody = await workoutRes.body();
    const workoutUrl = workoutRes.url();
    const workoutReq = workoutRes.request().postDataJSON() as { p_limit: number; p_cursor: string | null };
    const workoutLimit = workoutReq.p_limit;
    const workoutRows = JSON.parse(workoutBody.toString()) as Array<Record<string, unknown>>;

    console.log(`[RFIX-06 Order B Step 2: /exercises -> /workout]`);
    console.log(`URL: ${workoutUrl}`);
    console.log(`HTTP Status: ${workoutRes.status()}`);
    console.log(`p_limit: ${workoutLimit}`);
    console.log(`Rows: ${workoutRows.length}`);
    console.log(`Payload Bytes: ${workoutBody.length}`);

    expect(workoutRes.status()).toBe(200);
    expect(workoutLimit).toBeGreaterThan(0);
    expect(workoutLimit).toBeLessThanOrEqual(200);
    expect(workoutReq.p_cursor).toBeNull();
    expect(workoutRows.length).toBeGreaterThan(0);
    expect(workoutRows.length).toBeLessThanOrEqual(workoutLimit);

    expect(workoutBody.length).toBeGreaterThan(0);
    expect(workoutBody.length).toBeLessThanOrEqual(51200);

    // 4 & 5. Explicitly assert the two requests are distinguishable
    // /exercises requested nested template_exercises via REST; /workout used the catalog RPC without that embed
    expect(exercisesSelect).toContain('template_exercises');
    expect(workoutUrl).not.toContain('template_exercises');
    expect(Object.keys(workoutRows[0])).not.toContain('template_exercises');

    console.log(`VERIFICATION_ORDER_B_EXERCISES_LIMIT=${exercisesLimit}`);
    console.log(`VERIFICATION_ORDER_B_WORKOUT_LIMIT=${workoutLimit}`);
    console.log(`VERIFICATION_ORDER_B_WORKOUT_BYTES=${workoutBody.length}`);
    console.log(`VERIFICATION_ORDER_B_STATUS=PASS`);
  });
});
