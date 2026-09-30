import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  runOfflinePrefetch,
  useOfflinePrefetch,
  PREFETCH_THROTTLE_MS,
  PREFETCH_STORAGE_KEY_PREFIX,
} from './useOfflinePrefetch';
import * as exercisesModule from '../lib/exercises';
import * as workoutQueriesModule from '../components/workout/useWorkoutQueries';
import * as onlineStatusModule from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
  supabase: {
    ['from']: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('useOfflinePrefetch', () => {
  let queryClient: QueryClient;
  const mockUserId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.spyOn(exercisesModule, 'fetchExerciseCatalogPage').mockResolvedValue({
      items: [
        {
          id: 'ex-1',
          name: 'Bench Press',
          body_parts: ['chest'],
          equipment: 'barbell',
          is_master: true,
          user_id: null,
          is_archived: false,
          is_hidden: false,
        },
      ],
      nextCursor: null,
      totalCount: 1,
    });

    (supabase.rpc as any).mockImplementation((fn: string) => {
      if (fn === 'get_routine_catalog') {
        return Promise.resolve({
          data: [
            {
              id: 'tmpl-1',
              user_id: mockUserId,
              name: 'Push Day',
              is_master: false,
              assigned_to: null,
              days_of_week: ['Mon'],
              created_at: '2026-09-01T00:00:00Z',
            },
          ],
          error: null,
        });
      }
      if (fn === 'get_exercise_stats') {
        return Promise.resolve({
          data: [{ exercise_id: 'ex-1', set_count: 5, max_weight: 225, pr_reps: 5 }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    vi.spyOn(workoutQueriesModule, 'fetchTemplateDetail').mockResolvedValue({
      id: 'tmpl-1',
      exercises: [
        {
          id: 'te-1',
          template_id: 'tmpl-1',
          exercise_id: 'ex-1',
          order_index: 0,
          target_sets: 3,
          target_reps: 10,
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefetches catalog, routines, details, and stats when online', async () => {
    const success = await runOfflinePrefetch(queryClient, mockUserId, true);
    expect(success).toBe(true);

    // Verify exercise catalog cache
    const catalog = queryClient.getQueryData(['exercise_catalog', 'offline_all', mockUserId]);
    expect(catalog).toBeDefined();
    expect((catalog as any[])[0].name).toBe('Bench Press');

    // Verify routine templates cache
    const templates = queryClient.getQueryData(['routine_templates', mockUserId, 'workout']);
    expect(templates).toBeDefined();
    expect((templates as any[])[0].name).toBe('Push Day');

    // Verify template detail cache
    const detail = queryClient.getQueryData(['routine_template_detail', 'tmpl-1']);
    expect(detail).toBeDefined();

    // Verify localStorage throttle set
    const key = `${PREFETCH_STORAGE_KEY_PREFIX}${mockUserId}`;
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('throttles within 12 hours unless force is true', async () => {
    const key = `${PREFETCH_STORAGE_KEY_PREFIX}${mockUserId}`;
    localStorage.setItem(key, String(Date.now()));

    // Run again without force -> should skip
    const skipped = await runOfflinePrefetch(queryClient, mockUserId, false);
    expect(skipped).toBe(false);

    // Run with force -> should run
    const forced = await runOfflinePrefetch(queryClient, mockUserId, true);
    expect(forced).toBe(true);
  });

  it('runs prefetch after 12 hours elapsed', async () => {
    const key = `${PREFETCH_STORAGE_KEY_PREFIX}${mockUserId}`;
    const thirteenHoursAgo = Date.now() - (PREFETCH_THROTTLE_MS + 1000);
    localStorage.setItem(key, String(thirteenHoursAgo));

    const ran = await runOfflinePrefetch(queryClient, mockUserId, false);
    expect(ran).toBe(true);
  });

  it('hook skips prefetch when offline', () => {
    vi.spyOn(onlineStatusModule, 'useOnlineStatus').mockReturnValue(false);

    renderHook(() => useOfflinePrefetch(mockUserId), {
      wrapper: ({ children }: { children?: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children),
    });

    const catalog = queryClient.getQueryData(['exercise_catalog', 'offline_all', mockUserId]);
    expect(catalog).toBeUndefined();
  });
});
