import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkoutSetCommit } from './useWorkoutSetCommit';

describe('useWorkoutSetCommit', () => {
  const dummyExercises = [
    { id: '00000000-0000-0000-0000-000000000001', name: 'Bench Press', category: 'Chest' },
  ] as any;

  it('commits set with draft values when present', () => {
    const logSetMutation = { mutate: vi.fn() } as any;
    const batchLogSetsMutation = { mutate: vi.fn() } as any;
    const setMutationError = vi.fn();
    const inputDraftsRef = {
      current: {
        'Bench Press_1': { weight: '150', reps: '8' },
      },
    };
    const targetRepCountsRef = { current: {} };

    const { result } = renderHook(() =>
      useWorkoutSetCommit({
        exercises: dummyExercises,
        inputDraftsRef,
        targetRepCountsRef,
        logSetMutation,
        batchLogSetsMutation,
        setMutationError,
      })
    );

    act(() => {
      result.current.handleCommitSet('Bench Press', 1, { weight: 135, reps: 10 });
    });

    expect(logSetMutation.mutate).toHaveBeenCalledWith({
      exerciseName: 'Bench Press',
      exerciseId: '00000000-0000-0000-0000-000000000001',
      weight: 150,
      reps: 8,
      setIndex: 1,
    });
    expect(setMutationError).not.toHaveBeenCalled();
  });

  it('falls back to ghost values when drafts are absent', () => {
    const logSetMutation = { mutate: vi.fn() } as any;
    const batchLogSetsMutation = { mutate: vi.fn() } as any;
    const setMutationError = vi.fn();
    const inputDraftsRef = { current: {} };
    const targetRepCountsRef = { current: {} };

    const { result } = renderHook(() =>
      useWorkoutSetCommit({
        exercises: dummyExercises,
        inputDraftsRef,
        targetRepCountsRef,
        logSetMutation,
        batchLogSetsMutation,
        setMutationError,
      })
    );

    act(() => {
      result.current.handleCommitSet('Bench Press', 1, { weight: 135, reps: 10 });
    });

    expect(logSetMutation.mutate).toHaveBeenCalledWith({
      exerciseName: 'Bench Press',
      exerciseId: '00000000-0000-0000-0000-000000000001',
      weight: 135,
      reps: 10,
      setIndex: 1,
    });
  });

  it('rejects invalid/empty values with error message', () => {
    const logSetMutation = { mutate: vi.fn() } as any;
    const batchLogSetsMutation = { mutate: vi.fn() } as any;
    const setMutationError = vi.fn();
    const inputDraftsRef = { current: {} };
    const targetRepCountsRef = { current: {} };

    const { result } = renderHook(() =>
      useWorkoutSetCommit({
        exercises: dummyExercises,
        inputDraftsRef,
        targetRepCountsRef,
        logSetMutation,
        batchLogSetsMutation,
        setMutationError,
      })
    );

    act(() => {
      result.current.handleCommitSet('Bench Press', 1, { weight: '', reps: '' });
    });

    expect(logSetMutation.mutate).not.toHaveBeenCalled();
    expect(setMutationError).toHaveBeenCalledWith('Please enter weight and reps or use previous set values.');
  });
});
