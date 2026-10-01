import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client';
import type { Query } from '@tanstack/react-query';
import { getOfflineDb, isDbClosedError } from './db';

export const PERSIST_BUSTER = 'rq-v1';
export const PERSIST_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000; // 8 days

export const WHITELIST_ROOTS = [
  'exercises',
  'exercise_catalog',
  'routine_templates',
  'routine_template_detail',
  'workout_sets',
  'workouts',
  'exercise_benchmarks',
  'exercise_stats',
  'users',
] as const;

/**
 * Filter function determining if a query should be persisted to IndexedDB.
 * Persists ONLY whitelisted families with status success per §A3:
 * - exercises (['exercises',...])
 * - exercise_catalog offline-all (A5)
 * - routine_templates (user)
 * - routine_template_detail
 * - workout_sets (byDate, recent90d, history_v2 first 3 pages, exercise_history first page, calendar_month)
 * - workouts.byDate
 * - exercise_benchmarks
 * - exercise_stats
 * - users/profile
 * Explicitly excludes nutrition families (O2).
 */
export function shouldDehydrateQuery(query: Query): boolean {
  if (query.state.status !== 'success') {
    return false;
  }

  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) {
    return false;
  }

  const root = String(key[0]);

  // Explicitly reject nutrition
  if (root === 'nutrition_logs' || root === 'custom_dishes') {
    return false;
  }

  if (root === 'exercises') {
    return true;
  }

  if (root === 'exercise_catalog') {
    // Only offline_all per A5
    return key[1] === 'offline_all';
  }

  if (root === 'routine_templates' || root === 'routine_template_detail') {
    return true;
  }

  if (root === 'workout_sets') {
    // byDate, recent90d, history_v2, exercise_history, calendar_month
    const sub = key[2];
    if (sub === 'recent90d' || sub === 'history_v2' || sub === 'exercise_history' || sub === 'calendar_month') {
      return true;
    }
    // Date-keyed: e.g. ['workout_sets', userId, '2026-09-30']
    if (typeof sub === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sub)) {
      return true;
    }
    // Or ['workout_sets', date]
    if (typeof key[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key[1])) {
      return true;
    }
    return false;
  }

  if (root === 'workouts') {
    // workouts.byDate
    return true;
  }

  if (root === 'exercise_benchmarks' || root === 'exercise_stats') {
    return true;
  }

  if (root === 'users' || root === 'athlete_profile') {
    return true;
  }

  return false;
}

/**
 * Applies page caps to dehydrated infinite queries before writing to IndexedDB:
 * - history_v2: at most 3 pages
 * - exercise_history: at most 1 page
 */
export function applyPageCaps(persistedClient: PersistedClient): PersistedClient {
  const cloned = structuredClone(persistedClient);
  const queries = cloned.clientState?.queries;
  if (!Array.isArray(queries)) return cloned;

  for (const q of queries) {
    const key = q.queryKey;
    if (key?.[0] === 'workout_sets') {
      const sub = key[2];
      const data = q.state?.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
      if (data && Array.isArray(data.pages)) {
        if (sub === 'history_v2' && data.pages.length > 3) {
          data.pages = data.pages.slice(0, 3);
          if (Array.isArray(data.pageParams)) {
            data.pageParams = data.pageParams.slice(0, 3);
          }
        } else if (sub === 'exercise_history' && data.pages.length > 1) {
          data.pages = data.pages.slice(0, 1);
          if (Array.isArray(data.pageParams)) {
            data.pageParams = data.pageParams.slice(0, 1);
          }
        }
      }
    }
  }

  return cloned;
}

/**
 * Creates a custom React Query persister storing cache in `cybergym-offline-<userId>` IndexedDB store `rq`.
 */
export function createIdbPersister(userId: string): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const capped = applyPageCaps(client);
        const db = await getOfflineDb(userId);
        await db.put('rq', capped, 'client');
      } catch (err) {
        // Read-cache write failed: absorb if DB connection is closing/closed during teardown, warn otherwise
        if (!isDbClosedError(err)) {
          console.warn('[persister] persistClient failed:', err);
        }
      }
    },
    restoreClient: async () => {
      try {
        const db = await getOfflineDb(userId);
        const stored = await db.get('rq', 'client');
        return (stored as PersistedClient) || undefined;
      } catch (err) {
        // Read-cache restore failed: absorb if DB connection is closing/closed during teardown, warn otherwise
        if (!isDbClosedError(err)) {
          console.warn('[persister] restoreClient failed:', err);
        }
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        const db = await getOfflineDb(userId);
        await db.delete('rq', 'client');
      } catch (err) {
        // Read-cache remove failed: absorb if DB connection is closing/closed during teardown, warn otherwise
        if (!isDbClosedError(err)) {
          console.warn('[persister] removeClient failed:', err);
        }
      }
    },
  };
}
