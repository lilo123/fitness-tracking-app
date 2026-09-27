import { execSync } from 'child_process';
import { test, expect, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:58821';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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
    console.error('[p4-catalog] Error cleaning up polluted workouts:', err);
  }
}

function cleanupP4Data() {
  const sql = `
    DELETE FROM public.template_exercises
    WHERE template_id IN (
      SELECT id FROM public.routine_templates
      WHERE user_id = (SELECT id FROM public.users WHERE email = 'athlete@cybergym.io')
        AND name LIKE 'P4 Test Routine %'
    );
    DELETE FROM public.routine_templates
    WHERE user_id = (SELECT id FROM public.users WHERE email = 'athlete@cybergym.io')
      AND name LIKE 'P4 Test Routine %';
    DELETE FROM public.sets
    WHERE exercise_id IN (SELECT id FROM public.exercises WHERE name LIKE 'Zercher%');
    DELETE FROM public.template_exercises
    WHERE exercise_id IN (SELECT id FROM public.exercises WHERE name LIKE 'Zercher%');
    DELETE FROM public.exercises
    WHERE name LIKE 'Zercher%';
  `;
  try {
    const cmd = getPsqlCommand();
    execSync(cmd, { input: sql, encoding: 'utf8' });
  } catch (err) {
    console.error('[p4-catalog] Error cleaning up P4 seed data:', err);
  }
  cleanupPollutedWorkouts();
}

async function loginAsAthlete(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'athlete@cybergym.io');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/workout');
  await page.locator('[data-testid="workout-date-input"]').waitFor({ state: 'visible', timeout: 15000 });
}

async function getAthleteSession(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: 'athlete@cybergym.io',
      password: 'password123',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to authenticate athlete: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return { token: json.access_token, userId: json.user.id };
}

async function seedTemplatesViaREST(token: string, userId: string, count = 55) {
  const exRes = await fetch(`${SUPABASE_URL}/rest/v1/exercises?select=id&limit=1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const exercises = await exRes.json();
  const sampleExerciseId = exercises[0]?.id;

  const templates = Array.from({ length: count }, (_, i) => ({
    user_id: userId,
    name: `P4 Test Routine ${String(i + 1).padStart(2, '0')}`,
    is_master: false,
    days_of_week: [],
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/routine_templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(templates),
  });

  if (!res.ok) {
    throw new Error(`Failed to seed routine_templates: ${res.status} ${await res.text()}`);
  }

  const created = await res.json();

  const tpl55 = created.find((t: any) => t.name === 'P4 Test Routine 55');
  if (tpl55 && sampleExerciseId) {
    await fetch(`${SUPABASE_URL}/rest/v1/template_exercises`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        template_id: tpl55.id,
        exercise_id: sampleExerciseId,
        order_index: 0,
        target_sets: 3,
        target_reps: 10,
      }),
    });
  }
}

/**
 * Normalizes dynamic DOM values across test runs and browsers:
 * - UUID strings in data attributes and text
 * - React useId generated internal ids (:r...:)
 * - TanStack Virtualizer dynamic translateY offsets
 * - Measured virtualizer pixel height
 * - Collapses consecutive whitespace characters
 */
function normalizeHtml(html: string): string {
  return html
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
    .replace(/:r[0-9a-z_-]+:/gi, ':id:')
    .replace(/transform:\s*translateY\([^)]+\);?/gi, '')
    .replace(/height:\s*\d+px;?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Baseline outerHTML captured from commit 7597545 (with M4 schema applied)
const BASELINE_LIBRARY_HTML_390 = "<div class=\"space-y-2\"><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Cable Lateral Raises</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Shoulders</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Dips</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Chest / Triceps</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Face Pulls</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Shoulders</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Incline Bench Press</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Chest</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Inclined Bicep Curl</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Arms</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Lat Pull Down</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Back</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Leg Curl</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Legs</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Leg Extension Machine</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Legs</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Leg Raise</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Core</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Overhead Tricep Cable Pull</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Arms</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Seated Cable Row</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Back</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div><div class=\"bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex justify-between items-center text-sm font-medium\"><div><div class=\"text-zinc-100 flex items-center gap-2\"><span>Weighted Sit-Up</span><span class=\"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20\">Master</span></div><div class=\"text-xs text-zinc-500 mt-1\">Core</div></div><div class=\"flex items-center gap-1 shrink-0\"></div></div></div>";
const BASELINE_HISTORY_HTML_390 = "<div class=\"space-y-4\"><div style=\"position: relative; width: 100%; \"><div data-index=\"0\" style=\"position: absolute; top: 0px; left: 0px; width: 100%; \"><div class=\"bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-3\"><div class=\"flex items-center justify-between border-b border-zinc-800 pb-3\"><div><h3 class=\"text-sm font-black text-white\">Push Day Benchmark</h3><div class=\"text-[11px] font-mono text-cyan-400 mt-0.5\">Sep 20</div></div><div class=\"flex items-center gap-3\"><div class=\"text-right\"><div class=\"text-xs font-mono font-bold text-amber-400\">4,440 lbs volume</div><div class=\"text-[10px] text-zinc-500 font-mono\">3 sets completed</div></div><button type=\"button\" aria-expanded=\"true\" aria-label=\"Collapse Push Day Benchmark\" data-testid=\"expand-session-btn-[UUID]\" class=\"min-w-[44px] min-h-[44px] rounded-xl bg-zinc-800/60 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation cursor-pointer\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-chevron-up w-4 h-4\" aria-hidden=\"true\"><path d=\"m18 15-6-6-6 6\"></path></svg></button></div></div><div class=\"space-y-3 pt-1\"><div class=\"bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 space-y-2\"><div class=\"flex items-center justify-between border-b border-zinc-800/60 pb-2\"><div class=\"flex items-center gap-2 min-w-0\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-dumbbell w-3.5 h-3.5 text-cyan-400 shrink-0\" aria-hidden=\"true\"><path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"></path><path d=\"m2.5 21.5 1.4-1.4\"></path><path d=\"m20.1 3.9 1.4-1.4\"></path><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\"></path><path d=\"m9.6 14.4 4.8-4.8\"></path></svg><span class=\"font-extrabold text-white text-xs truncate\">Incline Bench Press</span><span class=\"px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 shrink-0\">Chest</span></div><div class=\"text-[11px] font-mono font-bold text-amber-400/90 shrink-0 ml-2\">4,440 lbs</div></div><div class=\"space-y-1.5\"><div class=\"bg-zinc-900/90 border border-zinc-800/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs\"><div class=\"font-mono text-[11px] text-zinc-400 font-bold\">SET 1</div><div class=\"flex items-center gap-2\"><div class=\"font-mono font-bold text-cyan-300\">185 lbs × 8 reps<span class=\"text-zinc-500 ml-1 text-[10px]\">@8.5</span></div><button type=\"button\" class=\"min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation\" title=\"Edit set\" aria-label=\"Edit set 1 of Incline Bench Press\" data-testid=\"edit-set-btn-[UUID]\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-pen w-3.5 h-3.5\" aria-hidden=\"true\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"></path></svg></button></div></div><div class=\"bg-zinc-900/90 border border-zinc-800/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs\"><div class=\"font-mono text-[11px] text-zinc-400 font-bold\">SET 2</div><div class=\"flex items-center gap-2\"><div class=\"font-mono font-bold text-cyan-300\">185 lbs × 8 reps<span class=\"text-zinc-500 ml-1 text-[10px]\">@9</span></div><button type=\"button\" class=\"min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation\" title=\"Edit set\" aria-label=\"Edit set 2 of Incline Bench Press\" data-testid=\"edit-set-btn-[UUID]\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-pen w-3.5 h-3.5\" aria-hidden=\"true\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"></path></svg></button></div></div><div class=\"bg-zinc-900/90 border border-zinc-800/60 rounded-xl px-2.5 py-1.5 flex items-center justify-between text-xs\"><div class=\"font-mono text-[11px] text-zinc-400 font-bold\">SET 3</div><div class=\"flex items-center gap-2\"><div class=\"font-mono font-bold text-cyan-300\">185 lbs × 8 reps<span class=\"text-zinc-500 ml-1 text-[10px]\">@9.5</span></div><button type=\"button\" class=\"min-w-[44px] min-h-[44px] rounded-lg bg-zinc-800/70 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-300 flex items-center justify-center transition active:scale-95 touch-manipulation\" title=\"Edit set\" aria-label=\"Edit set 3 of Incline Bench Press\" data-testid=\"edit-set-btn-[UUID]\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-pen w-3.5 h-3.5\" aria-hidden=\"true\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"></path></svg></button></div></div></div></div></div></div></div></div></div>";

test.describe('P4 Catalog & E2E Verification (p4-catalog)', () => {
  test.describe.configure({ mode: 'serial' });

  let athleteUserId = '';
  let athleteToken = '';

  test.beforeAll(async () => {
    cleanupP4Data();
    const session = await getAthleteSession();
    athleteUserId = session.userId;
    athleteToken = session.token;
    await seedTemplatesViaREST(athleteToken, athleteUserId, 55);
  });

  test.afterAll(async () => {
    cleanupP4Data();
  });

  // (c) Library + History DOM unchanged by P4 client code at 390px
  test('DOM-diff acceptance: Library and History DOM structure invariance at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAthlete(page);

    // 1. Verify Library (/exercises) DOM structure at 390px matches 7597545 baseline
    await page.goto('/exercises');
    await page.waitForURL('**/exercises');
    await expect(page.locator('h3:has-text("Exercise Library")')).toBeVisible({ timeout: 10000 });

    const libraryCards = page.locator('div.space-y-2 > div[class*="bg-zinc-900/50"]');
    await expect(libraryCards.first()).toBeVisible({ timeout: 10000 });
    const libraryCount = await libraryCards.count();
    expect(libraryCount).toBeGreaterThan(0);

    const libraryListContainer = page.locator('h3:has-text("Exercise Library") ~ div.space-y-2').first();
    const rawLibraryHtml = await libraryListContainer.evaluate((el) => el.outerHTML);
    const normalizedLibraryHtml = normalizeHtml(rawLibraryHtml);

    expect(normalizedLibraryHtml).toBe(BASELINE_LIBRARY_HTML_390);

    // 2. Verify History (/history) Session list DOM structure at 390px matches 7597545 baseline
    await page.goto('/history');
    await page.waitForURL('**/history');

    const sessionCard = page.locator('div.rounded-3xl.p-5.shadow-2xl.space-y-3').first();
    await expect(sessionCard).toBeVisible({ timeout: 10000 });

    const historyContainer = page.locator('div.space-y-4:has(div.rounded-3xl.p-5.shadow-2xl)').first();
    const rawHistoryHtml = await historyContainer.evaluate((el) => el.outerHTML);
    const normalizedHistoryHtml = normalizeHtml(rawHistoryHtml);

    expect(normalizedHistoryHtml).toBe(BASELINE_HISTORY_HTML_390);

    // 3. Verify By-Exercise view is reachable and renders exercise stats without error
    const byExerciseTab = page.locator('button:has-text("By Exercise")');
    await byExerciseTab.click();
    const exerciseSearch = page.locator('input[placeholder*="Search exercise"]');
    await expect(exerciseSearch).toBeVisible({ timeout: 10000 });
    const historyExerciseCards = page.locator('h3:has-text("Incline Bench Press"), h3:has-text("Cable Lateral Raises")');
    await expect(historyExerciseCards.first()).toBeVisible({ timeout: 10000 });
  });

  // (a) Routine picker displays >50 templates with keyset pagination and #51+ can be started
  test('Routine picker displays >50 templates with keyset pagination and #51+ can be started', async ({ page }) => {
    await loginAsAthlete(page);
    await page.goto('/workout');
    await page.waitForURL('**/workout');

    // Open Routine Picker Modal
    const routineBtn = page.locator('[data-testid="routine-select-btn"]');
    await expect(routineBtn).toBeVisible({ timeout: 10000 });
    await routineBtn.click();

    const modal = page.locator('[data-testid="routine-picker-modal"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Keyset pagination: With 55 templates seeded, page 1 has 50 items.
    // The "Load more routines" button is unconditionally present.
    const loadMoreBtn = page.locator('[data-testid="load-more-routines-btn"]');
    await expect(loadMoreBtn).toBeVisible({ timeout: 10000 });
    await loadMoreBtn.click();

    // Verify template #55 is rendered and selectable
    const routine55 = page.locator('button:has-text("P4 Test Routine 55")').first();
    await expect(routine55).toBeVisible({ timeout: 10000 });

    // Click to start template #55
    await routine55.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Verify active routine updated to P4 Test Routine 55
    await expect(routineBtn).toContainText('P4 Test Routine 55');
  });

  // (b) Exercise picker search, custom creation, duplicate check, alias expansion, multi-add, focus
  test('Exercise picker search, custom creation, multi-select, and duplicate prevention', async ({ page }) => {
    await loginAsAthlete(page);
    await page.goto('/workout');
    await page.waitForURL('**/workout');

    // Switch to Free Workout to guarantee empty exercise card slate
    const routineBtn = page.locator('[data-testid="routine-select-btn"]');
    await routineBtn.click();
    const modal = page.locator('[data-testid="routine-picker-modal"]');
    await modal.locator('button:has-text("Free Workout")').click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Open exercise picker unconditionally
    const openPickerBtn = page.locator('[data-testid="empty-add-exercise-btn"], [data-testid="add-exercise-btn"]').first();
    await expect(openPickerBtn).toBeVisible({ timeout: 5000 });
    await openPickerBtn.click();

    const picker = page.locator('[data-testid="exercise-picker-sheet"]');
    await expect(picker).toBeVisible({ timeout: 10000 });

    const searchInput = page.locator('[data-testid="exercise-search-input"]');
    await expect(searchInput).toBeVisible();

    // 1. Create custom 'Zercher Squat' via picker Create row (since seed.sql has no Zercher)
    await searchInput.fill('Zercher Squat');
    const createBtn = page.locator('[data-testid="create-exercise-btn"]');
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await expect(createBtn).toContainText('Create “Zercher Squat”');
    await createBtn.click();

    // Wait for creation to complete (search input is cleared and Zercher Squat row appears)
    await expect(searchInput).toHaveValue('', { timeout: 10000 });
    const zercherRow = page.locator('[data-testid^="exercise-row-"]:has-text("Zercher Squat")').first();
    await expect(zercherRow).toBeVisible({ timeout: 10000 });
    await expect(zercherRow).toHaveAttribute('aria-pressed', 'true');

    // 2. Duplicate prevention check: typing 'Zercher Squat' again displays duplicate message
    await searchInput.fill('Zercher Squat');
    const duplicateMsg = page.locator('[data-testid="create-exercise-duplicate-msg"]');
    await expect(duplicateMsg).toBeVisible({ timeout: 5000 });
    await expect(duplicateMsg).toContainText('already exists');
    await expect(page.locator('[data-testid="create-exercise-btn"]')).toHaveCount(0);

    // 3. Prefix search: search 'zer' finds the newly created Zercher exercise
    await searchInput.fill('zer');
    await expect(zercherRow).toBeVisible({ timeout: 5000 });

    // 4. Alias search: seeded 'bp' expands to 'bench press' and matches 'Incline Bench Press'
    await searchInput.fill('bp');
    const benchRow = page.locator('[data-testid^="exercise-row-"]:has-text("Incline Bench Press")').first();
    await expect(benchRow).toBeVisible({ timeout: 5000 });

    // 5. Multi-select 2 exercises -> 'Add 2 Exercises' -> 2 new cards and document.activeElement inside the first new card
    await searchInput.fill('');
    // Deselect Zercher Squat to test toggle-off behavior unconditionally
    await zercherRow.click();
    await expect(zercherRow).toHaveAttribute('aria-pressed', 'false');

    const row1 = page.locator('[data-testid^="exercise-row-"]:has-text("Cable Lateral Raises")').first();
    const row2 = page.locator('[data-testid^="exercise-row-"]:has-text("Face Pulls")').first();
    await expect(row1).toBeVisible({ timeout: 5000 });
    await expect(row2).toBeVisible({ timeout: 5000 });
    await row1.click();
    await expect(row1).toHaveAttribute('aria-pressed', 'true');
    await row2.click();
    await expect(row2).toHaveAttribute('aria-pressed', 'true');

    const addConfirmBtn = page.locator('[data-testid="picker-confirm-add-btn"]');
    await expect(addConfirmBtn).toContainText('Add 2 Exercises');
    await addConfirmBtn.click();
    await expect(picker).not.toBeVisible({ timeout: 5000 });

    // Verify 2 new cards are rendered in workout
    const card1 = page.locator('[data-card-for-exercise="Cable Lateral Raises"]');
    const card2 = page.locator('[data-card-for-exercise="Face Pulls"]');
    await expect(card1).toBeVisible({ timeout: 5000 });
    await expect(card2).toBeVisible({ timeout: 5000 });

    // Verify focus moved into the first new exercise card
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const el = document.querySelector('[data-card-for-exercise="Cable Lateral Raises"]');
        return Boolean(el && document.activeElement && el.contains(document.activeElement));
      });
    }, { message: 'Focus should move inside the first new exercise card', timeout: 5000 }).toBe(true);
  });
});
