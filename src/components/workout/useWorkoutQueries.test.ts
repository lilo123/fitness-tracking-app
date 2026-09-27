import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWorkoutQueries } from './useWorkoutQueries';
import { supabase } from '../../lib/supabase';

describe('useWorkoutQueries (P2 / W1 / W2 / W11 / W16 / W50 / L11)', () => {
  let queryClient: QueryClient;
  const targetUserId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('W11: exposes isExercisesError and exercisesError when exercises query fails', async () => {
    const errorSpy = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'exercises') {
        const b: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('Exercises query network failure'),
          }),
        };
        return b;
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });

    const { result } = renderHook(
      () => useWorkoutQueries(targetUserId, '2026-09-27'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isExercisesError).toBe(true);
    });

    expect(result.current.exercisesError?.message).toBe('Exercises query network failure');
    errorSpy.mockRestore();
  });

  it('W16 & L11: queries exercises with is_archived = false', async () => {
    const eqSpy = vi.fn().mockReturnThis();
    const selectSpy = vi.fn().mockReturnValue({
      eq: eqSpy,
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({
          data: [
            { id: 'ex-1', name: 'Active Exercise', body_part: 'Chest', is_master: true, is_archived: false },
          ],
          error: null,
        }),
      }),
    });

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'exercises') {
        return {
          select: selectSpy,
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });

    const { result } = renderHook(
      () => useWorkoutQueries(targetUserId, '2026-09-27'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.exercisesFetched).toBe(true);
    });

    // select does not need is_archived in projection
    expect(eqSpy).toHaveBeenCalledWith('is_archived', false);
  });

  it('W2: refetches when workoutDate changes', async () => {
    let queriedDate = '';
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'workouts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockImplementation((_col: string, val: string) => {
            queriedDate = val.split('T')[0];
            return {
              lte: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        limit: vi.fn().mockReturnThis(),
      } as any;
    });

    const { result, rerender } = renderHook(
      ({ date }: { date: string }) => useWorkoutQueries(targetUserId, date),
      { wrapper, initialProps: { date: '2026-09-20' } }
    );

    await waitFor(() => {
      expect(result.current.logsFetched).toBe(true);
    });
    expect(queriedDate).toBe('2026-09-20');

    // Change date to 2026-09-27
    rerender({ date: '2026-09-27' });

    await waitFor(() => {
      expect(queriedDate).toBe('2026-09-27');
    });
  });

  it('W1, W31, W42, H10: queries get_exercise_benchmarks RPC and merges today sets', async () => {
    const exerciseUUID = '00000000-0000-4000-8000-000000000010';
    (supabase as any).rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'get_exercise_benchmarks') {
        return Promise.resolve({
          data: [
            {
              exercise_id: exerciseUUID,
              pr_weight: 200,
              pr_reps: 8,
              pr_date: '2026-09-01',
              pr_workout_id: 'w-1',
              last_date: '2026-09-20',
              last_workout_id: 'w-2',
              last_sets: [
                { id: 's-1', weight: 185, reps: 8, set_index: 0, set_type: 'working' },
                { id: 's-2', weight: 185, reps: 8, set_index: 1, set_type: 'working' },
              ],
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                { id: exerciseUUID, name: 'Bench Press', body_part: 'Chest', is_master: true },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });

    const { result } = renderHook(
      () => useWorkoutQueries(targetUserId, '2026-09-27'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.benchmarksFetched).toBe(true);
    });

    expect(result.current.benchmarks[exerciseUUID]).toBeDefined();
    expect(result.current.benchmarks[exerciseUUID].pr?.weight).toBe(200);
    expect(result.current.benchmarks[exerciseUUID].lastSession?.date).toBe('2026-09-20');
    expect(result.current.benchmarks[exerciseUUID].lastSession?.summaryText).toBe('185×8, 185×8');
  });

  it('W3: queries get_routine_catalog RPC with p_limit: 200 when targetUserId is provided', async () => {
    const routineId = '00000000-0000-4000-8000-000000000020';
    let rpcCalledWith: any = null;

    (supabase as any).rpc = vi.fn().mockImplementation((fn: string, params: any) => {
      if (fn === 'get_routine_catalog') {
        rpcCalledWith = { fn, params };
        return Promise.resolve({
          data: [
            {
              id: routineId,
              name: 'Leg Day Catalog',
              is_master: false,
              user_id: targetUserId,
              assigned_to: null,
              days_of_week: ['Sun'],
              exercises: [{ id: 'te-leg-1', exercise: { name: 'Leg Curl' } }],
              created_at: '2026-09-01T00:00:00Z',
              total_count: 1,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'exercises') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                { id: 'ex-leg-1', name: 'Leg Curl', body_part: 'Legs', is_master: true },
              ],
              error: null,
            }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any;
    });

    const { result } = renderHook(
      () => useWorkoutQueries(targetUserId, '2026-09-27'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.templatesFetched).toBe(true);
    });

    expect(rpcCalledWith).toEqual({
      fn: 'get_routine_catalog',
      params: {
        p_user_id: targetUserId,
        p_limit: 200,
        p_cursor: null,
      },
    });
    expect(result.current.customTemplates.some((t) => t.name === 'Leg Day Catalog')).toBe(true);
  });
});
