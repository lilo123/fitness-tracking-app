import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkoutFinishReview } from './useWorkoutFinishReview';

describe('useWorkoutFinishReview', () => {
  const dummyExercises = [
    { id: 'ex-1', name: 'Bench Press', category: 'Chest' },
    { id: 'ex-2', name: 'Squat', category: 'Legs' },
  ] as any;

  it('opens sheet when pending sets exist with ghost or draft values', () => {
    const inputDraftsRef = {
      current: {
        'Bench Press_1': { weight: '135', reps: '10' },
      },
    };
    const targetRepCountsRef = { current: { 'Bench Press': 10 } };
    const batchLogSetsMutation = { mutate: vi.fn(), isPending: false } as any;

    const { result } = renderHook(() =>
      useWorkoutFinishReview({
        activeExercises: ['Bench Press'],
        getSetsForExerciseToday: () => [],
        pendingSetId: null,
        pendingDeletedSetIds: new Set(),
        targetSetCounts: { 'Bench Press': 1 },
        targetRepCountsRef,
        inputDraftsRef,
        userLogs: [],
        workoutDate: '2026-09-27',
        exercises: dummyExercises,
        batchLogSetsMutation,
      })
    );

    expect(result.current.isFinishReviewOpen).toBe(false);

    act(() => {
      result.current.handleFinishWorkout();
    });

    expect(result.current.isFinishReviewOpen).toBe(true);
    expect(result.current.pendingReviewSets).toHaveLength(1);
    expect(result.current.pendingReviewSets[0]).toEqual({
      exerciseName: 'Bench Press',
      weight: 135,
      reps: 10,
      setIndex: 1,
    });
  });

  it('does not open sheet if all pending sets have no valid values', () => {
    const inputDraftsRef = { current: {} };
    const targetRepCountsRef = { current: {} };
    const batchLogSetsMutation = { mutate: vi.fn(), isPending: false } as any;

    const { result } = renderHook(() =>
      useWorkoutFinishReview({
        activeExercises: ['Bench Press'],
        getSetsForExerciseToday: () => [],
        pendingSetId: null,
        pendingDeletedSetIds: new Set(),
        targetSetCounts: { 'Bench Press': 1 },
        targetRepCountsRef,
        inputDraftsRef,
        userLogs: [], // no previous logs = no ghost sets
        workoutDate: '2026-09-27',
        exercises: dummyExercises,
        batchLogSetsMutation,
      })
    );

    act(() => {
      result.current.handleFinishWorkout();
    });

    expect(result.current.isFinishReviewOpen).toBe(false);
  });

  it('calls batchLogSetsMutation with mapped exerciseId when confirmed', () => {
    const inputDraftsRef = { current: {} };
    const targetRepCountsRef = { current: {} };
    const batchLogSetsMutation = { mutate: vi.fn(), isPending: false } as any;

    const { result } = renderHook(() =>
      useWorkoutFinishReview({
        activeExercises: ['Bench Press'],
        getSetsForExerciseToday: () => [],
        pendingSetId: null,
        pendingDeletedSetIds: new Set(),
        targetSetCounts: {},
        targetRepCountsRef,
        inputDraftsRef,
        userLogs: [],
        workoutDate: '2026-09-27',
        exercises: dummyExercises,
        batchLogSetsMutation,
      })
    );

    act(() => {
      result.current.handleConfirmFinishWithSets([
        { exerciseName: 'Bench Press', weight: 200, reps: 5, setIndex: 1 },
      ]);
    });

    expect(batchLogSetsMutation.mutate).toHaveBeenCalledWith([
      { exerciseName: 'Bench Press', exerciseId: 'ex-1', weight: 200, reps: 5, setIndex: 1 },
    ]);
  });
});
