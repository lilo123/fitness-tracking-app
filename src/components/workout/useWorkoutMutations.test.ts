import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWorkoutMutations } from './useWorkoutMutations';
import * as setsLib from '../../lib/sets';
import * as invalidateLib from '../../lib/invalidate';
import { workoutSessionStore } from '../../utils/workoutSessionStore';

describe('useWorkoutMutations (P2 / W4 / W20 / W35 / H2)', () => {
  let queryClient: QueryClient;
  const mockSetMutationError = vi.fn();
  const targetUserId = '00000000-0000-0000-0000-000000000001';
  const workoutDate = '2026-09-27';
  const exerciseId = '00000000-0000-0000-0000-000000000002';
  const exercises = [
    { id: exerciseId, name: 'Bench Press', body_part: 'Chest', is_master: true },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    workoutSessionStore.resetForTesting();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('W35: optimistically updates cache on logSet and rolls back on failure', async () => {
    const queryKey = ['workout_sets', targetUserId, workoutDate];
    queryClient.setQueryData(queryKey, [
      { id: 'existing-1', weight: 185, reps: 5, set_index: 1, workout_date: workoutDate },
    ]);

    // Mock insert failure
    vi.spyOn(setsLib, 'getOrCreateWorkout').mockResolvedValue('w-123');
    vi.spyOn(setsLib, 'insertSet').mockRejectedValue(new Error('Network insert failure'));

    const { result } = renderHook(
      () =>
        useWorkoutMutations({
          targetUserId,
          workoutDate,
          activeRoutineName: 'Chest Day',
          exercises: exercises as any,
          autoRestTimer: false,
          setMutationError: mockSetMutationError,
        }),
      { wrapper }
    );

    await act(async () => {
      try {
        await result.current.logSetMutation.mutateAsync({
          exerciseName: 'Bench Press',
          weight: 225,
          reps: 3,
          setIndex: 2,
        });
      } catch {
        // Expected mutation failure
      }
    });

    // Error banner was called with the failure message
    expect(mockSetMutationError).toHaveBeenCalledWith('Network insert failure');

    // Cache must have rolled back to the initial 1 set
    const currentData = queryClient.getQueryData<any[]>(queryKey);
    expect(currentData).toHaveLength(1);
    expect(currentData?.[0].id).toBe('existing-1');
  });

  it('W4: preserves draft inputs on mutation failure and clears them on success', async () => {
    // Stage draft input in workoutSessionStore
    workoutSessionStore.getOrInitSession(targetUserId, workoutDate, {
      routineName: 'Chest Day',
      exercises: ['Bench Press'],
      targetSetCounts: { 'Bench Press': 3 },
      targetRepCounts: { 'Bench Press': 5 },
    });
    workoutSessionStore.setDraftInput(targetUserId, workoutDate, exerciseId, 1, {
      weight: '225',
      reps: '5',
    });
    workoutSessionStore.flushPendingWrites();

    // 1. Failure case: insert fails -> draft must NOT be wiped
    vi.spyOn(setsLib, 'getOrCreateWorkout').mockResolvedValue('w-123');
    vi.spyOn(setsLib, 'insertSet').mockRejectedValueOnce(new Error('500 DB error'));

    const { result } = renderHook(
      () =>
        useWorkoutMutations({
          targetUserId,
          workoutDate,
          activeRoutineName: 'Chest Day',
          exercises: exercises as any,
          autoRestTimer: false,
          setMutationError: mockSetMutationError,
        }),
      { wrapper }
    );

    await act(async () => {
      try {
        await result.current.logSetMutation.mutateAsync({
          exerciseName: 'Bench Press',
          weight: 225,
          reps: 5,
          setIndex: 1,
        });
      } catch {
        // Expected
      }
    });

    // Draft must still be intact
    const sessionAfterFail = workoutSessionStore.getSession(targetUserId, workoutDate);
    expect(sessionAfterFail?.inputDrafts[`${exerciseId}_1`]).toEqual({
      weight: '225',
      reps: '5',
    });

    // 2. Success case: insert succeeds -> draft must be cleared
    vi.spyOn(setsLib, 'insertSet').mockResolvedValueOnce({
      id: 'logged-set-1',
      workout_id: 'w-123',
      exercise_id: exerciseId,
      weight: 225,
      reps: 5,
      set_index: 1,
      set_type: 'working',
      rpe: null,
      created_at: new Date().toISOString(),
    });

    await act(async () => {
      await result.current.logSetMutation.mutateAsync({
        exerciseName: 'Bench Press',
        weight: 225,
        reps: 5,
        setIndex: 1,
      });
    });

    const sessionAfterSuccess = workoutSessionStore.getSession(targetUserId, workoutDate);
    expect(sessionAfterSuccess?.inputDrafts[`${exerciseId}_1`]).toBeUndefined();
  });

  it('W20 & H2: invalidates workout-derived queries via invalidateWorkoutDerived', async () => {
    const invalidateSpy = vi.spyOn(invalidateLib, 'invalidateWorkoutDerived').mockResolvedValue();
    vi.spyOn(setsLib, 'getOrCreateWorkout').mockResolvedValue('w-123');
    vi.spyOn(setsLib, 'insertSet').mockResolvedValue({
      id: 'logged-set-1',
      workout_id: 'w-123',
      exercise_id: exerciseId,
      weight: 185,
      reps: 8,
      set_index: 1,
      set_type: 'working',
      rpe: null,
      created_at: new Date().toISOString(),
    });

    const { result } = renderHook(
      () =>
        useWorkoutMutations({
          targetUserId,
          workoutDate,
          activeRoutineName: 'Chest Day',
          exercises: exercises as any,
          autoRestTimer: false,
          setMutationError: mockSetMutationError,
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.logSetMutation.mutateAsync({
        exerciseName: 'Bench Press',
        weight: 185,
        reps: 8,
        setIndex: 1,
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.anything(), targetUserId);
  });
});
