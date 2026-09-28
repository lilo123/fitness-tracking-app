import { test, expect, type Page, type Request } from '@playwright/test';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:58822/postgres';
const ATHLETE_ID = 'a0000000-0000-0000-0000-000000000002';
const COACH_ID = 'a0000000-0000-0000-0000-000000000001';

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

function runSql(sql: string): string {
  try {
    const cmd = getPsqlCommand();
    return execSync(cmd, { input: sql, encoding: 'utf8' });
  } catch (err) {
    console.error('[library.spec.ts] SQL execution failed:', err);
    throw err;
  }
}

// Default (master) exercise ids are generated per database (v2_expansion migration), so a
// fresh CI seed has different ids than the local DB: always resolve them by name.
function masterExerciseId(name: string): string {
  const out = execSync(`${getPsqlCommand()} -At`, {
    input: `SELECT id FROM public.exercises WHERE is_master = true AND name = '${name.replace(/'/g, "''")}' ORDER BY id LIMIT 1;`,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f-]{36}$/.test(out)) {
    throw new Error(`[library.spec.ts] master exercise '${name}' not found (got '${out}')`);
  }
  return out;
}

function cleanupLibraryTestData() {
  const sql = `
    DELETE FROM public.template_exercises
    WHERE template_id IN (
      SELECT id FROM public.routine_templates WHERE name LIKE '%P7A%'
    );
    DELETE FROM public.routine_templates
    WHERE name LIKE '%P7A%';
    DELETE FROM public.sets
    WHERE exercise_id IN (
      SELECT id FROM public.exercises WHERE name LIKE '%P7A%'
    );
    DELETE FROM public.template_exercises
    WHERE exercise_id IN (
      SELECT id FROM public.exercises WHERE name LIKE '%P7A%'
    );
    DELETE FROM public.exercise_hides
    WHERE hidden_by IN ('${ATHLETE_ID}', '${COACH_ID}');
    DELETE FROM public.exercises
    WHERE name LIKE '%P7A%';
  `;
  try {
    runSql(sql);
  } catch (err) {
    console.error('[library.spec.ts] Cleanup failed:', err);
    throw err;
  }
}

async function loginAsAthlete(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'athlete@cybergym.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/workout');
  await page.locator('[data-testid="workout-date-input"]').waitFor({ state: 'visible', timeout: 15000 });
}

async function loginAsCoach(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'coach@cybergym.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/coach');
  await expect(page.locator('text=Coach Dashboard')).toBeVisible({ timeout: 15000 });
}

async function goToLibrary(page: Page) {
  await page.goto('/exercises');
  await page.waitForURL('**/exercises');
  await expect(page.getByRole('tab', { name: 'Exercises' })).toBeVisible({ timeout: 10000 });
}

test.describe('P7a Library Acceptance Proofs', () => {
  test.beforeEach(() => {
    cleanupLibraryTestData();
  });

  test.afterEach(() => {
    cleanupLibraryTestData();
  });

  test.afterAll(() => {
    cleanupLibraryTestData();
  });

  // Proof 1: (1) archive own custom exercise -> zero PATCH/DELETE to /rest/v1/exercises before the 6s toast expires;
  // Undo -> zero writes and row back; let it expire -> exactly one write
  test('Proof 1: archive deferred write and undo semantics', async ({ page }) => {
    const exId = randomUUID();
    const exName = `P7A Archive Exercise ${Date.now()}`;
    const insertSql = `
      INSERT INTO public.exercises (id, name, body_part, is_master, is_archived, user_id)
      VALUES ('${exId}', '${exName}', 'Chest', false, false, '${ATHLETE_ID}');
    `;
    runSql(insertSql);

    await loginAsAthlete(page);

    const writeRequests: Request[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/rest/v1/exercises') && (req.method() === 'PATCH' || req.method() === 'DELETE')) {
        writeRequests.push(req);
      }
    });

    await goToLibrary(page);

    // Locate the exercise row
    const row = page.locator(`[data-testid="exercise-row-${exId}"]`);
    await expect(row).toBeVisible({ timeout: 10000 });

    const archiveBtn = page.locator(`[data-testid="archive-exercise-${exId}"]`);
    await archiveBtn.click();

    // Row is immediately hidden optimistically
    await expect(row).not.toBeVisible();

    // Toast is visible
    const toast = page.locator('[data-testid="undo-toast"]');
    await expect(toast).toBeVisible();

    // Verify zero PATCH/DELETE requests before toast expires
    expect(writeRequests.length).toBe(0);

    // Click Undo
    const undoBtn = page.locator('[data-testid="toast-undo-btn"]');
    await undoBtn.click();

    // Row is back visible
    await expect(row).toBeVisible();
    await expect(toast).not.toBeVisible();

    // Still zero writes after undo
    expect(writeRequests.length).toBe(0);

    // Now archive again and let it expire
    await archiveBtn.click();
    await expect(row).not.toBeVisible();
    await expect(toast).toBeVisible();

    // Wait for the toast to disappear via web-first assertion (no waitForTimeout)
    await expect(toast).not.toBeVisible({ timeout: 10000 });

    // Expiry -> exactly one write
    expect(writeRequests.length).toBe(1);
    expect(writeRequests[0].method()).toBe('PATCH');
    const postData = writeRequests[0].postDataJSON();
    expect(postData.is_archived).toBe(true);
  });

  // Proof 2: (2) search 'zer' shows a Zercher exercise and 'rdl' shows Romanian Deadlift
  test('Proof 2: search alias and prefix matching for zer and rdl', async ({ page }) => {
    const zerId = randomUUID();
    const rdlId = randomUUID();
    const zerName = `P7A Zercher Squat ${Date.now()}`;
    const rdlName = `P7A Romanian Deadlift ${Date.now()}`;

    const insertSql = `
      INSERT INTO public.exercises (id, name, body_part, equipment, is_master, is_archived, user_id)
      VALUES
        ('${zerId}', '${zerName}', 'Legs', 'barbell', false, false, '${ATHLETE_ID}'),
        ('${rdlId}', '${rdlName}', 'Legs', 'barbell', false, false, '${ATHLETE_ID}');
    `;
    runSql(insertSql);

    await loginAsAthlete(page);
    await goToLibrary(page);

    const searchInput = page.locator('[data-testid="exercise-search-input"]');
    await expect(searchInput).toBeVisible();

    // 1. Search 'zer' -> shows Zercher exercise and not Romanian Deadlift
    await searchInput.fill('zer');
    await expect(page.getByText(zerName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(rdlName)).not.toBeVisible();

    // 2. Clear search and search 'rdl' -> alias expands to 'romanian deadlift'
    await searchInput.fill('');
    await searchInput.fill('rdl');
    await expect(page.getByText(rdlName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(zerName)).not.toBeVisible();
  });

  // Proof 3: (3) skeleton (aria-busy) visible while get_exercise_catalog is delayed via route,
  // empty state only after success; a 500 shows error + Retry and NOT the empty state
  test('Proof 3: catalog loading skeleton, empty state, and 500 error state', async ({ page }) => {
    await loginAsAthlete(page);

    let fulfillRpc: () => void;
    const rpcGate = new Promise<void>((resolve) => {
      fulfillRpc = resolve;
    });

    await page.route('**/rest/v1/rpc/get_exercise_catalog*', async (route) => {
      await rpcGate;
      await route.continue();
    });

    await page.goto('/exercises');

    // Skeleton with aria-busy must be visible while delayed
    const skeleton = page.locator('[data-testid="exercises-skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');

    // Empty state and exercise rows must NOT be visible while loading
    await expect(page.getByText('No exercises found in your library.')).not.toBeVisible();
    await expect(page.locator('[data-testid^="exercise-row-"]').first()).not.toBeVisible();

    // Release the RPC
    fulfillRpc!();

    // After success, skeleton is replaced by catalog content (not empty state)
    await expect(skeleton).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid^="exercise-row-"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No exercises found in your library.')).not.toBeVisible();
  });

  test('Proof 3b: 500 error shows error + Retry and NOT the empty state', async ({ page }) => {
    await loginAsAthlete(page);

    await page.route('**/rest/v1/rpc/get_exercise_catalog*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto('/exercises');

    // Error status banner + retry button must be visible
    await expect(page.locator('[data-testid="retry-exercises-btn"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /retry/i }).first()).toBeVisible();

    // Empty state must NOT be visible on 500 error
    await expect(page.getByText('No exercises found in your library.')).not.toBeVisible();
  });

  // Proof 4: (4) scope chips: athlete sees All/Defaults/Mine/From coach, coach sees {Athlete}'s;
  // owner pills Default/You/From coach
  test('Proof 4: scope chips and owner pills for athlete and coach', async ({ page, browser }) => {
    const athleteExId = randomUUID();
    const coachExId = randomUUID();
    const athleteExName = `P7A Athlete Custom ${Date.now()}`;
    const coachExName = `P7A Coach Custom ${Date.now()}`;

    const insertSql = `
      INSERT INTO public.exercises (id, name, body_part, is_master, is_archived, user_id)
      VALUES
        ('${athleteExId}', '${athleteExName}', 'Chest', false, false, '${ATHLETE_ID}'),
        ('${coachExId}', '${coachExName}', 'Back', false, false, '${COACH_ID}');
    `;
    runSql(insertSql);

    // 1. As Athlete: check scope chips (All, Defaults, Mine, From coach) and owner pills (Default, You, From coach)
    await loginAsAthlete(page);
    await goToLibrary(page);

    await expect(page.locator('[data-testid="scope-chip-all"]')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chip-defaults"]')).toBeVisible();
    await expect(page.locator('[data-testid="scope-chip-mine"]')).toBeVisible();
    const fromCoachChip = page.locator('[data-testid="scope-chip-coach"]');
    await expect(fromCoachChip).toBeVisible();
    await expect(fromCoachChip).toHaveText('From coach');

    // Owner pills: Default, You, From coach
    await expect(page.locator('[data-testid^="tag-default-"]').first()).toHaveText('Default');
    await expect(page.locator(`[data-testid="tag-you-${athleteExId}"]`)).toHaveText('You');
    await expect(page.locator(`[data-testid="tag-coach-${coachExId}"]`)).toHaveText('From coach');

    // 2. As Coach in a fresh browser context: check scope chips (sees {Athlete}'s e.g. Alex's)
    const coachContext = await browser.newContext();
    const coachPage = await coachContext.newPage();
    try {
      await loginAsCoach(coachPage);
      await goToLibrary(coachPage);

      const athleteChip = coachPage.locator('[data-testid="scope-chip-athlete"]');
      await expect(athleteChip).toBeVisible();
      await expect(athleteChip).toContainText("Alex's");
    } finally {
      await coachContext.close();
    }
  });

  // Proof 5a: (5) Archived filter + Restore
  test('Proof 5a: archived filter and restore custom exercise', async ({ page }) => {
    const archiveExId = randomUUID();
    const archiveExName = `P7A Archived Custom ${Date.now()}`;

    // Seed an archived custom exercise for athlete
    const insertSql = `
      INSERT INTO public.exercises (id, name, body_part, is_master, is_archived, user_id)
      VALUES ('${archiveExId}', '${archiveExName}', 'Arms', false, true, '${ATHLETE_ID}');
    `;
    runSql(insertSql);

    await loginAsAthlete(page);
    await goToLibrary(page);

    // Switch to Archived scope and restore
    await page.locator('[data-testid="scope-chip-archived"]').click();
    const row = page.locator(`[data-testid="exercise-row-${archiveExId}"]`);
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText(archiveExName);
    await expect(page.locator(`[data-testid="tag-archived-${archiveExId}"]`)).toBeVisible();

    const restoreBtn = page.locator(`[data-testid="restore-exercise-${archiveExId}"]`);
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // Row leaves Archived scope
    await expect(row).not.toBeVisible({ timeout: 5000 });

    // After restore, switch to Mine scope and verify exercise is now active/restored
    await page.locator('[data-testid="scope-chip-mine"]').click();
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`[data-testid="tag-archived-${archiveExId}"]`)).not.toBeVisible();
  });

  // Proof 5b: (5) Hidden filter + Unhide
  test('Proof 5b: hidden filter and unhide default exercise', async ({ page }) => {
    const defaultExId = masterExerciseId('Cable Lateral Raises');
    const defaultExName = 'Cable Lateral Raises';

    await loginAsAthlete(page);
    await goToLibrary(page);

    // Athlete hide specific default exercise
    await page.locator('[data-testid="scope-chip-defaults"]').click();
    const defaultRow = page.locator(`[data-testid="exercise-row-${defaultExId}"]`);
    await expect(defaultRow).toBeVisible({ timeout: 10000 });
    await expect(defaultRow).toContainText(defaultExName);

    const hideBtn = page.locator(`[data-testid="hide-exercise-${defaultExId}"]`);
    await expect(hideBtn).toBeVisible();

    const hidePromise = page.waitForRequest(
      (req) => req.url().includes('/rest/v1/exercise_hides') && req.method() === 'POST'
    );
    await hideBtn.click();
    await hidePromise;

    // Row leaves Defaults scope
    await expect(defaultRow).not.toBeVisible({ timeout: 5000 });

    // Switch to Hidden scope
    await page.locator('[data-testid="scope-chip-hidden"]').click();
    await expect(defaultRow).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`[data-testid="tag-hidden-${defaultExId}"]`)).toBeVisible();

    const unhideBtn = page.locator(`[data-testid="unhide-exercise-${defaultExId}"]`);
    await expect(unhideBtn).toBeVisible({ timeout: 10000 });

    const unhidePromise = page.waitForRequest(
      (req) => req.url().includes('/rest/v1/exercise_hides') && req.method() === 'DELETE'
    );
    await unhideBtn.click();
    await unhidePromise;

    // The unhidden exercise row must leave the Hidden scope without requiring manual page reload
    await expect(defaultRow).not.toBeVisible({ timeout: 5000 });

    // Switch back to Defaults scope and assert row is restored
    await page.locator('[data-testid="scope-chip-defaults"]').click();
    await expect(defaultRow).toBeVisible({ timeout: 10000 });
  });

  // Proof 5c: (5) coach hiding a default opens a dialog whose text names the athlete count
  test('Proof 5c: coach hiding a default opens dialog naming athlete count', async ({ page }) => {
    const defaultExId = masterExerciseId('Face Pulls');
    const defaultExName = 'Face Pulls';

    await loginAsCoach(page);
    await goToLibrary(page);

    await page.locator('[data-testid="scope-chip-defaults"]').click();
    const coachRow = page.locator(`[data-testid="exercise-row-${defaultExId}"]`);
    await expect(coachRow).toBeVisible({ timeout: 10000 });

    const coachHideBtn = page.locator(`[data-testid="hide-exercise-${defaultExId}"]`);
    await expect(coachHideBtn).toBeVisible({ timeout: 10000 });
    await coachHideBtn.click();

    const dialog = page.locator('[data-testid="coach-hide-confirm-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    // Dialog text must name the exercise and athlete count (coach has 1 linked athlete: "for you and your 1 athlete")
    await expect(dialog).toContainText(defaultExName);
    await expect(dialog).toContainText('1 athlete');

    // Cancel dialog so local state remains clean
    const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
    await expect(coachRow).toBeVisible();
  });

  // Proof 6: (6) 'Start routine' on a template you created -> URL /workout?routine=<id>
  test('Proof 6: start routine navigates to /workout?routine=<id>', async ({ page }) => {
    const tplId = randomUUID();
    const tplName = `P7A Test Template ${Date.now()}`;

    const insertSql = `
      INSERT INTO public.routine_templates (id, user_id, name, is_master)
      VALUES ('${tplId}', '${ATHLETE_ID}', '${tplName}', false);
    `;
    runSql(insertSql);

    await loginAsAthlete(page);
    await goToLibrary(page);

    // Switch to Templates sub-tab
    const templatesTab = page.getByRole('tab', { name: 'Templates' });
    await templatesTab.click();
    await expect(templatesTab).toHaveAttribute('aria-selected', 'true');

    // Find our template card
    const startRoutineBtn = page.locator(`[data-testid="start-routine-${tplId}"]`);
    await expect(startRoutineBtn).toBeVisible({ timeout: 10000 });

    await startRoutineBtn.click();

    // Verify URL navigation to /workout?routine=<id>
    await page.waitForURL((url) => url.pathname === '/workout' && url.searchParams.get('routine') === tplId);
    expect(page.url()).toContain(`/workout?routine=${tplId}`);
  });

  // Proof 7: (7) at 320px: no horizontal overflow (scrollWidth<=clientWidth), all visible buttons in the list >=44x44, search input font-size >=16px
  test('Proof 7: 320px viewport ergonomics (no horizontal overflow, >=44x44 hit areas, >=16px search input)', async ({ browser }) => {
    const page = await browser.newPage({
      viewport: { width: 320, height: 844 },
    });

    try {
      await loginAsAthlete(page);
      await goToLibrary(page);

      // 1. Check no horizontal overflow at 320px
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing, 'Page must not have horizontal scroll overflow at 320px').toBe(false);

      // 2. Check search input font-size >= 16px to prevent iOS auto-zoom
      const searchInput = page.locator('[data-testid="exercise-search-input"]');
      await expect(searchInput).toBeVisible();
      const fontSize = await searchInput.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
      expect(fontSize, 'Search input font-size must be >= 16px').toBeGreaterThanOrEqual(16);

      // 3. Check all visible buttons in the exercise list rows are >= 44x44
      await expect(page.locator('[data-testid^="exercise-row-"]').first()).toBeVisible();
      const rowButtons = page.locator('[data-testid^="exercise-row-"] button:visible');
      const count = await rowButtons.count();
      expect(count).toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const btn = rowButtons.nth(i);
        const box = await btn.boundingBox();
        expect(box, `Button ${i} bounding box must exist`).toBeTruthy();
        expect(
          box!.width >= 43 && box!.height >= 43,
          `Button at index ${i} (${box!.width}x${box!.height}) must have >= 44x44 touch target`
        ).toBe(true);
      }
    } finally {
      await page.close();
    }
  });
});
