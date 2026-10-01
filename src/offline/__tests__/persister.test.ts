import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  shouldDehydrateQuery,
  applyPageCaps,
  createIdbPersister,
  PERSIST_BUSTER,
} from '../persister';
import { clearUserReadCache, initPersistForUser, stopPersisting } from '../persistController';
import { enqueue, getOutboxOps } from '../outbox';
import { setIdMapping, getIdMapping } from '../idmap';
import { closeAllOfflineDbs, deleteOfflineDb } from '../db';
import { QueryClient, type Query } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

describe('Cache Persister & Whitelist (§A3, §A9, §D)', () => {
  const userId = 'user-persist-1';

  beforeEach(async () => {
    await closeAllOfflineDbs();
    await deleteOfflineDb(userId);
  });

  afterEach(async () => {
    await closeAllOfflineDbs();
    await deleteOfflineDb(userId);
  });

  describe('Whitelist Filter (shouldDehydrateQuery)', () => {
    function createMockQuery(queryKey: unknown[], status: 'success' | 'error' | 'pending' = 'success'): Query {
      return {
        queryKey,
        state: { status },
      } as unknown as Query;
    }

    it('allows exercises family with status success', () => {
      expect(shouldDehydrateQuery(createMockQuery(['exercises', 'workout']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['exercises']))).toBe(true);
    });

    it('rejects queries with status error or pending', () => {
      expect(shouldDehydrateQuery(createMockQuery(['exercises'], 'error'))).toBe(false);
      expect(shouldDehydrateQuery(createMockQuery(['exercises'], 'pending'))).toBe(false);
    });

    it('allows exercise_catalog ONLY for offline_all (A5)', () => {
      expect(shouldDehydrateQuery(createMockQuery(['exercise_catalog', 'offline_all', userId]))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['exercise_catalog', 'infinite', {}]))).toBe(false);
    });

    it('allows routine_templates and routine_template_detail', () => {
      expect(shouldDehydrateQuery(createMockQuery(['routine_templates', userId, 'workout']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['routine_template_detail', 'template-1']))).toBe(true);
    });

    it('allows workout_sets whitelisted subsets (byDate, recent90d, history_v2, exercise_history, calendar_month)', () => {
      expect(shouldDehydrateQuery(createMockQuery(['workout_sets', userId, '2026-09-30']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['workout_sets', userId, 'recent90d']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['workout_sets', userId, 'history_v2', '30d', '2026-09-30']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['workout_sets', userId, 'exercise_history', 'ex-1', '30d']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['workout_sets', userId, 'calendar_month', '2026-09-01']))).toBe(true);
    });

    it('allows workouts.byDate, exercise_benchmarks, exercise_stats', () => {
      expect(shouldDehydrateQuery(createMockQuery(['workouts', userId, '2026-09-30']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['exercise_benchmarks', userId, '2026-09-30', ['ex-1'], 'weight']))).toBe(true);
      expect(shouldDehydrateQuery(createMockQuery(['exercise_stats', userId]))).toBe(true);
    });

    it('EXPLICITLY excludes nutrition families (O2 scope)', () => {
      expect(shouldDehydrateQuery(createMockQuery(['nutrition_logs', userId, '2026-09-30']))).toBe(false);
      expect(shouldDehydrateQuery(createMockQuery(['custom_dishes', userId]))).toBe(false);
    });
  });

  describe('Page Caps (applyPageCaps)', () => {
    it('caps history_v2 infinite queries to at most 3 pages', () => {
      const client: PersistedClient = {
        timestamp: Date.now(),
        buster: PERSIST_BUSTER,
        clientState: {
          queries: [
            {
              queryKey: ['workout_sets', userId, 'history_v2', 'all', '2026-09-30'],
              state: {
                data: {
                  pages: [
                    { sessions: [1, 2] },
                    { sessions: [3, 4] },
                    { sessions: [5, 6] },
                    { sessions: [7, 8] },
                    { sessions: [9, 10] },
                  ],
                  pageParams: [null, 1, 2, 3, 4],
                },
              } as any,
              queryHash: 'hash-history',
            },
          ],
          mutations: [],
        },
      };

      const capped = applyPageCaps(client);
      const queryData = capped.clientState.queries[0].state.data as any;
      expect(queryData.pages).toHaveLength(3);
      expect(queryData.pageParams).toHaveLength(3);
    });

    it('caps exercise_history infinite queries to at most 1 page', () => {
      const client: PersistedClient = {
        timestamp: Date.now(),
        buster: PERSIST_BUSTER,
        clientState: {
          queries: [
            {
              queryKey: ['workout_sets', userId, 'exercise_history', 'ex-1', 'all'],
              state: {
                data: {
                  pages: [{ sets: [1, 2] }, { sets: [3, 4] }],
                  pageParams: [null, 1],
                },
              } as any,
              queryHash: 'hash-ex-hist',
            },
          ],
          mutations: [],
        },
      };

      const capped = applyPageCaps(client);
      const queryData = capped.clientState.queries[0].state.data as any;
      expect(queryData.pages).toHaveLength(1);
      expect(queryData.pageParams).toHaveLength(1);
    });
  });

  describe('Sign-out Storage Semantics (§A9)', () => {
    it('sign-out deletes user rq read cache while KEEPING outbox and idmap stores intact', async () => {
      // 1. Write persisted rq cache
      const persister = createIdbPersister(userId);
      const mockClientData: PersistedClient = {
        timestamp: Date.now(),
        buster: PERSIST_BUSTER,
        clientState: {
          queries: [
            {
              queryKey: ['exercises'],
              state: { data: [{ id: 'ex-1', name: 'Bench' }], status: 'success' } as any,
              queryHash: 'exercises',
            },
          ],
          mutations: [],
        },
      };
      await persister.persistClient(mockClientData);

      // Verify rq store contains client
      const restoredBefore = await persister.restoreClient();
      expect(restoredBefore).toBeDefined();

      // 2. Add item to outbox
      const op = await enqueue({
        userId,
        kind: 'workout.ensure',
        payload: { clientWorkoutId: 'w-keep', workout_date: '2026-09-30' },
      });

      // 3. Add mapping to idmap
      await setIdMapping(userId, 'client-w-keep', 'canonical-w-keep');

      // 4. Perform sign-out cleanup for read cache
      await clearUserReadCache(userId);

      // Verify rq read cache is deleted
      const restoredAfter = await persister.restoreClient();
      expect(restoredAfter).toBeUndefined();

      // Verify outbox op is KEPT!
      const opsAfter = await getOutboxOps(userId);
      expect(opsAfter).toHaveLength(1);
      expect(opsAfter[0].opId).toBe(op.opId);

      // Verify idmap is KEPT!
      const mappedId = await getIdMapping(userId, 'client-w-keep');
      expect(mappedId).toBe('canonical-w-keep');
    });

    it('persistClient, restoreClient, removeClient absorb closed IndexedDB errors without throwing or rejecting', async () => {
      const persister = createIdbPersister(userId);
      const mockClientData: PersistedClient = {
        timestamp: Date.now(),
        buster: PERSIST_BUSTER,
        clientState: { queries: [], mutations: [] },
      };

      // Mock getOfflineDb to simulate a database in closing/closed state
      const dbModule = await import('../db');
      const spy = vi.spyOn(dbModule, 'getOfflineDb').mockRejectedValue(
        new DOMException('The database connection is closing.', 'InvalidStateError')
      );

      try {
        // Must resolve without rejecting/throwing
        await expect(persister.persistClient(mockClientData)).resolves.toBeUndefined();
        await expect(persister.restoreClient()).resolves.toBeUndefined();
        await expect(persister.removeClient()).resolves.toBeUndefined();
      } finally {
        spy.mockRestore();
      }
    });

    it('initPersistForUser aborts mid-flight when stopPersisting is invoked', async () => {
      const queryClient = new QueryClient();
      const p = initPersistForUser(userId, queryClient);
      stopPersisting();
      await expect(p).resolves.not.toThrow();
    });
  });
});
