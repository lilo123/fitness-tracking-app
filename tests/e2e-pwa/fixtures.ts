import { execSync } from 'child_process';
import { expect, type Page, type BrowserContext } from '@playwright/test';

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
      return `psql "${process.env.DATABASE_URL}" -t -A -v ON_ERROR_STOP=1`;
    }
    if (
      (parsed.port && parsed.port !== '58822') ||
      (parsed.hostname && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')
    ) {
      return `psql -h "${parsed.hostname}" -p "${parsed.port || '5432'}" -U "${parsed.username || 'postgres'}" -d "${parsed.pathname.slice(1) || 'postgres'}" -t -A -v ON_ERROR_STOP=1`;
    }
  }
  return `psql "${DB_URL}" -t -A -v ON_ERROR_STOP=1`;
}

export function execPsql(sql: string): string {
  const cmd = getPsqlCommand();
  try {
    return execSync(cmd, { input: sql, encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('[fixtures] PSQL error executing SQL:', sql, err);
    throw err;
  }
}

export function countRows(table: string, whereClause: string): number {
  const sql = `SELECT count(*) FROM ${table} WHERE ${whereClause};`;
  const raw = execPsql(sql);
  const count = parseInt(raw, 10);
  return isNaN(count) ? 0 : count;
}

export function queryRows<T = Record<string, unknown>>(sql: string): T[] {
  const wrapped = `SELECT coalesce(json_agg(t), '[]'::json)::text FROM (${sql.replace(/;$/, '')}) t;`;
  const raw = execPsql(wrapped);
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export interface PwaTestUser {
  id: string;
  email: string;
  password: string;
  routineId: string;
  exerciseId: string;
  exerciseName: string;
}

/**
 * Creates a unique user for test isolation, with profile and pinned 7-day routine.
 * Never depends on weekday: routine explicitly covers Mon..Sun.
 */
export async function createPwaTestUser(prefix = 'pwa-user'): Promise<PwaTestUser> {
  const email = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}@cybergym.io`;
  const password = 'Password123!';

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`Failed to signup PWA test user: ${res.status} ${await res.text()}`);
  }

  const signupJson = await res.json();
  const userId = signupJson.user?.id;
  if (!userId) {
    throw new Error('Signup did not return user id');
  }

  // Seed user profile and pinned routine (all 7 days: never depends on weekday)
  const seedSql = `
    INSERT INTO public.users (id, email, username, role, weight_unit, pr_mode)
    VALUES ('${userId}', '${email}', 'PWA Tester', 'athlete', 'lb', 'weight')
    ON CONFLICT (id) DO UPDATE SET username = 'PWA Tester', role = 'athlete', weight_unit = 'lb', pr_mode = 'weight';

    DO $$
    DECLARE
      v_eid uuid;
      v_ename text;
      v_rid uuid := gen_random_uuid();
      v_reid uuid := gen_random_uuid();
    BEGIN
      SELECT id, name INTO v_eid, v_ename FROM public.exercises WHERE is_master = true ORDER BY name LIMIT 1;
      INSERT INTO public.routine_templates (id, user_id, name, is_master, days_of_week)
      VALUES (v_rid, '${userId}', 'PWA Pinned Routine', false, '{"Mon","Tue","Wed","Thu","Fri","Sat","Sun"}');
      INSERT INTO public.template_exercises (id, template_id, exercise_id, order_index, target_sets, target_reps)
      VALUES (v_reid, v_rid, v_eid, 1, 3, 10);
      CREATE TEMP TABLE tmp_pwa_seed AS
      SELECT '${userId}'::text AS uid, v_rid::text AS rid, v_eid::text AS eid, v_ename AS ename;
    END $$;
    SELECT uid || '|' || rid || '|' || eid || '|' || ename FROM tmp_pwa_seed;
  `;

  const rawMeta = execPsql(seedSql);
  const parts = rawMeta.split('|').map((s) => s.trim());
  const routineId = parts[1] || '';
  const exerciseId = parts[2] || '';
  const exerciseName = parts[3] || '';

  return {
    id: userId,
    email,
    password,
    routineId,
    exerciseId,
    exerciseName,
  };
}

/**
 * Cleans up all user data, routines, sets, and auth record.
 * Any cleanup failure is rethrown per lesson rules.
 */
export function cleanupPwaTestUser(user: { id?: string; email?: string }): void {
  const whereClauses: string[] = [];
  if (user.email) whereClauses.push(`email = '${user.email}'`);
  if (user.id) whereClauses.push(`id = '${user.id}'`);
  if (whereClauses.length === 0) return;

  const idSubquery = `SELECT id FROM auth.users WHERE ${whereClauses.join(' OR ')}`;

  const cleanupSql = `
    DELETE FROM public.coach_athlete_links WHERE athlete_id IN (${idSubquery});
    DELETE FROM public.template_exercises WHERE template_id IN (
      SELECT id FROM public.routine_templates WHERE user_id IN (${idSubquery})
    );
    DELETE FROM public.routine_templates WHERE user_id IN (${idSubquery});
    DELETE FROM public.sets WHERE workout_id IN (
      SELECT id FROM public.workouts WHERE user_id IN (${idSubquery})
    );
    DELETE FROM public.workouts WHERE user_id IN (${idSubquery});
    DELETE FROM public.users WHERE id IN (${idSubquery});
    DELETE FROM auth.users WHERE ${whereClauses.join(' OR ')};
  `;

  try {
    execPsql(cleanupSql);
  } catch (err) {
    console.error('[fixtures] Cleanup error (rethrown):', err);
    throw err;
  }
}

/**
 * Signs in a user using the standard credentials form.
 */
export async function signInUser(
  page: Page,
  user: { email: string; password?: string }
): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password || 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/workout');
  const routineOrChoose = page
    .locator('[data-testid="routine-select-btn"]')
    .or(page.locator('button:has-text("Choose Routine")'));
  await expect(routineOrChoose.first()).toBeVisible({ timeout: 15000 });
}

/**
 * Waits for service worker ready and ensures the active page is controlled by it.
 * Uses web-first polling via expect.poll with zero waitForTimeout calls.
 */
export async function waitForSwControl(page: Page, timeout = 15000): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('serviceWorker not supported in navigator');
    }
    await navigator.serviceWorker.ready;
  });

  const controlledInitial = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!controlledInitial) {
    await page.reload();
  }

  await expect
    .poll(
      async () => {
        return page.evaluate(() => Boolean(navigator.serviceWorker.controller));
      },
      {
        message: 'Expected navigator.serviceWorker.controller to be present',
        timeout,
      }
    )
    .toBe(true);
}

/**
 * Emulates offline network state on browser context.
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
}

/**
 * Restores online network state on browser context.
 */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.setOffline(false);
}
