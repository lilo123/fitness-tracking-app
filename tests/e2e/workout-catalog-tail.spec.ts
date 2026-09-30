import { execSync } from 'child_process';
import { test, expect } from '@playwright/test';

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:58822/postgres';

function getPsqlCommand(): string {
  if (process.env.DATABASE_URL) {
    let parsed: URL;
    try {
      parsed = new URL(process.env.DATABASE_URL);
    } catch {
      return `psql "${process.env.DATABASE_URL}" -v ON_ERROR_STOP=1`;
    }
    if (
      (parsed.port && parsed.port !== '58822') ||
      (parsed.hostname && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
    ) {
      return `psql -h "${parsed.hostname}" -p "${parsed.port || '5432'}" -U "${parsed.username || 'postgres'}" -d "${parsed.pathname.slice(1) || 'postgres'}" -v ON_ERROR_STOP=1`;
    }
  }
  return `psql "${DB_URL}" -v ON_ERROR_STOP=1`;
}

function cleanupPollutedWorkouts() {
  const sql = `
    DELETE FROM public.sets
    WHERE workout_id IN (
      SELECT id FROM public.workouts
      WHERE user_id = (SELECT id FROM public.users WHERE email = 'athlete@cybergym.io')
        AND name <> 'Push Day Benchmark'
    );
    DELETE FROM public.workouts
    WHERE user_id = (SELECT id FROM public.users WHERE email = 'athlete@cybergym.io')
      AND name <> 'Push Day Benchmark';
  `;
  try {
    const cmd = getPsqlCommand();
    execSync(cmd, { input: sql, encoding: 'utf8' });
  } catch (err) {
    console.error('[workout-catalog-tail] Error cleaning up workouts:', err);
    throw err;
  }
}

test.describe('Workout Catalog Tail Resolution E2E (Package G)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    cleanupPollutedWorkouts();
  });

  test.afterEach(async () => {
    cleanupPollutedWorkouts();
  });

  test.afterAll(async () => {
    cleanupPollutedWorkouts();
  });

  test('logs sets for catalog-tail exercises "Weighted Sit-Up" and "Zottman Curl" without truncation or UUID resolution error', async ({
    page,
  }) => {
    // 1. Authenticate as athlete
    await page.goto('/login');
    await page.fill('input[type="email"]', 'athlete@cybergym.io');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/workout');
    await page.waitForLoadState('networkidle');

    // Pin the routine: the default routine is weekday-based (Wed/Sat/Sun resolve to
    // Rest Day, which renders no Add Exercise button), so never rely on today's schedule.
    const routineBtn = page.locator('[data-testid="routine-select-btn"]');
    await expect(routineBtn).toBeVisible({ timeout: 15000 });
    await routineBtn.click();
    const routineModal = page.locator('[data-testid="routine-picker-modal"]');
    await expect(routineModal).toBeVisible({ timeout: 5000 });
    await routineModal.locator('button:has-text("Free Workout")').click();
    await expect(routineModal).not.toBeVisible();
    await expect(routineBtn).toContainText('Free Workout');

    // 2. Open exercise picker to add the tail exercises: "Weighted Sit-Up" and "Zottman Curl"
    const addExerciseBtn = page.locator('[data-testid="add-exercise-btn"]');
    const addFirstExerciseBtn = page.locator('[data-testid="add-first-exercise-btn"]');
    await expect(addExerciseBtn.or(addFirstExerciseBtn).first()).toBeVisible({ timeout: 15000 });

    if (await addFirstExerciseBtn.isVisible()) {
      await addFirstExerciseBtn.click();
    } else {
      await addExerciseBtn.click();
    }

    const pickerSheet = page.locator('[data-testid="exercise-picker-sheet"]');
    await expect(pickerSheet).toBeVisible();

    const searchInput = page.locator('[data-testid="exercise-search-input"]');

    // Search and select "Weighted Sit-Up"
    await searchInput.fill('Weighted');
    const weightedSitUpRow = page
      .locator('[data-testid^="exercise-row-"]')
      .filter({ hasText: 'Weighted Sit-Up' })
      .first();
    await expect(weightedSitUpRow).toBeVisible({ timeout: 10000 });
    const weightedAlreadyAdded = await weightedSitUpRow.locator('text=Added').isVisible();
    if (!weightedAlreadyAdded) {
      await weightedSitUpRow.click();
    }

    // Search and select "Zottman Curl"
    await searchInput.fill('Zottman');
    const zottmanCurlRow = page
      .locator('[data-testid^="exercise-row-"]')
      .filter({ hasText: 'Zottman Curl' })
      .first();
    await expect(zottmanCurlRow).toBeVisible({ timeout: 10000 });
    const zottmanAlreadyAdded = await zottmanCurlRow.locator('text=Added').isVisible();
    if (!zottmanAlreadyAdded) {
      await zottmanCurlRow.click();
    }

    // Confirm addition
    const confirmAddBtn = page.locator('[data-testid="picker-confirm-add-btn"]');
    if (await confirmAddBtn.isEnabled()) {
      await confirmAddBtn.click();
    } else {
      await page.locator('[data-testid="exercise-picker-sheet-close-btn"]').click();
    }
    await expect(pickerSheet).not.toBeVisible();

    // 3. Log a set for "Weighted Sit-Up"
    const weightedCard = page
      .locator('[data-card-for-exercise="Weighted Sit-Up"], [data-testid^="exercise-card-"]')
      .filter({ hasText: 'Weighted Sit-Up' })
      .first();
    await expect(weightedCard).toBeVisible({ timeout: 10000 });

    // Expand accordion if not expanded
    const weightedBody = weightedCard.locator('[id^="exercise-card-body-"]');
    if (!(await weightedBody.isVisible())) {
      await weightedCard.locator('button[aria-controls^="exercise-card-body-"]').click();
      await expect(weightedBody).toBeVisible();
    }

    // Fill weight & reps for Weighted Sit-Up set 1
    const weightedWeightInput = weightedCard.locator('input[inputmode="decimal"]').first();
    const weightedRepsInput = weightedCard.locator('input[inputmode="numeric"]').first();
    await weightedWeightInput.fill('25');
    await weightedRepsInput.fill('15');

    const weightedCommitBtn = weightedCard.locator('button[data-testid^="commit-set-btn-"]').first();
    await weightedCommitBtn.click();

    // 4. Log a set for "Zottman Curl"
    const zottmanCard = page
      .locator('[data-card-for-exercise="Zottman Curl"], [data-testid^="exercise-card-"]')
      .filter({ hasText: 'Zottman Curl' })
      .first();
    await expect(zottmanCard).toBeVisible({ timeout: 10000 });

    // Expand accordion if not expanded
    const zottmanBody = zottmanCard.locator('[id^="exercise-card-body-"]');
    if (!(await zottmanBody.isVisible())) {
      await zottmanCard.locator('button[aria-controls^="exercise-card-body-"]').click();
      await expect(zottmanBody).toBeVisible();
    }

    // Fill weight & reps for Zottman Curl set 1
    const zottmanWeightInput = zottmanCard.locator('input[inputmode="decimal"]').first();
    const zottmanRepsInput = zottmanCard.locator('input[inputmode="numeric"]').first();
    await zottmanWeightInput.fill('30');
    await zottmanRepsInput.fill('12');

    const zottmanCommitBtn = zottmanCard.locator('button[data-testid^="commit-set-btn-"]').first();
    await zottmanCommitBtn.click();

    // 5. Assert: both sets successfully logged and NO UUID resolution error appeared
    await expect(page.getByText('cannot be resolved to a valid UUID')).toHaveCount(0);
    await expect(weightedCard.locator('[data-testid^="logged-set-row-"]').first()).toBeVisible({ timeout: 10000 });
    await expect(zottmanCard.locator('[data-testid^="logged-set-row-"]').first()).toBeVisible({ timeout: 10000 });
  });
});
